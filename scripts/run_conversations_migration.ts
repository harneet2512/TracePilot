/**
 * Run the conversations table migration (003_chat_quality_dashboard.sql)
 * Adds environment, model, and other Chat Quality columns if they don't exist.
 */
import "dotenv/config";
import pg from "pg";
import { readFileSync } from "fs";
import { join } from "path";

const { Pool } = pg;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || url.startsWith("file:")) {
    console.log("Skipping: DATABASE_URL is SQLite or missing");
    process.exit(0);
  }

  const pool = new Pool({ connectionString: url });
  const migrationPath = join(process.cwd(), "migrations", "003_chat_quality_dashboard.sql");
  const sql = readFileSync(migrationPath, "utf-8");

  // Strip line comments, then split by semicolon
  const cleaned = sql.replace(/--[^\n]*\n?/g, "\n");
  const statements = cleaned
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && /^(ALTER|CREATE)\s/i.test(s));

  for (const stmt of statements) {
    try {
      await pool.query(stmt + ";");
      console.log("OK:", stmt.slice(0, 60) + "...");
    } catch (err: any) {
      console.error("Error:", err.message);
      throw err;
    }
  }

  await pool.end();
  console.log("Migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
