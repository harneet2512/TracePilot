import "dotenv/config";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import pg from "pg";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GOLDEN_WORKSPACE_ID = "golden-eval-workspace";
const GOLDEN_USER_ID = "golden-eval-user";
const GOLDEN_PREFIX = "golden-";

function generateId(prefix: string, ...parts: string[]): string {
  const hash = createHash("sha256").update(parts.join("|")).digest("hex").substring(0, 24);
  return `${GOLDEN_PREFIX}${prefix}-${hash}`;
}

function logMemory(step: string) {
  const used = process.memoryUsage();
  console.log(`[MEM ${step}] heap: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
}

async function main() {
  console.log("=== Golden Prefix Test ===\n");
  logMemory("start");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Cleanup with golden prefix
  console.log("Cleaning up golden data...");
  await pool.query(`DELETE FROM chunks WHERE id LIKE 'golden-%'`);
  await pool.query(`DELETE FROM source_versions WHERE id LIKE 'golden-%'`);
  await pool.query(`DELETE FROM sources WHERE id LIKE 'golden-%'`);
  logMemory("after cleanup");

  const file = "AI_Search_Architecture.md";
  const fixturesDir = join(__dirname, "..", "fixtures", "golden_docs");
  const filePath = join(fixturesDir, file);
  const content = readFileSync(filePath, "utf-8");

  const sourceId = generateId("src", file);
  const sourceVersionId = generateId("ver", file, "v1");
  const contentHash = createHash("sha256").update(content).digest("hex");

  console.log(`Processing: ${file}`);
  console.log(`  Source ID: ${sourceId}`);
  logMemory("before insert");

  // Insert source with GOLDEN prefix
  console.log("Inserting source...");
  await pool.query(
    `INSERT INTO sources (id, workspace_id, user_id, created_by_user_id, type, visibility, external_id, title, url, content_hash, full_text, metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [sourceId, GOLDEN_WORKSPACE_ID, GOLDEN_USER_ID, GOLDEN_USER_ID, "drive", "workspace", `golden-${file}`, "AI Search Architecture", "https://example.com", contentHash, content, JSON.stringify({ test: true })]
  );
  logMemory("after source insert");

  // Insert source version
  console.log("Inserting source version...");
  await pool.query(
    `INSERT INTO source_versions (id, workspace_id, source_id, version, content_hash, full_text, is_active, char_count, token_estimate)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [sourceVersionId, GOLDEN_WORKSPACE_ID, sourceId, 1, contentHash, content, true, content.length, Math.ceil(content.length / 4)]
  );
  logMemory("after version insert");

  // Cleanup
  console.log("Cleaning up...");
  await pool.query(`DELETE FROM source_versions WHERE id = $1`, [sourceVersionId]);
  await pool.query(`DELETE FROM sources WHERE id = $1`, [sourceId]);
  logMemory("after cleanup");

  await pool.end();
  console.log("Done!");
  process.exit(0);
}

main().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
