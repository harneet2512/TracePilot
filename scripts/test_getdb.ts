import "dotenv/config";
console.log("1. Starting...");
import { getDb } from "../server/db";
console.log("2. db module imported");

async function test() {
  console.log("3. Getting db...");
  const db = await getDb();
  console.log("4. Got db");
  process.exit(0);
}

test().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
