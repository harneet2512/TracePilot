
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function checkAccount(accountId) {
    try {
        console.log(`Checking account ${accountId}...`);
        const res = await pool.query(`SELECT id, type, status, access_token IS NOT NULL as has_token, external_account_id FROM user_connector_accounts WHERE id = $1`, [accountId]);

        if (res.rows.length === 0) {
            console.log("Account NOT FOUND.");
        } else {
            console.log("Account Found:", res.rows[0]);
            // Check if there are other accounts for this user
            // We can't easily get userId unless we query it or know it. 
            // But let's check basic health.
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

const args = process.argv.slice(2);
if (args.length > 0) {
    checkAccount(args[0]);
} else {
    console.log("Provide account ID");
}
