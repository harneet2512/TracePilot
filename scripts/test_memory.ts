import "dotenv/config";
import { getDb } from "../server/db";
import { sources, sourceVersions } from "../shared/schema";
import { like } from "drizzle-orm";
import { createHash } from "crypto";

const GOLDEN_WORKSPACE_ID = "golden-eval-workspace";
const GOLDEN_USER_ID = "golden-eval-user";

function logMemory(step: string) {
  const used = process.memoryUsage();
  console.log(`[MEM ${step}] heapUsed: ${Math.round(used.heapUsed / 1024 / 1024)}MB, heapTotal: ${Math.round(used.heapTotal / 1024 / 1024)}MB, rss: ${Math.round(used.rss / 1024 / 1024)}MB`);
}

async function main() {
  logMemory("start");

  console.log("1. Getting db...");
  const db = await getDb();
  logMemory("after getDb");

  console.log("2. Cleaning...");
  await db.delete(sourceVersions).where(like(sourceVersions.id, "test-sv-%"));
  await db.delete(sources).where(like(sources.id, "test-src-%"));
  logMemory("after cleanup");

  const content = "Test content ".repeat(100);
  const contentHash = createHash("sha256").update(content).digest("hex");

  console.log("3. Inserting source...");
  await db.insert(sources).values({
    id: "test-src-1",
    workspaceId: GOLDEN_WORKSPACE_ID,
    userId: GOLDEN_USER_ID,
    createdByUserId: GOLDEN_USER_ID,
    type: "drive",
    visibility: "workspace",
    externalId: "test-src-1",
    title: "Test",
    url: "https://example.com",
    contentHash,
    fullText: content,
    metadataJson: { test: true },
  });
  logMemory("after source insert");

  console.log("4. Inserting source version...");
  await db.insert(sourceVersions).values({
    id: "test-sv-1",
    workspaceId: GOLDEN_WORKSPACE_ID,
    sourceId: "test-src-1",
    version: 1,
    contentHash,
    fullText: content,
    isActive: true,
    charCount: content.length,
    tokenEstimate: Math.ceil(content.length / 4),
  });
  logMemory("after version insert");

  console.log("5. Waiting 2 seconds...");
  await new Promise(r => setTimeout(r, 2000));
  logMemory("after wait");

  console.log("6. Cleanup...");
  await db.delete(sourceVersions).where(like(sourceVersions.id, "test-sv-%"));
  await db.delete(sources).where(like(sources.id, "test-src-%"));
  logMemory("after final cleanup");

  console.log("Done!");
  process.exit(0);
}

main().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
