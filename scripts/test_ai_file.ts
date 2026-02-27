import "dotenv/config";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function logMemory(step: string) {
  const used = process.memoryUsage();
  console.log(`[MEM ${step}] heap: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
}

async function main() {
  logMemory("start");

  console.log("1. Reading AI_Search_Architecture.md...");
  const fixturesDir = join(__dirname, "..", "fixtures", "golden_docs");
  const content = readFileSync(join(fixturesDir, "AI_Search_Architecture.md"), "utf-8");
  console.log("   Length:", content.length);
  logMemory("after read");

  console.log("2. Waiting 5 seconds...");
  await new Promise(r => setTimeout(r, 5000));
  logMemory("after wait");

  console.log("Done!");
  process.exit(0);
}

main().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
