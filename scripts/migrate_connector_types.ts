
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function migrate() {
    try {
        console.log("Starting connector type migration...");

        // 1. Migrate Jobs
        console.log("Checking jobs...");
        const jobsRes = await pool.query(`SELECT count(*) FROM jobs WHERE connector_type IN ('drive', 'google-drive', 'gdrive')`);
        console.log(`Found ${jobsRes.rows[0].count} bad jobs.`);

        if (parseInt(jobsRes.rows[0].count) > 0) {
            await pool.query(`UPDATE jobs SET connector_type = 'google' WHERE connector_type IN ('drive', 'google-drive', 'gdrive')`);
            console.log("Fixed jobs.");
        }

        // 2. Migrate Locks
        console.log("Checking job_locks...");
        // job_locks has enum constraint? Check schema.
        // It has check constraint likely if created via Drizzle enum.
        // We will try update, if it fails due to constraint, we might need to alter type or delete bad locks.
        try {
            await pool.query(`UPDATE job_locks SET connector_type = 'google' WHERE connector_type IN ('drive')`);
            console.log("Fixed job_locks.");
        } catch (e) {
            console.log("Skipping job_locks update (might be empty or constraint):", e.message);
        }

        // 3. User Connector Accounts (should be google already, but check aliases)
        console.log("Checking user_connector_accounts...");
        const accRes = await pool.query(`SELECT count(*) FROM user_connector_accounts WHERE type IN ('drive')`);
        console.log(`Found ${accRes.rows[0].count} bad accounts.`);
        if (parseInt(accRes.rows[0].count) > 0) {
            await pool.query(`UPDATE user_connector_accounts SET type = 'google' WHERE type IN ('drive')`);
            console.log("Fixed accounts.");
        }

        // 4. Verify Final State
        const verifyRes = await pool.query(`SELECT connector_type, count(*) as c FROM jobs GROUP BY connector_type`);
        console.log("Job Types Distribution:");
        verifyRes.rows.forEach(r => console.log(` - ${r.connector_type}: ${r.c}`));

    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await pool.end();
    }
}

migrate();
