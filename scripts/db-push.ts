#!/usr/bin/env tsx
/**
 * Schema push/migrate script - routes to the correct Drizzle command based on dialect.
 * - Postgres: drizzle-kit push (schema-first)
 * - SQLite: drizzle-kit migrate (applies migrations from migrations_sqlite)
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Match server/db.ts fallbacks
if (!process.env.DATABASE_URL && process.env.NODE_ENV === "development") {
  process.env.DATABASE_URL = "file:.data/dev.db";
  process.env.DATABASE_DIALECT = "sqlite";
}
if (process.env.PROOF_MODE === "1") {
  process.env.DATABASE_URL = "file:proof/db.sqlite";
  process.env.DATABASE_DIALECT = "sqlite";
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL must be set. For local dev, use NODE_ENV=development.");
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
const dialect = (process.env.DATABASE_DIALECT as string) || (dbUrl.startsWith("file:") ? "sqlite" : "postgresql");

if (dialect === "sqlite" && dbUrl.startsWith("file:")) {
  const dir = dirname(dbUrl.replace("file:", ""));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const isSqlite = dialect === "sqlite" || dbUrl.startsWith("file:");
const cmd = isSqlite ? "migrate" : "push";
const args = ["drizzle-kit", cmd, "--config=drizzle.config.ts"];

console.log(`[db-push] dialect=${dialect} -> drizzle-kit ${cmd}`);
const r = spawnSync("npx", args, { stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
