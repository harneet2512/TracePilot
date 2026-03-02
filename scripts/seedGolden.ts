/**
 * Golden DB Seeding Script
 * Seeds the database with 6 fixture documents and ~60-70 deterministic chunks
 * Run with: pnpm seed:golden
 *
 * Supports both PostgreSQL (via Drizzle) and SQLite (via raw SQL in PROOF_MODE)
 */

import "dotenv/config";
import { readFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Constants for deterministic chunking
const CHUNK_SIZE = 400; // characters
const CHUNK_OVERLAP = 50;
const GOLDEN_WORKSPACE_ID = "golden-eval-workspace";
const GOLDEN_USER_ID = "golden-eval-user";
const GOLDEN_PREFIX = "golden-";

// Document metadata
const DOC_METADATA: Record<string, { title: string; url: string; locationUrl: string }> = {
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

/**
 * Deterministic chunking function
 * Uses fixed parameters for reproducible results
 */
function chunkText(text: string, chunkSize: number = CHUNK_SIZE, overlap: number = CHUNK_OVERLAP): {
  text: string;
  charStart: number;
  charEnd: number;
}[] {
  const chunks: { text: string; charStart: number; charEnd: number }[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunkText = text.slice(start, end);

    // Try to break at sentence or paragraph boundary if possible
    let adjustedEnd = end;
    if (end < text.length) {
      // Look for paragraph break
      const paragraphBreak = chunkText.lastIndexOf("\n\n");
      if (paragraphBreak > chunkSize * 0.5) {
        adjustedEnd = start + paragraphBreak + 2;
      } else {
        // Look for sentence break
        const sentenceBreak = Math.max(
          chunkText.lastIndexOf(". "),
          chunkText.lastIndexOf(".\n"),
          chunkText.lastIndexOf("? "),
          chunkText.lastIndexOf("! ")
        );
        if (sentenceBreak > chunkSize * 0.5) {
          adjustedEnd = start + sentenceBreak + 2;
        }
      }
    }

    chunks.push({
      text: text.slice(start, adjustedEnd).trim(),
      charStart: start,
      charEnd: adjustedEnd,
    });

    if (adjustedEnd >= text.length) break;
    start = adjustedEnd - overlap;
    if (start >= text.length) break;
  }

  return chunks;
}

/**
 * Generate deterministic IDs
 */
function generateId(prefix: string, ...parts: string[]): string {
  const hash = createHash("sha256")
    .update(parts.join("|"))
    .digest("hex")
    .substring(0, 22);
  return `${GOLDEN_PREFIX}${prefix}-${hash}`;
}

/**
 * SQLite-based seeding (PROOF_MODE) - uses raw SQL to avoid pgTable/SQLite incompatibility
 */
async function seedSQLite() {
  const dbPath = join(__dirname, "..", "proof", "db.sqlite");
  if (!existsSync(join(__dirname, "..", "proof"))) {
    mkdirSync(join(__dirname, "..", "proof"), { recursive: true });
  }

  const { default: Database } = await import("better-sqlite3");
  const db = new Database(dbPath);

  // Ensure tables exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_by_user_id TEXT,
      type TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'workspace',
      external_id TEXT,
      title TEXT NOT NULL,
      url TEXT,
      content_hash TEXT,
      full_text TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS source_versions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      content_hash TEXT,
      full_text TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      char_count INTEGER,
      token_estimate INTEGER,
      ingested_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_version_id TEXT,
      chunk_index INTEGER NOT NULL DEFAULT 0,
      text TEXT NOT NULL,
      char_start INTEGER,
      char_end INTEGER,
      token_estimate INTEGER,
      metadata_json TEXT,
      embedding TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT,
      user_id TEXT,
      role TEXT,
      kind TEXT,
      prompt TEXT,
      retrieved_json TEXT,
      response_json TEXT,
      policy_json TEXT,
      success INTEGER DEFAULT 1,
      error TEXT,
      latency_ms TEXT,
      trace_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS policies (
      id TEXT PRIMARY KEY,
      version INTEGER NOT NULL DEFAULT 1,
      yaml_text TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const now = new Date().toISOString();

  // Cleanup
  db.exec("DELETE FROM chunks WHERE id LIKE 'golden-%'");
  db.exec("DELETE FROM source_versions WHERE id LIKE 'golden-%'");
  db.exec("DELETE FROM sources WHERE id LIKE 'golden-%'");
  console.log("Cleanup complete.");

  // Ensure workspace
  const ws = db.prepare("SELECT id FROM workspaces WHERE id = ?").get(GOLDEN_WORKSPACE_ID);
  if (!ws) {
    console.log("Creating golden workspace...");
    db.prepare("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)").run(
      GOLDEN_WORKSPACE_ID, "Golden Eval Workspace", now
    );
  }

  // Ensure user
  const usr = db.prepare("SELECT id FROM users WHERE id = ?").get(GOLDEN_USER_ID);
  if (!usr) {
    console.log("Creating golden user...");
    db.prepare("INSERT INTO users (id, workspace_id, email, role, created_at) VALUES (?, ?, ?, ?, ?)").run(
      GOLDEN_USER_ID, GOLDEN_WORKSPACE_ID, "golden-eval@example.com", "admin", now
    );
  }

  // Load fixture documents
  const fixturesDir = join(__dirname, "..", "fixtures", "golden_docs");
  const files = readdirSync(fixturesDir).filter(f => f.endsWith(".md"));
  console.log(`Found ${files.length} fixture documents\n`);

  const insertSource = db.prepare(
    `INSERT INTO sources (id, workspace_id, user_id, created_by_user_id, type, visibility, external_id, title, url, content_hash, full_text, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertVersion = db.prepare(
    `INSERT INTO source_versions (id, workspace_id, source_id, version, content_hash, full_text, is_active, char_count, token_estimate, ingested_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertChunk = db.prepare(
    `INSERT INTO chunks (id, workspace_id, user_id, source_id, source_version_id, chunk_index, text, char_start, char_end, token_estimate, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let totalChunks = 0;
  const sourceIds: string[] = [];

  const seedAll = db.transaction(() => {
    for (const file of files) {
      const filePath = join(fixturesDir, file);
      const content = readFileSync(filePath, "utf-8");
      const metadata = DOC_METADATA[file];
      if (!metadata) { console.warn(`No metadata for ${file}, skipping`); continue; }

      const sourceId = generateId("src", file);
      const sourceVersionId = generateId("ver", file, "v1");
      const contentHash = createHash("sha256").update(content).digest("hex");

      console.log(`Processing: ${metadata.title}`);
      console.log(`  Source ID: ${sourceId}`);

      const srcMeta = JSON.stringify({
        sourceTypeLabel: "Drive",
        locationUrl: metadata.locationUrl,
        fileName: file,
        isGoldenFixture: true,
      });

      insertSource.run(
        sourceId, GOLDEN_WORKSPACE_ID, GOLDEN_USER_ID, GOLDEN_USER_ID,
        "drive", "workspace", `golden-${file}`, metadata.title, metadata.url,
        contentHash, content, srcMeta, now, now
      );
      sourceIds.push(sourceId);

      insertVersion.run(
        sourceVersionId, GOLDEN_WORKSPACE_ID, sourceId, 1,
        contentHash, content, 1, content.length, Math.ceil(content.length / 4), now, now
      );

      const docChunks = chunkText(content);
      console.log(`  Chunks: ${docChunks.length}`);

      for (let i = 0; i < docChunks.length; i++) {
        const chunk = docChunks[i];
        const chunkId = generateId("chunk", file, i.toString());
        const chunkMeta = JSON.stringify({
          sourceTitle: metadata.title,
          sourceType: "drive",
          sourceTypeLabel: "Drive",
          url: metadata.url,
          locationUrl: metadata.locationUrl,
          isGoldenFixture: true,
        });

        insertChunk.run(
          chunkId, GOLDEN_WORKSPACE_ID, GOLDEN_USER_ID, sourceId, sourceVersionId,
          i, chunk.text, chunk.charStart, chunk.charEnd,
          Math.ceil(chunk.text.length / 4), chunkMeta, now
        );
        totalChunks++;
      }
    }
  });

  seedAll();

  // Verify
  const sourceCount = (db.prepare("SELECT COUNT(*) as c FROM sources WHERE id LIKE 'golden-%'").get() as any).c;
  const chunkCount = (db.prepare("SELECT COUNT(*) as c FROM chunks WHERE id LIKE 'golden-%'").get() as any).c;

  console.log("\n=== Seeding Complete ===");
  console.log(`Sources: ${sourceIds.length}`);
  console.log(`Chunks: ${totalChunks}`);
  console.log(`Workspace: ${GOLDEN_WORKSPACE_ID}`);
  console.log(`User: ${GOLDEN_USER_ID}`);
  console.log(`\nVerification:`);
  console.log(`  Sources in DB: ${sourceCount}`);
  console.log(`  Chunks in DB: ${chunkCount}`);

  db.close();

  if (sourceCount === 6 && chunkCount >= 55 && chunkCount <= 80) {
    console.log("\n[SUCCESS] Golden DB seeded correctly!");
    process.exit(0);
  } else {
    console.error("\n[ERROR] Unexpected counts - check seeding logic");
    process.exit(1);
  }
}

/**
 * PostgreSQL-based seeding (via Drizzle)
 */
async function seedPostgres() {
  const { getDb } = await import("../server/db");
  const { chunks, sources, sourceVersions, workspaces, users } = await import("../shared/schema");
  const { eq, like } = await import("drizzle-orm");

  const db = await getDb();

  // Cleanup
  console.log("Cleaning up existing golden data...");
  await db.delete(chunks).where(like(chunks.id, `${GOLDEN_PREFIX}%`));
  await db.delete(sourceVersions).where(like(sourceVersions.id, `${GOLDEN_PREFIX}%`));
  await db.delete(sources).where(like(sources.id, `${GOLDEN_PREFIX}%`));
  console.log("Cleanup complete.");

  // Ensure workspace
  const existingWs = await db.select().from(workspaces).where(eq(workspaces.id, GOLDEN_WORKSPACE_ID)).limit(1);
  if (existingWs.length === 0) {
    console.log("Creating golden workspace...");
    await db.insert(workspaces).values({ id: GOLDEN_WORKSPACE_ID, name: "Golden Eval Workspace" });
  }

  // Ensure user
  const existingUser = await db.select().from(users).where(eq(users.id, GOLDEN_USER_ID)).limit(1);
  if (existingUser.length === 0) {
    console.log("Creating golden user...");
    await db.insert(users).values({
      id: GOLDEN_USER_ID, workspaceId: GOLDEN_WORKSPACE_ID,
      email: "golden-eval@example.com", role: "admin",
    });
  }

  const fixturesDir = join(__dirname, "..", "fixtures", "golden_docs");
  const files = readdirSync(fixturesDir).filter(f => f.endsWith(".md"));
  console.log(`Found ${files.length} fixture documents\n`);

  let totalChunks = 0;
  const sourceIds: string[] = [];

  for (const file of files) {
    const filePath = join(fixturesDir, file);
    const content = readFileSync(filePath, "utf-8");
    const metadata = DOC_METADATA[file];
    if (!metadata) { console.warn(`No metadata for ${file}, skipping`); continue; }

    const sourceId = generateId("src", file);
    const sourceVersionId = generateId("ver", file, "v1");
    const contentHash = createHash("sha256").update(content).digest("hex");

    console.log(`Processing: ${metadata.title}`);
    console.log(`  Source ID: ${sourceId}`);

    await db.insert(sources).values({
      id: sourceId, workspaceId: GOLDEN_WORKSPACE_ID,
      userId: GOLDEN_USER_ID, createdByUserId: GOLDEN_USER_ID,
      type: "drive", visibility: "workspace",
      externalId: `golden-${file}`, title: metadata.title,
      url: metadata.url, contentHash, fullText: content,
      metadataJson: {
        sourceTypeLabel: "Drive", locationUrl: metadata.locationUrl,
        fileName: file, isGoldenFixture: true,
      },
    });
    sourceIds.push(sourceId);

    await db.insert(sourceVersions).values({
      id: sourceVersionId, workspaceId: GOLDEN_WORKSPACE_ID,
      sourceId, version: 1, contentHash, fullText: content,
      isActive: true, charCount: content.length,
      tokenEstimate: Math.ceil(content.length / 4),
    });

    const docChunks = chunkText(content);
    console.log(`  Chunks: ${docChunks.length}`);

    const chunkInserts = docChunks.map((chunk, index) => ({
      id: generateId("chunk", file, index.toString()),
      workspaceId: GOLDEN_WORKSPACE_ID, userId: GOLDEN_USER_ID,
      sourceId, sourceVersionId, chunkIndex: index,
      text: chunk.text, charStart: chunk.charStart, charEnd: chunk.charEnd,
      tokenEstimate: Math.ceil(chunk.text.length / 4),
      metadataJson: {
        sourceTitle: metadata.title, sourceType: "drive",
        sourceTypeLabel: "Drive", url: metadata.url,
        locationUrl: metadata.locationUrl, isGoldenFixture: true,
      },
    }));

    await db.insert(chunks).values(chunkInserts);
    totalChunks += docChunks.length;
  }

  // Verify
  const chunkCount = await db.select().from(chunks).where(like(chunks.id, `${GOLDEN_PREFIX}%`));
  const sourceCount = await db.select().from(sources).where(like(sources.id, `${GOLDEN_PREFIX}%`));

  console.log("\n=== Seeding Complete ===");
  console.log(`Sources: ${sourceIds.length}`);
  console.log(`Chunks: ${totalChunks}`);
  console.log(`Workspace: ${GOLDEN_WORKSPACE_ID}`);
  console.log(`User: ${GOLDEN_USER_ID}`);
  console.log(`\nVerification:`);
  console.log(`  Sources in DB: ${sourceCount.length}`);
  console.log(`  Chunks in DB: ${chunkCount.length}`);

  if (sourceCount.length === 6 && chunkCount.length >= 55 && chunkCount.length <= 80) {
    console.log("\n[SUCCESS] Golden DB seeded correctly!");
    process.exit(0);
  } else {
    console.error("\n[ERROR] Unexpected counts - check seeding logic");
    process.exit(1);
  }
}

async function seedGolden() {
  console.log("=== Golden DB Seeding ===\n");
  const isSQLite = process.env.PROOF_MODE === "1" ||
    process.env.DATABASE_DIALECT === "sqlite" ||
    (process.env.DATABASE_URL || "").startsWith("file:");

  if (isSQLite) {
    console.log("Using SQLite mode (raw SQL)");
    await seedSQLite();
  } else {
    console.log("Using PostgreSQL mode (Drizzle)");
    await seedPostgres();
  }
}

seedGolden().catch((err) => {
  console.error("Seeding error:", err);
  process.exit(1);
});
