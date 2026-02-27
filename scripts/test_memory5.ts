// Same as test_memory4 but with chunks table cleanup
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

  console.log("1. Getting db...");
  const db = await getDb();
  logMemory("after getDb");

  console.log("2. Cleaning chunks...");
  await db.delete(chunks).where(like(chunks.id, "test5-%"));
  logMemory("after chunk cleanup");

  console.log("3. Cleaning sourceVersions...");
  await db.delete(sourceVersions).where(like(sourceVersions.id, "test5-%"));
  logMemory("after sv cleanup");

  console.log("4. Cleaning sources...");
  await db.delete(sources).where(like(sources.id, "test5-%"));
  logMemory("after source cleanup");

  console.log("Done!");
  process.exit(0);
}

main().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
