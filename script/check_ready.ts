#!/usr/bin/env node
/**
 * Readiness Check Script
 * 
 * Validates environment, database connectivity, and schema presence.
 * Usage: npm run ready [mode]
 * Modes: dev, test, worker, mcp, prod
 */

import pg from "pg";
const { Pool } = pg;

const mode = process.argv[2] || "dev";
const requiredEnvVars: Record<string, string[]> = {
  dev: ["DATABASE_URL", "OPENAI_API_KEY"],
  test: ["DATABASE_URL", "OPENAI_API_KEY"],
  worker: ["DATABASE_URL", "OPENAI_API_KEY"],
  mcp: ["DATABASE_URL", "OPENAI_API_KEY"],
  prod: ["DATABASE_URL", "OPENAI_API_KEY"],
};

const expectedTables = [
  "users",
  "sources",
  "source_versions",
  "chunks",
  "jobs",
  "job_runs",
];

async function checkReady() {
  // Try to load dotenv if available (optional - worker uses -r dotenv/config, dev/test may not)
  try {
    const dotenv = await import("dotenv");
    dotenv.config();
  } catch {
    // dotenv not installed - continue with env vars as-is
  }

  console.log(`\n🔍 Checking readiness for mode: ${mode}\n`);

  let failed = false;

  // 1. Check required env vars
  console.log("1️⃣  Checking environment variables...");
  const required = requiredEnvVars[mode] || requiredEnvVars.dev;
  for (const varName of required) {
    const value = process.env[varName];
    if (!value) {
      console.error(`   ❌ ${varName} is missing`);
      failed = true;
    } else {
      // Mask sensitive values
      const displayValue = varName.includes("KEY") || varName.includes("SECRET") || varName.includes("PASSWORD")
        ? `${value.substring(0, 8)}...`
        : value.length > 50
        ? `${value.substring(0, 50)}...`
        : value;
      console.log(`   ✅ ${varName}=${displayValue}`);
    }
  }

  if (failed) {
    console.error("\n❌ FAIL: Missing required environment variables");
    console.error("\n💡 Next steps:");
    console.error("   - Copy .env.example to .env and fill in values");
    console.error("   - Or set environment variables in your shell");
    if (mode === "test") {
      console.error("   - For tests, start test DB: powershell script/db_test_up.ps1");
      console.error("   - Use: DATABASE_URL=postgresql://postgres:postgres@localhost:5433/fieldcopilot_test");
    }
    process.exit(1);
  }

  // 2. Check database connection
  console.log("\n2️⃣  Checking database connection...");
  const databaseUrl = process.env.DATABASE_URL!;
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const result = await pool.query("SELECT 1 as test");
    if (result.rows[0]?.test === 1) {
      console.log("   ✅ Database connection successful");
    } else {
      console.error("   ❌ Database connection test failed");
      failed = true;
    }
  } catch (error) {
    console.error(`   ❌ Database connection failed: ${error instanceof Error ? error.message : String(error)}`);
    failed = true;
    console.error("\n💡 Next steps:");
    console.error("   - Ensure PostgreSQL is running");
    if (mode === "test") {
      console.error("   - Start test DB: powershell script/db_test_up.ps1");
    } else {
      console.error("   - Check DATABASE_URL is correct");
      console.error("   - Run: npm run db:push (if schema not pushed)");
    }
    await pool.end();
    process.exit(1);
  }

  // 3. Check schema (core tables exist)
  console.log("\n3️⃣  Checking database schema...");
  try {
    const tableCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = ANY($1::text[])
    `, [expectedTables]);

    const foundTables = tableCheck.rows.map(r => r.table_name);
    const missingTables = expectedTables.filter(t => !foundTables.includes(t));

    if (missingTables.length === 0) {
      console.log(`   ✅ All core tables found (${expectedTables.length} tables)`);
    } else {
      console.error(`   ❌ Missing tables: ${missingTables.join(", ")}`);
      failed = true;
      console.error("\n💡 Next steps:");
      console.error("   - Run: npm run db:push");
    }
  } catch (error) {
    console.error(`   ❌ Schema check failed: ${error instanceof Error ? error.message : String(error)}`);
    failed = true;
  }

  await pool.end();

  // 4. Summary
  console.log("\n" + "=".repeat(50));
  if (failed) {
    console.error("\n❌ READINESS CHECK FAILED");
    console.error("\nFix the issues above before proceeding.");
    process.exit(1);
  } else {
    console.log("\n✅ READINESS CHECK PASSED");
    console.log("\n💡 Next steps:");
    if (mode === "dev") {
      console.log("   - Start server: npm run dev (or npm run dev:dotenv)");
      console.log("   - Start worker (separate terminal): npm run worker");
    } else if (mode === "test") {
      console.log("   - Run tests: npm run test:voice-smoke");
    } else if (mode === "worker") {
      console.log("   - Worker is ready (runs as: npm run worker)");
    } else if (mode === "mcp") {
      console.log("   - Run MCP server: npm run mcp");
    } else if (mode === "prod") {
      console.log("   - Build: npm run build");
      console.log("   - Start: npm start");
      console.log("   - Worker: npm run worker");
    }
    console.log();
    process.exit(0);
  }
}

checkReady().catch((error) => {
  console.error("\n❌ Unexpected error:", error);
  process.exit(1);
});
