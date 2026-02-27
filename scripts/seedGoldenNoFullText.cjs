/**
 * Test seeding WITHOUT full_text column to isolate memory issue
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

const DOC_METADATA = {
  "AI_Search_Architecture.md": {
    title: "AI Search Architecture - Project Phoenix",
    url: "https://docs.google.com/document/d/2def456-architecture",
    locationUrl: "https://drive.google.com/drive/folders/project-phoenix-docs",
  },
};

function generateId(prefix, ...parts) {
  return `${GOLDEN_PREFIX}${prefix}-${crypto.createHash("sha256").update(parts.join("|")).digest("hex").substring(0, 24)}`;
}

async function main() {
  console.log("=== Test WITHOUT full_text ===\n");

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

  // Insert source WITHOUT full_text
  console.log("Inserting source (without full_text)...");
  await pool.query(
    `INSERT INTO sources (id, workspace_id, user_id, created_by_user_id, type, visibility, external_id, title, url, content_hash, metadata_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [sourceId, GOLDEN_WORKSPACE_ID, GOLDEN_USER_ID, GOLDEN_USER_ID, "drive", "workspace", `golden-${file}`, "AI Search Architecture", "https://example.com", contentHash, JSON.stringify({ test: true })]
  );
  console.log("Insert successful!");

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
