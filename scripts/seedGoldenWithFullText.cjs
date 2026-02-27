/**
 * Test seeding WITH full_text column
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const pg = require("pg");

const Pool = pg.Pool;

const GOLDEN_WORKSPACE_ID = "golden-eval-workspace";
const GOLDEN_USER_ID = "golden-eval-user";
const GOLDEN_PREFIX = "golden-";

function generateId(prefix, ...parts) {
  return `${GOLDEN_PREFIX}${prefix}-${crypto.createHash("sha256").update(parts.join("|")).digest("hex").substring(0, 24)}`;
}

async function main() {
  console.log("=== Test WITH full_text ===\n");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Cleanup
  console.log("Cleaning up...");
  await pool.query(`DELETE FROM source_versions WHERE id LIKE 'golden-%'`);
  await pool.query(`DELETE FROM sources WHERE id LIKE 'golden-%'`);
  console.log("Cleanup complete.\n");

  const file = "AI_Search_Architecture.md";
  const fixturesDir = path.join(__dirname, "..", "fixtures", "golden_docs");
  const content = fs.readFileSync(path.join(fixturesDir, file), "utf-8");
  const sourceId = generateId("src", file);
  const contentHash = crypto.createHash("sha256").update(content).digest("hex");

  console.log(`Content length: ${content.length}`);
  console.log(`Source ID: ${sourceId}`);
  console.log(`Memory before insert: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);

  // Insert source WITH full_text
  console.log("Inserting source (WITH full_text)...");
  await pool.query(
    `INSERT INTO sources (id, workspace_id, user_id, created_by_user_id, type, visibility, external_id, title, url, content_hash, full_text, metadata_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [sourceId, GOLDEN_WORKSPACE_ID, GOLDEN_USER_ID, GOLDEN_USER_ID, "drive", "workspace", `golden-${file}`, "AI Search Architecture", "https://example.com", contentHash, content, JSON.stringify({ test: true })]
  );
  console.log("Insert successful!");
  console.log(`Memory after insert: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);

  // Cleanup
  await pool.query(`DELETE FROM sources WHERE id LIKE 'golden-%'`);
  await pool.end();
  console.log("Done!");
  process.exit(0);
}

main().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
