import "dotenv/config";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { getDb } from "../server/db";
import { chunks, sources, sourceVersions, workspaces, users } from "../shared/schema";
import { eq, like } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GOLDEN_WORKSPACE_ID = "golden-eval-workspace";
const GOLDEN_USER_ID = "golden-eval-user";

function logMemory(step: string) {
  const used = process.memoryUsage();
  console.log(`[MEM ${step}] heap: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
}

function chunkText(text: string): { text: string; charStart: number; charEnd: number }[] {
  const result: { text: string; charStart: number; charEnd: number }[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + 400, text.length);
    result.push({ text: text.slice(start, end).trim(), charStart: start, charEnd: end });
    start = end - 50;
    if (start >= text.length) break;
  }
  return result;
}

async function main() {
  logMemory("start");

  console.log("1. Reading fixture file...");
  const fixturesDir = join(__dirname, "..", "fixtures", "golden_docs");
  const content = readFileSync(join(fixturesDir, "Q4_2024_OKRs.md"), "utf-8");
  console.log("   File length:", content.length);
  logMemory("after read");

  console.log("2. Getting db...");
  const db = await getDb();
  logMemory("after getDb");

  console.log("3. Cleanup...");
  await db.delete(chunks).where(like(chunks.id, "test2-%"));
  await db.delete(sourceVersions).where(like(sourceVersions.id, "test2-%"));
  await db.delete(sources).where(like(sources.id, "test2-%"));
  logMemory("after cleanup");

  const contentHash = createHash("sha256").update(content).digest("hex");

  console.log("4. Insert source...");
  await db.insert(sources).values({
    id: "test2-src-1",
    workspaceId: GOLDEN_WORKSPACE_ID,
    userId: GOLDEN_USER_ID,
    createdByUserId: GOLDEN_USER_ID,
    type: "drive",
    visibility: "workspace",
    externalId: "test2-src-1",
    title: "Test",
    url: "https://example.com",
    contentHash,
    fullText: content,
    metadataJson: { test: true },
  });
  logMemory("after source");

  console.log("5. Insert source version...");
  await db.insert(sourceVersions).values({
    id: "test2-sv-1",
    workspaceId: GOLDEN_WORKSPACE_ID,
    sourceId: "test2-src-1",
    version: 1,
    contentHash,
    fullText: content,
    isActive: true,
    charCount: content.length,
    tokenEstimate: Math.ceil(content.length / 4),
  });
  logMemory("after version");

  console.log("6. Chunking...");
  const docChunks = chunkText(content);
  console.log("   Chunks:", docChunks.length);
  logMemory("after chunking");

  console.log("7. Insert chunks...");
  const chunkInserts = docChunks.map((chunk, index) => ({
    id: `test2-chunk-${index}`,
    workspaceId: GOLDEN_WORKSPACE_ID,
    userId: GOLDEN_USER_ID,
    sourceId: "test2-src-1",
    sourceVersionId: "test2-sv-1",
    chunkIndex: index,
    text: chunk.text,
    charStart: chunk.charStart,
    charEnd: chunk.charEnd,
    tokenEstimate: Math.ceil(chunk.text.length / 4),
    metadataJson: { test: true },
  }));
  await db.insert(chunks).values(chunkInserts);
  logMemory("after chunks");

  console.log("8. Final cleanup...");
  await db.delete(chunks).where(like(chunks.id, "test2-%"));
  await db.delete(sourceVersions).where(like(sourceVersions.id, "test2-%"));
  await db.delete(sources).where(like(sources.id, "test2-%"));
  logMemory("done");

  console.log("SUCCESS!");
  process.exit(0);
}

main().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
