import "dotenv/config";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function logMemory(step: string) {
  const used = process.memoryUsage();
  console.log(`[MEM ${step}] heap: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
}

async function main() {
  logMemory("start");

  console.log("1. Reading AI_Search_Architecture.md...");
  const fixturesDir = join(__dirname, "..", "fixtures", "golden_docs");
  const content = readFileSync(join(fixturesDir, "AI_Search_Architecture.md"), "utf-8");
  console.log("   Length:", content.length);
  logMemory("after read");

  console.log("2. Creating pool...");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  logMemory("after pool");

  console.log("3. Query...");
  const result = await pool.query("SELECT 1 as test");
  console.log("   Result:", result.rows[0]);
  logMemory("after query");

  console.log("4. Insert source...");
  await pool.query(
    `INSERT INTO sources (id, workspace_id, user_id, created_by_user_id, type, visibility, external_id, title, url, content_hash, full_text, metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title`,
    [
      "test-ai-src-1", "golden-eval-workspace", "golden-eval-user", "golden-eval-user", "drive", "workspace",
      "test-ai-src-1", "Test AI", "https://example.com", "abc123", content,
      JSON.stringify({ test: true })
    ]
  );
  logMemory("after insert");

  console.log("5. Cleanup...");
  await pool.query(`DELETE FROM sources WHERE id = 'test-ai-src-1'`);
  logMemory("after cleanup");

  console.log("6. Waiting 3 seconds...");
  await new Promise(r => setTimeout(r, 3000));
  logMemory("after wait");

  await pool.end();
  console.log("Done!");
  process.exit(0);
}

main().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
