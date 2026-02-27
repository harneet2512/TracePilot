import "dotenv/config";
import pg from "pg";
const { Pool } = pg;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const result = await pool.query(`
    SELECT trigger_name, event_manipulation, event_object_table, action_statement
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
  `);

  console.log("Triggers found:", result.rows.length);
  for (const row of result.rows) {
    console.log(`- ${row.trigger_name} on ${row.event_object_table} (${row.event_manipulation})`);
  }

  await pool.end();
}

main().catch(console.error);
