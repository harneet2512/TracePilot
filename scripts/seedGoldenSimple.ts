/**
 * Simplified Golden DB Seeding Script
 */

import "dotenv/config";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { getDb } from "../server/db";
import { chunks, sources, sourceVersions, workspaces, users } from "../shared/schema";
import { eq, like } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CHUNK_SIZE = 400;
const CHUNK_OVERLAP = 50;
const GOLDEN_WORKSPACE_ID = "golden-eval-workspace";
const GOLDEN_USER_ID = "golden-eval-user";
const GOLDEN_PREFIX = "golden-";

const DOC_METADATA: Record<string, { title: string; url: string; locationUrl: string }> = {
  "Q4_2024_OKRs.md": {
    title: "Q4 2024 OKRs - Project Phoenix",
    url: "https://docs.google.com/document/d/1abc123-q4-okrs",
    locationUrl: "https://drive.google.com/drive/folders/project-phoenix-docs",
  },
};

function chunkText(text: string): { text: string; charStart: number; charEnd: number }[] {
  const chunks: { text: string; charStart: number; charEnd: number }[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push({ text: text.slice(start, end).trim(), charStart: start, charEnd: end });
    start = end - CHUNK_OVERLAP;
    if (start >= text.length) break;
  }
  return chunks;
}

function generateId(prefix: string, ...parts: string[]): string {
  const hash = createHash("sha256").update(parts.join("|")).digest("hex").substring(0, 24);
  return `${GOLDEN_PREFIX}${prefix}-${hash}`;
}

async function main() {
  console.log("=== Simple Golden Seeding ===");

  console.log("1. Getting db...");
  const db = await getDb();
  console.log("2. Got db");

  // Clean existing golden sources
  console.log("3. Cleaning existing golden data...");
  await db.delete(chunks).where(like(chunks.id, `${GOLDEN_PREFIX}%`));
  await db.delete(sourceVersions).where(like(sourceVersions.id, `${GOLDEN_PREFIX}%`));
  await db.delete(sources).where(like(sources.id, `${GOLDEN_PREFIX}%`));
  console.log("4. Cleanup complete");

  // Process one file
  const file = "Q4_2024_OKRs.md";
  const fixturesDir = join(__dirname, "..", "fixtures", "golden_docs");
  const filePath = join(fixturesDir, file);

  console.log("5. Reading file:", filePath);
  const content = readFileSync(filePath, "utf-8");
  console.log("6. File read, length:", content.length);

  const metadata = DOC_METADATA[file]!;
  const sourceId = generateId("src", file);
  const sourceVersionId = generateId("ver", file, "v1");
  const contentHash = createHash("sha256").update(content).digest("hex");

  console.log("7. Inserting source:", sourceId);
  await db.insert(sources).values({
    id: sourceId,
    workspaceId: GOLDEN_WORKSPACE_ID,
    userId: GOLDEN_USER_ID,
    createdByUserId: GOLDEN_USER_ID,
    type: "drive",
    visibility: "workspace",
    externalId: `golden-${file}`,
    title: metadata.title,
    url: metadata.url,
    contentHash,
    fullText: content,
    metadataJson: {
      sourceTypeLabel: "Drive",
      locationUrl: metadata.locationUrl,
      fileName: file,
      isGoldenFixture: true,
    },
  });
  console.log("8. Source inserted");

  console.log("9. Inserting source version...");
  await db.insert(sourceVersions).values({
    id: sourceVersionId,
    workspaceId: GOLDEN_WORKSPACE_ID,
    sourceId,
    version: 1,
    contentHash,
    fullText: content,
    isActive: true,
    charCount: content.length,
    tokenEstimate: Math.ceil(content.length / 4),
  });
  console.log("10. Source version inserted");

  const docChunks = chunkText(content);
  console.log("11. Chunked into", docChunks.length, "chunks");

  const chunkInserts = docChunks.map((chunk, index) => ({
    id: generateId("chunk", file, index.toString()),
    workspaceId: GOLDEN_WORKSPACE_ID,
    userId: GOLDEN_USER_ID,
    sourceId,
    sourceVersionId,
    chunkIndex: index,
    text: chunk.text,
    charStart: chunk.charStart,
    charEnd: chunk.charEnd,
    tokenEstimate: Math.ceil(chunk.text.length / 4),
    metadataJson: {
      sourceTitle: metadata.title,
      sourceType: "drive",
      sourceTypeLabel: "Drive",
      url: metadata.url,
      locationUrl: metadata.locationUrl,
      isGoldenFixture: true,
    },
  }));

  console.log("12. Inserting chunks...");
  await db.insert(chunks).values(chunkInserts);
  console.log("13. Chunks inserted");

  console.log("\n=== SUCCESS ===");
  process.exit(0);
}

main().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
