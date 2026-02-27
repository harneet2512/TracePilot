import "dotenv/config";
console.log("1. Starting...");
import { getDb } from "../server/db";
import { sources } from "../shared/schema";
import { like } from "drizzle-orm";
console.log("2. Modules imported");

async function test() {
  console.log("3. Getting db...");
  const db = await getDb();
  console.log("4. Got db, querying golden sources...");

  const goldenSources = await db
    .select()
    .from(sources)
    .where(like(sources.id, "golden-%"))
    .limit(10);

  console.log("5. Query done, found:", goldenSources.length, "sources");
  process.exit(0);
}

test().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
