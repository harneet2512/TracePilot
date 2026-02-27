
import pg from 'pg';
import { randomUUID } from 'crypto';
import "dotenv/config";
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const { Pool } = pg;

const API_BASE = "http://localhost:5000";
const jar = new CookieJar();
const client = wrapper(axios.create({ jar, baseURL: API_BASE }));

async function verifySync() {
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL missing");
        process.exit(1);
    }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        console.log("1. Setup: Creating Mock Data...");

        // Login first to get user
        console.log("   Logging in...");
        const loginRes = await client.post('/api/auth/login', {
            email: 'admin@fieldcopilot.com',
            password: 'admin123'
        });
        const user = loginRes.data;
        const userId = user.id;
        console.log("   Logged in as:", userId);

        // Create Connector (Global definition)
        const connId = randomUUID();
        await pool.query(`INSERT INTO connectors (id, type, name, status, config_json, created_at, updated_at) VALUES ($1, 'google', 'Mock Drive', 'active', '{}', NOW(), NOW()) ON CONFLICT DO NOTHING`, [connId]);

        // Create Account (User specific)
        const accId = randomUUID();
        // Added workspace_id
        await pool.query(`INSERT INTO user_connector_accounts (id, user_id, type, status, metadata_json, created_at, updated_at, access_token, workspace_id) VALUES ($1, $2, 'google', 'active', '{}', NOW(), NOW(), 'mock-token', 'default-workspace')`,
            [accId, userId]);

        // Create Scope
        const scopeId = randomUUID();
        await pool.query(`INSERT INTO user_connector_scopes (id, user_id, account_id, workspace_id, type, scope_config_json, created_at, updated_at) VALUES ($1, $2, $3, 'default-workspace', 'drive', '{}', NOW(), NOW())`,
            [scopeId, userId, accId]);

        console.log(`   Created Scope: ${scopeId}`);

        // Count jobs
        const resBefore = await pool.query('SELECT count(*) FROM jobs WHERE scope_id = $1', [scopeId]);
        const countBefore = parseInt(resBefore.rows[0].count);

        console.log("2. Trigger: Calling PATCH /api/user-connector-scopes...");
        const patchRes = await client.patch(`/api/user-connector-scopes/${scopeId}`, {
            syncMode: "full"
        });
        console.log("   Patch Status:", patchRes.status);
        if (patchRes.status !== 200) throw new Error("Patch failed");

        console.log("3. Verification: Waiting for Job...");
        let attempts = 0;
        let jobFound = null;
        while (attempts < 10) {
            await new Promise(r => setTimeout(r, 1000));
            const jobRes = await pool.query('SELECT * FROM jobs WHERE scope_id = $1 ORDER BY created_at DESC LIMIT 1', [scopeId]);
            if (jobRes.rows.length > 0) {
                const job = jobRes.rows[0];
                if (parseInt(jobRes.rows[0].id) !== 0) { // Just ensure it exists
                    jobFound = job;
                    console.log(`   Attempt ${attempts}: Job Status = ${job.status}`);
                    if (job.status !== 'pending') {
                        console.log("   Job picked up by runner!");
                        break;
                    }
                }
            }
            attempts++;
        }

        if (jobFound) {
            console.log("PASS: Job was enqueued and exists in DB.");
            if (jobFound.status !== 'pending') {
                console.log("PASS: Job Runner picked up the job (status changed).");
            } else {
                console.log("WARN: Job is still pending.");
            }
        } else {
            console.log("FAIL: No job found.");
            process.exit(1);
        }

    } catch (e: any) {
        console.error("FAIL: Error.", e.message);
        if (e.response) console.error(e.response.data);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

verifySync();
