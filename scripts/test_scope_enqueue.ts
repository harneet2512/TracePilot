/**
 * Direct test of scope save -> job enqueue for scopeId a24fb115-229d-41e4-82cf-c41507d6dc82
 * 
 * This script:
 * 1. Logs in to get a session
 * 2. Calls PATCH /api/user-connector-scopes/:id for the specific scope
 * 3. Verifies job was created in DB
 * 
 * Prerequisites:
 * - DATABASE_URL set
 * - Server running on localhost:5000
 */

import pg from 'pg';
const { Pool } = pg;

const SCOPE_ID = "a24fb115-229d-41e4-82cf-c41507d6dc82";
const API_BASE = "http://localhost:5000";

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error(`ERROR: DATABASE_URL not set.
Set it with: $env:DATABASE_URL="postgres://postgres:postgres@localhost:5433/fieldcopilot_test"`);
        process.exit(1);
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        console.log(`=== Testing Scope Save -> Job Enqueue ===`);
        console.log(`Target Scope: ${SCOPE_ID}\n`);

        // Step 1: Check if scope exists in DB
        console.log("1. Checking if scope exists in DB...");
        const scopeRes = await pool.query(
            `SELECT id, type, user_id, workspace_id, account_id FROM user_connector_scopes WHERE id = $1`,
            [SCOPE_ID]
        );

        if (scopeRes.rows.length === 0) {
            console.error(`   ERROR: Scope ${SCOPE_ID} does not exist in DB!`);
            console.log("   You need to create this scope first via the UI.");
            process.exit(1);
        }

        const scope = scopeRes.rows[0];
        console.log(`   Found: type=${scope.type}, user=${scope.user_id}, workspace=${scope.workspace_id}`);

        // Step 2: Count jobs BEFORE the test
        console.log("\n2. Counting jobs BEFORE test...");
        const beforeRes = await pool.query(
            `SELECT count(*)::int as count FROM jobs WHERE scope_id = $1`,
            [SCOPE_ID]
        );
        const countBefore = beforeRes.rows[0].count;
        console.log(`   Jobs for this scope: ${countBefore}`);

        // Step 3: Login to get session
        console.log("\n3. Logging in...");
        const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "admin@example.com", password: "admin123" }),
        });

        if (!loginRes.ok) {
            console.error(`   Login failed: ${loginRes.status}`);
            const text = await loginRes.text();
            console.error(`   ${text}`);
            process.exit(1);
        }

        const cookies = loginRes.headers.get("set-cookie");
        if (!cookies) {
            console.error("   No session cookie returned!");
            process.exit(1);
        }
        console.log(`   Login OK, got session cookie.`);

        // Step 4: Call PATCH to trigger save
        console.log(`\n4. Calling PATCH /api/user-connector-scopes/${SCOPE_ID}...`);
        const patchRes = await fetch(`${API_BASE}/api/user-connector-scopes/${SCOPE_ID}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Cookie": cookies.split(";")[0],
            },
            body: JSON.stringify({
                syncMode: "full",  // Force full sync to ensure content is fetched
            }),
        });

        const patchBody = await patchRes.json();
        console.log(`   Response: ${patchRes.status}`);
        console.log(`   Body: ${JSON.stringify(patchBody, null, 2).slice(0, 500)}`);

        if (!patchRes.ok) {
            console.error(`   PATCH failed!`);
            process.exit(1);
        }

        // Step 5: Wait a moment for async processing
        console.log("\n5. Waiting 2s for job to be processed...");
        await new Promise(r => setTimeout(r, 2000));

        // Step 6: Count jobs AFTER the test
        console.log("\n6. Counting jobs AFTER test...");
        const afterRes = await pool.query(
            `SELECT count(*)::int as count FROM jobs WHERE scope_id = $1`,
            [SCOPE_ID]
        );
        const countAfter = afterRes.rows[0].count;
        console.log(`   Jobs for this scope: ${countAfter}`);

        if (countAfter > countBefore) {
            console.log(`\n✅ SUCCESS: Job was created! (${countBefore} -> ${countAfter})`);
        } else {
            console.log(`\n❌ FAILED: No new job created. Check server logs for [enqueue] messages.`);
            process.exit(1);
        }

        // Step 7: Show the latest job details
        console.log("\n7. Latest job for this scope:");
        const jobRes = await pool.query(
            `SELECT j.id, j.status, j.connector_type, j.scope_id, j.created_at,
              jr.stats_json, jr.error
       FROM jobs j
       LEFT JOIN job_runs jr ON jr.job_id = j.id
       WHERE j.scope_id = $1
       ORDER BY j.created_at DESC
       LIMIT 1`,
            [SCOPE_ID]
        );

        if (jobRes.rows.length > 0) {
            const job = jobRes.rows[0];
            console.log(`   ID: ${job.id}`);
            console.log(`   Status: ${job.status}`);
            console.log(`   Connector: ${job.connector_type}`);
            console.log(`   Created: ${job.created_at}`);
            console.log(`   Stats: ${JSON.stringify(job.stats_json || {})}`);
            if (job.error) console.log(`   Error: ${job.error}`);
        }

    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
