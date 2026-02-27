import "dotenv/config";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import pg from "pg";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CHUNK_SIZE = 400;
const CHUNK_OVERLAP = 50;
const GOLDEN_WORKSPACE_ID = "golden-eval-workspace";
const GOLDEN_USER_ID = "golden-eval-user";
const GOLDEN_PREFIX = "golden-";

const DOC_METADATA: Record<string, { title: string; url: string; locationUrl: string }> = {
  "Q4_2024_OKRs.md": { title: "Q4 2024 OKRs - Project Phoenix", url: "url1", locationUrl: "loc1" },
  "AI_Search_Architecture.md": { title: "AI Search Architecture - Project Phoenix", url: "url2", locationUrl: "loc2" },
  "Engineering_AllHands_Oct28_2024.md": { title: "Engineering All-Hands", url: "url3", locationUrl: "loc3" },
  "Product_Roadmap_2025.md": { title: "Product Roadmap 2025", url: "url4", locationUrl: "loc4" },
  "JIRA_INFRA-1247_AWS_EU_Blocker.md": { title: "JIRA INFRA-1247", url: "url5", locationUrl: "loc5" },
  "Team_Quick_Reference_Guide.md": { title: "Team Quick Reference Guide", url: "url6", locationUrl: "loc6" },
};

function generateId(prefix: string, ...parts: string[]): string {
  const hash = createHash("sha256").update(parts.join("|")).digest("hex").substring(0, 24);
  return `${GOLDEN_PREFIX}${prefix}-${hash}`;
}

function logMemory(step: string) {
  const used = process.memoryUsage();
  console.log(`[MEM ${step}] heap: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
}

async function main() {
  console.log("=== Exact Flow Test ===\n");
  logMemory("start");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Cleanup
  console.log("Cleaning up...");
  await pool.query(`DELETE FROM chunks WHERE id LIKE 'test-exact-%'`);
  await pool.query(`DELETE FROM source_versions WHERE id LIKE 'test-exact-%'`);
  await pool.query(`DELETE FROM sources WHERE id LIKE 'test-exact-%'`);
  logMemory("after cleanup");

  // List files
  const fixturesDir = join(__dirname, "..", "fixtures", "golden_docs");
  const files = readdirSync(fixturesDir).filter(f => f.endsWith(".md"));
  console.log(`Found ${files.length} files`);
  logMemory("after readdirSync");

  // Process ONLY the first file (AI_Search_Architecture.md - alphabetically first)
  const file = files[0];
  console.log(`Processing file: ${file}`);
  const metadata = DOC_METADATA[file];
  if (!metadata) {
    console.log("No metadata, exiting");
    process.exit(1);
  }

  const filePath = join(fixturesDir, file);
  const content = readFileSync(filePath, "utf-8");
  console.log(`Content length: ${content.length}`);
  logMemory("after readFileSync");

  const sourceId = "test-exact-src-" + generateId("src", file).substring(20);
  const sourceVersionId = "test-exact-ver-" + generateId("ver", file, "v1").substring(20);
  const contentHash = createHash("sha256").update(content).digest("hex");

  console.log(`Processing: ${metadata.title}`);
  console.log(`  Source ID: ${sourceId}`);
  logMemory("before insert");

  // Insert source
  console.log("Inserting source...");
  await pool.query(
    `INSERT INTO sources (id, workspace_id, user_id, created_by_user_id, type, visibility, external_id, title, url, content_hash, full_text, metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [sourceId, GOLDEN_WORKSPACE_ID, GOLDEN_USER_ID, GOLDEN_USER_ID, "drive", "workspace", `test-exact-${file}`, metadata.title, metadata.url, contentHash, content, JSON.stringify({ test: true })]
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
  console.log("Cleaning up test data...");
  await pool.query(`DELETE FROM source_versions WHERE id LIKE 'test-exact-%'`);
  await pool.query(`DELETE FROM sources WHERE id LIKE 'test-exact-%'`);
  logMemory("after final cleanup");

  await pool.end();
  console.log("Done!");
  process.exit(0);
}

main().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
