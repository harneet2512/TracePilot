import "dotenv/config";
import { getDb } from "../server/db";
import { chunks } from "../shared/schema";
import { like } from "drizzle-orm";

const GOLDEN_WORKSPACE_ID = "golden-eval-workspace";
const GOLDEN_USER_ID = "golden-eval-user";
const GOLDEN_PREFIX = "golden-";

async function main() {
  console.log("1. Getting db...");
  const db = await getDb();
  console.log("2. Got db");

  // Delete any existing test chunks
  console.log("3. Deleting test chunks...");
  await db.delete(chunks).where(like(chunks.id, "test-chunk-%"));
  console.log("4. Deleted");

  // Create test chunks
  console.log("5. Creating chunk inserts...");
  const chunkInserts = [];
  for (let i = 0; i < 10; i++) {
    chunkInserts.push({
      id: `test-chunk-${i}`,
      workspaceId: GOLDEN_WORKSPACE_ID,
      userId: GOLDEN_USER_ID,
      sourceId: "golden-src-32131f9da27255e9a33d163a", // Use existing source
      sourceVersionId: "golden-ver-f0e0c1b1c1c1c1c1c1c1c1c1",
      chunkIndex: i,
      text: `Test chunk ${i} content here.`,
      charStart: i * 100,
      charEnd: (i + 1) * 100,
      tokenEstimate: 25,
      metadataJson: { test: true },
    });
  }
  console.log("6. Created", chunkInserts.length, "inserts");

  console.log("7. Inserting chunks...");
  await db.insert(chunks).values(chunkInserts);
  console.log("8. Inserted");

  // Delete
  console.log("9. Cleaning up...");
  await db.delete(chunks).where(like(chunks.id, "test-chunk-%"));
  console.log("10. Done");

  process.exit(0);
}

main().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
