import "dotenv/config";
import { getDb } from "../server/db";
import { chunks, sources, sourceVersions } from "../shared/schema";
import { like, sql } from "drizzle-orm";

async function main() {
  console.log("1. Getting db...");
  const db = await getDb();

  console.log("2. Counting sources...");
  const sourceCount = await db.select({ count: sql`count(*)` }).from(sources);
  console.log("   Total sources:", sourceCount[0].count);

  const goldenSources = await db.select({ count: sql`count(*)` }).from(sources).where(like(sources.id, "golden-%"));
  console.log("   Golden sources:", goldenSources[0].count);

  console.log("3. Counting sourceVersions...");
  const svCount = await db.select({ count: sql`count(*)` }).from(sourceVersions);
  console.log("   Total sourceVersions:", svCount[0].count);

  console.log("4. Counting chunks...");
  const chunkCount = await db.select({ count: sql`count(*)` }).from(chunks);
  console.log("   Total chunks:", chunkCount[0].count);

  const goldenChunks = await db.select({ count: sql`count(*)` }).from(chunks).where(like(chunks.id, "golden-%"));
  console.log("   Golden chunks:", goldenChunks[0].count);

  console.log("Done!");
  process.exit(0);
}

main().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
