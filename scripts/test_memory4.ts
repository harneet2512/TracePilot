// Same as test_memory3 but with readFileSync
import "dotenv/config";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getDb } from "../server/db";
import { chunks, sources, sourceVersions, workspaces, users } from "../shared/schema";
import { like } from "drizzle-orm";
import { createHash } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GOLDEN_WORKSPACE_ID = "golden-eval-workspace";
const GOLDEN_USER_ID = "golden-eval-user";

function logMemory(step: string) {
  const used = process.memoryUsage();
  console.log(`[MEM ${step}] heap: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
}

async function main() {
  logMemory("start");

  console.log("1. Reading file...");
  const fixturesDir = join(__dirname, "..", "fixtures", "golden_docs");
  const content = readFileSync(join(fixturesDir, "Q4_2024_OKRs.md"), "utf-8");
  console.log("   Length:", content.length);
  logMemory("after read");

  console.log("2. Getting db...");
  const db = await getDb();
  logMemory("after getDb");

  console.log("3. Cleaning...");
  await db.delete(sourceVersions).where(like(sourceVersions.id, "test4-%"));
  await db.delete(sources).where(like(sources.id, "test4-%"));
  logMemory("after cleanup");

  const contentHash = createHash("sha256").update(content).digest("hex");

  console.log("4. Inserting source...");
  await db.insert(sources).values({
    id: "test4-src-1",
    workspaceId: GOLDEN_WORKSPACE_ID,
    userId: GOLDEN_USER_ID,
    createdByUserId: GOLDEN_USER_ID,
    type: "drive",
    visibility: "workspace",
    externalId: "test4-src-1",
    title: "Test",
    url: "https://example.com",
    contentHash,
    fullText: content,
    metadataJson: { test: true },
  });
  logMemory("after source insert");

  console.log("5. Inserting source version...");
  await db.insert(sourceVersions).values({
    id: "test4-sv-1",
    workspaceId: GOLDEN_WORKSPACE_ID,
    sourceId: "test4-src-1",
    version: 1,
    contentHash,
    fullText: content,
    isActive: true,
    charCount: content.length,
    tokenEstimate: Math.ceil(content.length / 4),
  });
  logMemory("after version insert");

  console.log("6. Waiting 2 seconds...");
  await new Promise(r => setTimeout(r, 2000));
  logMemory("after wait");

  console.log("7. Cleanup...");
  await db.delete(sourceVersions).where(like(sourceVersions.id, "test4-%"));
  await db.delete(sources).where(like(sources.id, "test4-%"));
  logMemory("after final cleanup");

  console.log("Done!");
  process.exit(0);
}

main().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
