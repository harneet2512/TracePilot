import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Log DB connection info (one-time startup log, redact credentials)
if (process.env.PROOF_MODE === "1") {
  process.env.DATABASE_URL = "file:proof/db.sqlite";
  process.env.DATABASE_DIALECT = "sqlite";
}

const dbUrl = process.env.DATABASE_URL;
const isSQLite = process.env.DATABASE_DIALECT === "sqlite" || dbUrl.startsWith("file:");

let pool: pg.Pool | null;
let db: NodePgDatabase<typeof schema> | BetterSQLite3Database<typeof schema>;

if (isSQLite) {
  console.log(`[DB] Connecting to SQLite: ${dbUrl}`);
  // Dynamic import for better-sqlite3 to avoid build issues if not used
  // @ts-ignore - Top-level await is fine in modern Node.js ES modules
  const { default: Database } = await import("better-sqlite3");
  // @ts-ignore - Top-level await is fine in modern Node.js ES modules
  const { drizzle: drizzleSqlite } = await import("drizzle-orm/better-sqlite3");

  const sqlite = new Database(dbUrl.replace("file:", ""));
  pool = null; // No pool for SQLite
  // @ts-ignore - Schema type compatibility
  db = drizzleSqlite(sqlite, { schema });
} else {
  const urlObj = new URL(dbUrl);
  console.log(`[DB] Connecting to Postgres: ${urlObj.hostname}:${urlObj.port || '5432'}/${urlObj.pathname.slice(1)}`);

  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
}

export { pool, db };
