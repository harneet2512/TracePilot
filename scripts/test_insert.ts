import "dotenv/config";
console.log("1. Starting...");
import { getDb } from "../server/db";
import { sources, workspaces, users } from "../shared/schema";
import { like, eq } from "drizzle-orm";
import { createHash } from "crypto";
console.log("2. Modules imported");

const GOLDEN_WORKSPACE_ID = "golden-eval-workspace";
const GOLDEN_USER_ID = "golden-eval-user";

async function test() {
  console.log("3. Getting db...");
  const db = await getDb();
  console.log("4. Got db");

  // Check workspace
  console.log("5. Checking workspace...");
  const existingWorkspace = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, GOLDEN_WORKSPACE_ID))
    .limit(1);
  console.log("6. Workspace exists:", existingWorkspace.length > 0);

  // Check user
  console.log("7. Checking user...");
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.id, GOLDEN_USER_ID))
    .limit(1);
  console.log("8. User exists:", existingUser.length > 0);

  // Try inserting a test source
  console.log("9. Inserting test source...");
  const testId = "golden-test-" + Date.now();
  const contentHash = createHash("sha256").update("test content").digest("hex");

  await db.insert(sources).values({
    id: testId,
    workspaceId: GOLDEN_WORKSPACE_ID,
    userId: GOLDEN_USER_ID,
    createdByUserId: GOLDEN_USER_ID,
    type: "drive",
    visibility: "workspace",
    externalId: testId,
    title: "Test Source",
    url: "https://example.com",
    contentHash,
    fullText: "test content",
    metadataJson: { test: true },
  });

  console.log("10. Source inserted successfully");

  // Delete the test source
  console.log("11. Deleting test source...");
  await db.delete(sources).where(eq(sources.id, testId));
  console.log("12. Test source deleted");

  process.exit(0);
}

test().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
