/**
 * Proof: Verify that the latest scope has a corresponding jobs row.
 *
 * Usage: npx tsx scripts/proof_enqueue_latest_scope.ts
 * Requires: DATABASE_URL env var
 */
import "dotenv/config";
import pg from "pg";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("ERROR: DATABASE_URL not set");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: dbUrl });

  try {
    // 1) Read latest scope
    const scopeRes = await pool.query(
      `SELECT id, type, account_id, user_id, workspace_id, created_at
       FROM user_connector_scopes
       ORDER BY created_at DESC
       LIMIT 1`
    );

    if (scopeRes.rows.length === 0) {
      console.log("No scopes found in DB. Cannot verify enqueue.");
      process.exit(1);
    }

    const scope = scopeRes.rows[0];
    console.log(`Latest scope: id=${scope.id} type=${scope.type} created=${scope.created_at}`);

    // 2) Check for jobs with this scope_id
    const jobRes = await pool.query(
      `SELECT id, status, type, connector_type, scope_id, created_at
       FROM jobs
       WHERE scope_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [scope.id]
    );

    if (jobRes.rows.length === 0) {
      console.error(`FAIL: No jobs found for scope ${scope.id}`);
      console.log("All jobs for this user:");
      const allJobs = await pool.query(
        `SELECT id, scope_id, status, type FROM jobs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`,
        [scope.user_id]
      );
      allJobs.rows.forEach(j => console.log(`  job=${j.id} scope=${j.scope_id} status=${j.status} type=${j.type}`));
      process.exit(1);
    }

    const job = jobRes.rows[0];
    console.log(`PASS: Job found for latest scope`);
    console.log(`  job_id=${job.id} status=${job.status} type=${job.type} connector=${job.connector_type} scope=${job.scope_id}`);

    // 3) Verify scope_id matches
    if (job.scope_id !== scope.id) {
      console.error(`FAIL: job.scope_id (${job.scope_id}) !== scope.id (${scope.id})`);
      process.exit(1);
    }

    console.log("PASS: scope_id matches correctly");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
