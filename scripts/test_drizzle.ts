import "dotenv/config";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

const { Pool } = pg;

console.log("Testing drizzle connection...");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000
});

const db = drizzle(pool);

db.execute(sql`SELECT 1 as test`)
  .then(r => {
    console.log("Drizzle connection successful:", r.rows);
    return pool.end();
  })
  .then(() => process.exit(0))
  .catch(e => {
    console.error("Connection failed:", e.message);
    process.exit(1);
  });
