/**
 * Direct DB test to:
 * 1. Insert a job for scope a24fb115-229d-41e4-82cf-c41507d6dc82
 * 2. Wait for job runner to process it
 * 3. Verify fixtures persist sources/versions/chunks
 * 
 * This bypasses auth issues by going straight to DB.
 */

import pg from 'pg';
import { randomUUID } from 'crypto';
const { Pool } = pg;

const SCOPE_ID = "a24fb115-229d-41e4-82cf-c41507d6dc82";

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error(`ERROR: DATABASE_URL not set.
Set it with: $env:DATABASE_URL="postgres://postgres:postgres@localhost:5433/fieldcopilot_test"`);
        process.exit(1);
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
        console.log(`=== Direct DB Job Insertion Test ===`);
        console.log(`Target Scope: ${SCOPE_ID}`);
        console.log(`DEV_CONNECTOR_FIXTURES: ${process.env.DEV_CONNECTOR_FIXTURES || 'not set'}\n`);

        // Step 1: Get scope details
        console.log("1. Getting scope details...");
        const scopeRes = await pool.query(
            `SELECT id, type, user_id, workspace_id, account_id, sync_mode FROM user_connector_scopes WHERE id = $1`,
            [SCOPE_ID]
        );

        if (scopeRes.rows.length === 0) {
            console.error(`   ERROR: Scope ${SCOPE_ID} not found!`);
            process.exit(1);
        }

        const scope = scopeRes.rows[0];
        console.log(`   type=${scope.type}, user=${scope.user_id}, workspace=${scope.workspace_id}, syncMode=${scope.sync_mode}`);

        // Step 2: Insert job directly
        console.log("\n2. Inserting job directly into DB...");
        const jobId = randomUUID();
        const now = new Date();
        const idempotencyKey = `test:${SCOPE_ID}:${now.getTime()}`;

        const syncType = scope.type === 'google' ? 'google' : scope.type;
        const inputJson = {
            scopeId: SCOPE_ID,
            userId: scope.user_id,
            connectorType: syncType,
            accountId: scope.account_id,
        };

        await pool.query(`
      INSERT INTO jobs (id, workspace_id, user_id, type, connector_type, scope_id, status, 
                        priority, attempts, max_attempts, input_json, idempotency_key, created_at, updated_at, next_run_at)
      VALUES ($1, $2, $3, 'sync', $4, $5, 'pending', 0, 0, 3, $6, $7, $8, $8, $8)
    `, [jobId, scope.workspace_id, scope.user_id, syncType, SCOPE_ID, inputJson, idempotencyKey, now]);

        console.log(`   Inserted job: ${jobId}`);
        console.log(`   connector_type: ${syncType}`);
        console.log(`   scope_id: ${SCOPE_ID}`);
        console.log(`   input_json: ${JSON.stringify(inputJson)}`);

        // Step 3: Wait for job to be processed
        console.log("\n3. Waiting for job runner to process (up to 30s)...");
        let attempt = 0;
        let jobStatus = 'pending';

        while (attempt < 30 && !['completed', 'failed', 'dead_letter'].includes(jobStatus)) {
            await new Promise(r => setTimeout(r, 1000));
            attempt++;

            const checkRes = await pool.query(`SELECT status FROM jobs WHERE id = $1`, [jobId]);
            if (checkRes.rows.length > 0) {
                jobStatus = checkRes.rows[0].status;
                if (attempt % 5 === 0 || ['completed', 'failed', 'dead_letter'].includes(jobStatus)) {
                    console.log(`   [${attempt}s] status: ${jobStatus}`);
                }
            }
        }

        // Step 4: Get job run details
        console.log("\n4. Job run details:");
        const runRes = await pool.query(`
      SELECT id, status, error, stats_json FROM job_runs WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1
    `, [jobId]);

        if (runRes.rows.length > 0) {
            const run = runRes.rows[0];
            console.log(`   status: ${run.status}`);
            console.log(`   stats: ${JSON.stringify(run.stats_json || {})}`);
            if (run.error) console.log(`   error: ${run.error}`);
        } else {
            console.log(`   No job run found!`);
        }

        // Step 5: Check persisted data for this scope
        console.log("\n5. Checking persisted data for this scope...");

        const sourcesRes = await pool.query(`
      SELECT count(*)::int as count FROM sources WHERE metadata_json::text LIKE $1
    `, [`%${SCOPE_ID}%`]);

        const versionsRes = await pool.query(`
      SELECT count(*)::int as count FROM source_versions sv
      JOIN sources s ON s.id = sv.source_id
      WHERE s.metadata_json::text LIKE $1
    `, [`%${SCOPE_ID}%`]);

        const chunksRes = await pool.query(`
      SELECT count(*)::int as count FROM chunks WHERE metadata_json::text LIKE $1
    `, [`%${SCOPE_ID}%`]);

        console.log(`   sources with scopeId: ${sourcesRes.rows[0].count}`);
        console.log(`   source_versions: ${versionsRes.rows[0].count}`);
        console.log(`   chunks with scopeId: ${chunksRes.rows[0].count}`);

        // Step 6: Verdict
        console.log("\n=== VERDICT ===");
        if (jobStatus === 'completed' && chunksRes.rows[0].count > 0) {
            console.log("✅ SUCCESS: Job completed AND chunks were persisted!");
        } else if (jobStatus === 'completed' && chunksRes.rows[0].count === 0) {
            console.log("⚠️ PARTIAL: Job completed but 0 chunks persisted. Check fixture mode.");
        } else if (jobStatus === 'failed' || jobStatus === 'dead_letter') {
            console.log("❌ FAILED: Job failed. Check error message above.");
        } else {
            console.log(`⏳ TIMEOUT: Job still ${jobStatus} after 30s. Check server logs.`);
        }

    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
