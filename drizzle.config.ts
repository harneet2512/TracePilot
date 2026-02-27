import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// SQLite fallback for local dev when DATABASE_URL is missing (matches server/db.ts)
if (!process.env.DATABASE_URL && process.env.NODE_ENV === "development") {
  process.env.DATABASE_URL = "file:.data/dev.db";
  process.env.DATABASE_DIALECT = "sqlite";
}

// PROOF_MODE fallback
if (process.env.PROOF_MODE === "1") {
  process.env.DATABASE_URL = "file:proof/db.sqlite";
  process.env.DATABASE_DIALECT = "sqlite";
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. For local dev, leave unset and NODE_ENV=development to use SQLite at .data/dev.db");
}

const dialect = (process.env.DATABASE_DIALECT as "postgresql" | "sqlite") || (process.env.DATABASE_URL.startsWith("file:") ? "sqlite" : "postgresql");
const dbUrl = process.env.DATABASE_URL;

// Ensure dir exists for SQLite
if (dialect === "sqlite" && dbUrl.startsWith("file:")) {
  const sqlitePath = dbUrl.replace("file:", "");
  const dir = dirname(sqlitePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export default defineConfig({
  out: dialect === "sqlite" ? "./migrations_sqlite" : "./migrations",
  schema: "./shared/schema.ts",
  dialect,
  dbCredentials: { url: dbUrl },
});
