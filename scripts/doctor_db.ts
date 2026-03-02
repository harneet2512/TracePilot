#!/usr/bin/env tsx
/**
 * Database setup doctor - validates connection, checks tables, suggests next steps.
 */
import "dotenv/config";
import { getDb } from "../server/db";
import { sql } from "drizzle-orm";
import { users, workspaces } from "../shared/schema";

// Match server/db.ts fallbacks
if (!process.env.DATABASE_URL && process.env.NODE_ENV === "development") {
  process.env.DATABASE_URL = "file:.data/dev.db";
  process.env.DATABASE_DIALECT = "sqlite";
}
if (process.env.PROOF_MODE === "1") {
  process.env.DATABASE_URL = "file:proof/db.sqlite";
  process.env.DATABASE_DIALECT = "sqlite";
}

async function doctor() {
  console.log("TracePilot Database Doctor\n" + "=".repeat(50));

  const dbUrl = process.env.DATABASE_URL;
  const dialect = (process.env.DATABASE_DIALECT as string) || (dbUrl?.startsWith("file:") ? "sqlite" : "postgresql");

  // 1. Print mode
  const mode = dialect === "sqlite" || dbUrl?.startsWith("file:") ? "SQLite" : "PostgreSQL";
  const target = dbUrl?.startsWith("file:") ? dbUrl.replace("file:", "") : (() => {
    try {
      const u = new URL(dbUrl || "");
      return `${u.hostname}:${u.port || 5432}${u.pathname}`;
    } catch {
      return "unknown";
    }
  })();
  console.log(`Mode:    ${mode}`);
  console.log(`Target:  ${target}`);
  console.log("");

  if (!dbUrl) {
    console.log("DATABASE_URL is not set.");
    console.log("");
    console.log("For local development (SQLite):");
    console.log("  1. Run: npm run db:push:sqlite");
    console.log("  2. Run: npm run dev");
    console.log("");
    console.log("For Postgres (Docker):");
    console.log("  1. Run: docker compose up -d");
    console.log("  2. Set DATABASE_URL=postgresql://postgres:postgres@localhost:5433/tracepilot_test");
    console.log("  3. Run: npm run db:push");
    console.log("");
    console.log("For Supabase:");
    console.log("  1. Set DATABASE_URL to your Supabase connection string");
    console.log("  2. Run: npm run db:push");
    process.exit(1);
  }

  // 2. Validate connection
  try {
    const db = await getDb();
    await db.execute(sql`SELECT 1`);
    console.log("Connection: OK");
  } catch (err) {
    console.log("Connection: FAILED");
    console.error("  " + (err instanceof Error ? err.message : String(err)));
    console.log("");
    if (mode === "PostgreSQL") {
      console.log("Next steps:");
      console.log("  - Ensure Postgres is running (docker compose up -d)");
      console.log("  - Check DATABASE_URL is correct");
    } else {
      console.log("Next steps:");
      console.log("  - Run: npm run db:push:sqlite");
    }
    process.exit(1);
  }

  // 3. Check required tables
  const checks: { name: string; fn: () => Promise<unknown> }[] = [
    { name: "workspaces", fn: async () => (await getDb()).select().from(workspaces).limit(1) },
    { name: "users", fn: async () => (await getDb()).select().from(users).limit(1) },
  ];
  const missing: string[] = [];
  for (const { name, fn } of checks) {
    try {
      await fn();
    } catch {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    console.log("Tables:   MISSING (" + missing.join(", ") + ")");
    console.log("");
    console.log("Schema not initialized. Run:");
    if (mode === "SQLite") {
      console.log("  npm run db:push:sqlite");
    } else {
      console.log("  npm run db:push");
    }
    process.exit(1);
  }

  console.log("Tables:   OK");
  console.log("");
  console.log("Database is ready. You can run: npm run dev");
  process.exit(0);
}

doctor().catch((err) => {
  console.error(err);
  process.exit(1);
});
