
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function checkJob(jobId: string) {
    try {
        console.log(`Checking job ${jobId}...`);
        let res;
        // Try exact match
        res = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [jobId]);
        if (res.rows.length === 0) {
            // Try prefix match 
            res = await pool.query(`SELECT * FROM jobs WHERE id::text LIKE $1`, [`${jobId}%`]);
        }

        if (res.rows.length === 0) {
            console.log("Job not found in queue.");
            // List recent jobs
            const recent = await pool.query(`SELECT id, connector_type, status FROM jobs ORDER BY created_at DESC LIMIT 5`);
            console.log("Recent jobs:", recent.rows);
        } else {
            const job = res.rows[0];
            console.log("Job found:", job);
            const runs = await pool.query(`SELECT * FROM job_runs WHERE job_id = $1`, [job.id]);
            console.log("Job Runs:", JSON.stringify(runs.rows, null, 2));
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

const args = process.argv.slice(2);
if (args.length > 0) {
    checkJob(args[0]);
} else {
    console.log("Provide job ID");
}
