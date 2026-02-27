
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { decryptToken, encryptToken } from '../server/lib/oauth';
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function debugCrypto(accountId) {
    try {
        console.log(`Debugging crypto for account ${accountId}...`);

        // Check Env
        if (!process.env.ENCRYPTION_KEY) {
            console.error("ERROR: process.env.ENCRYPTION_KEY is missing!");
        } else {
            console.log("ENCRYPTION_KEY is set (length=" + process.env.ENCRYPTION_KEY.length + ")");
        }

        const res = await pool.query(`SELECT access_token FROM user_connector_accounts WHERE id = $1`, [accountId]);

        if (res.rows.length === 0) {
            console.log("Account NOT FOUND.");
            return;
        }

        const rawToken = res.rows[0].access_token;
        console.log(`Raw Token from DB: ${rawToken ? rawToken.substring(0, 10) + '...' : 'NULL'}`);

        try {
            const decrypted = decryptToken(rawToken);
            if (decrypted) {
                console.log(`Decryption SUCCESS! Length: ${decrypted.length}`);
            } else {
                console.log("Decryption returned EMPTY string.");
            }
        } catch (e) {
            console.error("Decryption FAILED:", e.message);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

const args = process.argv.slice(2);
if (args.length > 0) {
    debugCrypto(args[0]);
} else {
    console.log("Provide account ID");
}
