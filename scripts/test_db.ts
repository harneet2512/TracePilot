import "dotenv/config";
import pg from "pg";
const { Pool } = pg;

console.log("Testing database connection...");
console.log("DATABASE_URL:", process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@"));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000
});

pool.query("SELECT 1 as test")
  .then(r => {
    console.log("Connection successful:", r.rows);
    return pool.end();
  })
  .then(() => process.exit(0))
  .catch(e => {
    console.error("Connection failed:", e.message);
    process.exit(1);
  });
