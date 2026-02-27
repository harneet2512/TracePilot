import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Lazy singleton pattern to avoid top-level await (CJS compatibility)
type DbType = NodePgDatabase<typeof schema> | BetterSQLite3Database<typeof schema>;

let _pool: pg.Pool | null = null;
let _db: DbType | null = null;
let _initialized = false;

async function initDb(): Promise<{ db: DbType; pool: pg.Pool | null }> {
  if (_initialized && _db) {
    return { db: _db, pool: _pool };
  }

  // Handle proof mode
  if (process.env.PROOF_MODE === "1") {
    process.env.DATABASE_URL = "file:proof/db.sqlite";
    process.env.DATABASE_DIALECT = "sqlite";
  }

  // SQLite fallback for development when DATABASE_URL is not set
  if (!process.env.DATABASE_URL && process.env.NODE_ENV === "development") {
    process.env.DATABASE_URL = "file:.data/dev.db";
    process.env.DATABASE_DIALECT = "sqlite";
    console.log("[DB] DATABASE_URL not set - using SQLite at .data/dev.db for development");
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }

  const dbUrl = process.env.DATABASE_URL;
  const isSQLite = process.env.DATABASE_DIALECT === "sqlite" || dbUrl.startsWith("file:");

  if (isSQLite) {
    console.log(`[DB] Connecting to SQLite: ${dbUrl}`);
    const { default: Database } = await import("better-sqlite3");
    const { drizzle: drizzleSqlite } = await import("drizzle-orm/better-sqlite3");
    const { mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");

    const sqlitePath = dbUrl.replace("file:", "");
    try {
      await mkdir(dirname(sqlitePath), { recursive: true });
    } catch {
      // Directory may already exist
    }
    const sqlite = new Database(sqlitePath);
    // Register PostgreSQL-compatible functions for SQLite
    const { randomUUID } = await import("crypto");
    sqlite.function("gen_random_uuid", () => randomUUID());
    sqlite.function("now", () => new Date().toISOString());

    // Monkey-patch prepare to auto-serialize objects/Dates for SQLite binding
    const origPrepare = sqlite.prepare.bind(sqlite);
    (sqlite as any).prepare = function(sql: string) {
      const stmt = origPrepare(sql);
      const serializeValue = (v: any): any => {
        if (v === null || v === undefined) return v;
        if (typeof v === 'boolean') return v ? 1 : 0;
        if (v instanceof Date) return v.toISOString();
        if (Buffer.isBuffer(v)) return v;
        if (typeof v === 'object') return JSON.stringify(v);
        return v;
      };
      const patchMethod = (method: string) => {
        if (typeof (stmt as any)[method] !== 'function') return;
        const orig = (stmt as any)[method].bind(stmt);
        (stmt as any)[method] = function(...args: any[]) {
          const patched = args.map((arg: any) => {
            if (Array.isArray(arg)) {
              return arg.map(serializeValue);
            }
            return serializeValue(arg);
          });
          return orig(...patched);
        };
      };
      for (const m of ['run', 'get', 'all', 'values', 'iterate', 'pluck', 'raw', 'columns', 'bind']) {
        patchMethod(m);
      }
      return stmt;
    };

    _pool = null;
    // @ts-ignore - Schema type compatibility
    _db = drizzleSqlite(sqlite, { schema });
  } else {
    const urlObj = new URL(dbUrl);
    const dbFingerprint = `${urlObj.hostname}:${urlObj.port || '5432'}/${urlObj.pathname.slice(1)}`;
    console.log(`[DB] Connecting to Postgres: ${dbFingerprint}`);

    _pool = new Pool({ 
      connectionString: process.env.DATABASE_URL,
      max: 20, // Maximum connections
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000, // 10 second connection timeout
    });
    _db = drizzle(_pool, { schema });
  }

  _initialized = true;
  return { db: _db, pool: _pool };
}

// Lazy getter for db - use this in all handlers
export async function getDb(): Promise<DbType> {
  const { db, pool } = await initDb();
  if (pool) {
    console.log(`[DB-STATS] Total: ${pool.totalCount}, Idle: ${pool.idleCount}, Waiting: ${pool.waitingCount}`);
  }
  return db;
}

// Lazy getter for pool (Postgres only)
export async function getPool(): Promise<pg.Pool | null> {
  const { pool } = await initDb();
  return pool;
}

// Legacy exports for backward compatibility - initialize immediately on first access
// These will be populated after first getDb() call
export let pool: pg.Pool | null = null;
export let db: DbType = null as unknown as DbType;

// Initialize synchronously for modules that import db directly
// This runs on first import but defers actual connection
initDb().then(({ db: _d, pool: _p }) => {
  db = _d;
  pool = _p;
}).catch(err => {
  console.error("[DB] Initialization failed:", err);
});
