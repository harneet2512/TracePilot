/**
 * Simple Golden DB Seeding Script - Pure Node.js (no tsx)
 * This bypasses potential tsx/ESM issues
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const pg = require("pg");

const Pool = pg.Pool;

const CHUNK_SIZE = 400;
const CHUNK_OVERLAP = 50;
const GOLDEN_WORKSPACE_ID = "golden-eval-workspace";
const GOLDEN_USER_ID = "golden-eval-user";
const GOLDEN_PREFIX = "golden-";

const DOC_METADATA = {
  "Q4_2024_OKRs.md": {
    title: "Q4 2024 OKRs - Project Phoenix",
    url: "https://docs.google.com/document/d/1abc123-q4-okrs",
    locationUrl: "https://drive.google.com/drive/folders/project-phoenix-docs",
  },
  "AI_Search_Architecture.md": {
    title: "AI Search Architecture - Project Phoenix",
    url: "https://docs.google.com/document/d/2def456-architecture",
    locationUrl: "https://drive.google.com/drive/folders/project-phoenix-docs",
  },
  "Engineering_AllHands_Oct28_2024.md": {
    title: "Engineering All-Hands Meeting Notes - Oct 28, 2024",
    url: "https://docs.google.com/document/d/3ghi789-allhands",
    locationUrl: "https://drive.google.com/drive/folders/meeting-notes",
  },
  "Product_Roadmap_2025.md": {
    title: "Product Roadmap 2025 - Project Phoenix",
    url: "https://docs.google.com/document/d/4jkl012-roadmap",
    locationUrl: "https://drive.google.com/drive/folders/product-docs",
  },
  "JIRA_INFRA-1247_AWS_EU_Blocker.md": {
    title: "JIRA INFRA-1247 - AWS EU Region Quota Blocker",
    url: "https://company.atlassian.net/browse/INFRA-1247",
    locationUrl: "https://company.atlassian.net/projects/INFRA",
  },
  "Team_Quick_Reference_Guide.md": {
    title: "Team Quick Reference Guide - Project Phoenix",
    url: "https://docs.google.com/document/d/5mno345-team-guide",
    locationUrl: "https://drive.google.com/drive/folders/team-docs",
  },
};

function chunkText(text) {
  const result = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    const segment = text.slice(start, end);
    let adjustedEnd = end;
    if (end < text.length) {
      const pb = segment.lastIndexOf("\n\n");
      if (pb > CHUNK_SIZE * 0.5) {
        adjustedEnd = start + pb + 2;
      } else {
        const sb = Math.max(segment.lastIndexOf(". "), segment.lastIndexOf(".\n"));
        if (sb > CHUNK_SIZE * 0.5) adjustedEnd = start + sb + 2;
      }
    }
    result.push({ text: text.slice(start, adjustedEnd).trim(), charStart: start, charEnd: adjustedEnd });
    start = adjustedEnd - CHUNK_OVERLAP;
    if (start >= text.length) break;
  }
  return result;
}

function generateId(prefix, ...parts) {
  return `${GOLDEN_PREFIX}${prefix}-${crypto.createHash("sha256").update(parts.join("|")).digest("hex").substring(0, 24)}`;
}

async function main() {
  console.log("=== Golden DB Seeding (Pure Node.js) ===\n");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Cleanup
  console.log("Cleaning up existing golden data...");
  await pool.query(`DELETE FROM chunks WHERE id LIKE 'golden-%'`);
  await pool.query(`DELETE FROM source_versions WHERE id LIKE 'golden-%'`);
  await pool.query(`DELETE FROM sources WHERE id LIKE 'golden-%'`);
  console.log("Cleanup complete.\n");

  // Ensure workspace
  const ws = await pool.query(`SELECT id FROM workspaces WHERE id = $1`, [GOLDEN_WORKSPACE_ID]);
  if (ws.rows.length === 0) {
    console.log("Creating golden workspace...");
    await pool.query(`INSERT INTO workspaces (id, name) VALUES ($1, $2)`, [GOLDEN_WORKSPACE_ID, "Golden Eval Workspace"]);
  }

  // Ensure user
  const usr = await pool.query(`SELECT id FROM users WHERE id = $1`, [GOLDEN_USER_ID]);
  if (usr.rows.length === 0) {
    console.log("Creating golden user...");
    await pool.query(`INSERT INTO users (id, workspace_id, email, role) VALUES ($1, $2, $3, $4)`,
      [GOLDEN_USER_ID, GOLDEN_WORKSPACE_ID, "golden-eval@example.com", "admin"]);
  }

  // Load files
  const fixturesDir = path.join(__dirname, "..", "fixtures", "golden_docs");
  const files = fs.readdirSync(fixturesDir).filter(f => f.endsWith(".md"));
  console.log(`Found ${files.length} fixture documents\n`);

  let totalChunks = 0;

  for (const file of files) {
    const metadata = DOC_METADATA[file];
    if (!metadata) {
      console.log(`Skipping ${file} (no metadata)`);
      continue;
    }

    const content = fs.readFileSync(path.join(fixturesDir, file), "utf-8");
    const sourceId = generateId("src", file);
    const sourceVersionId = generateId("ver", file, "v1");
    const contentHash = crypto.createHash("sha256").update(content).digest("hex");

    console.log(`Processing: ${metadata.title}`);
    console.log(`  Source ID: ${sourceId}`);

    // Insert source
    await pool.query(
      `INSERT INTO sources (id, workspace_id, user_id, created_by_user_id, type, visibility, external_id, title, url, content_hash, full_text, metadata_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [sourceId, GOLDEN_WORKSPACE_ID, GOLDEN_USER_ID, GOLDEN_USER_ID, "drive", "workspace", `golden-${file}`, metadata.title, metadata.url, contentHash, content, JSON.stringify({ sourceTypeLabel: "Drive", locationUrl: metadata.locationUrl, fileName: file, isGoldenFixture: true })]
    );

    // Insert source version
    await pool.query(
      `INSERT INTO source_versions (id, workspace_id, source_id, version, content_hash, full_text, is_active, char_count, token_estimate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [sourceVersionId, GOLDEN_WORKSPACE_ID, sourceId, 1, contentHash, content, true, content.length, Math.ceil(content.length / 4)]
    );

    // Chunk and insert
    const docChunks = chunkText(content);
    console.log(`  Chunks: ${docChunks.length}`);

    for (let i = 0; i < docChunks.length; i++) {
      const chunk = docChunks[i];
      await pool.query(
        `INSERT INTO chunks (id, workspace_id, user_id, source_id, source_version_id, chunk_index, text, char_start, char_end, token_estimate, metadata_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [generateId("chunk", file, i.toString()), GOLDEN_WORKSPACE_ID, GOLDEN_USER_ID, sourceId, sourceVersionId, i, chunk.text, chunk.charStart, chunk.charEnd, Math.ceil(chunk.text.length / 4), JSON.stringify({ sourceTitle: metadata.title, sourceType: "drive", sourceTypeLabel: "Drive", url: metadata.url, locationUrl: metadata.locationUrl, isGoldenFixture: true })]
      );
    }
    totalChunks += docChunks.length;
  }

  // Verify
  const chunkCount = await pool.query(`SELECT COUNT(*) FROM chunks WHERE id LIKE 'golden-%'`);
  const sourceCount = await pool.query(`SELECT COUNT(*) FROM sources WHERE id LIKE 'golden-%'`);

  console.log("\n=== Seeding Complete ===");
  console.log(`Sources: ${sourceCount.rows[0].count}`);
  console.log(`Chunks: ${chunkCount.rows[0].count}`);

  const sCount = parseInt(sourceCount.rows[0].count);
  const cCount = parseInt(chunkCount.rows[0].count);

  await pool.end();

  if (sCount === 6 && cCount >= 60 && cCount <= 80) {
    console.log("\n[SUCCESS] Golden DB seeded correctly!");
    process.exit(0);
  } else {
    console.error("\n[WARNING] Unexpected counts");
    process.exit(1);
  }
}

main().catch(e => {
  console.error("Seeding error:", e);
  process.exit(1);
});
