
import pg from 'pg';
import { randomUUID } from 'crypto';

const { Pool } = pg;

async function main() {
    console.log("Starting proof_ingestion_counts...");

    const pool = new Pool({
        host: 'localhost',
        port: 5433,
        database: 'fieldcopilot_test',
        user: 'postgres',
        password: process.env.DB_PASSWORD || 'postgres'
    });

    try {
        // 1. Setup Test Data
        console.log("\n1. Setting up test data...");

        // Create Workspace & User
        const workspaceId = randomUUID();
        await pool.query('INSERT INTO workspaces (id, name, created_at) VALUES ($1, $2, NOW())', [workspaceId, "Proof Workspace"]);

        const userId = randomUUID();
        await pool.query('INSERT INTO users (id, workspace_id, email, role, created_at) VALUES ($1, $2, $3, $4, NOW())',
            [userId, workspaceId, `proof-${Date.now()}@test.com`, "admin"]);

        // Create Account & Scope
        const accountId = randomUUID();
        await pool.query('INSERT INTO user_connector_accounts (id, workspace_id, user_id, type, access_token, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())',
            [accountId, workspaceId, userId, "google", "mock_token", "connected"]);

        const scopeId = randomUUID();
        // jsonb must be stringified
        await pool.query('INSERT INTO user_connector_scopes (id, workspace_id, account_id, user_id, type, scope_config_json, sync_mode, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())',
            [scopeId, workspaceId, accountId, userId, "google", "{}", "smart"]);

        console.log(`Created Scope: ${scopeId}`);

        // 2. Insert Dummy Sources & Chunks
        console.log("\n2. Inserting dummy sources/chunks...");

        const sourceId = randomUUID();
        const metadataJson = JSON.stringify({ scopeId });
        await pool.query('INSERT INTO sources (id, workspace_id, user_id, created_by_user_id, type, title, content_hash, metadata_json, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())',
            [sourceId, workspaceId, userId, userId, "drive", "Proof Source", "hash123", metadataJson]);

        const versionId = randomUUID();
        await pool.query('INSERT INTO source_versions (id, workspace_id, source_id, version, content_hash, is_active, created_at, ingested_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())',
            [versionId, workspaceId, sourceId, 1, "hash123", true]);

        await pool.query('INSERT INTO chunks (id, workspace_id, source_id, source_version_id, chunk_index, text, user_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())',
            [randomUUID(), workspaceId, sourceId, versionId, 0, "Chunk 1", userId]);
        await pool.query('INSERT INTO chunks (id, workspace_id, source_id, source_version_id, chunk_index, text, user_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())',
            [randomUUID(), workspaceId, sourceId, versionId, 1, "Chunk 2", userId]);

        // 3. Verify getCountsByScope (simulation)
        console.log("\n3. Verifying Counts...");
        const sourcesRes = await pool.query("SELECT count(*)::int as count FROM sources WHERE metadata_json->>'scopeId' = $1", [scopeId]);
        const chunksRes = await pool.query("SELECT count(*)::int as count FROM chunks WHERE source_id IN (SELECT id FROM sources WHERE metadata_json->>'scopeId' = $1)", [scopeId]);

        const counts = {
            sources: sourcesRes.rows[0].count,
            chunks: chunksRes.rows[0].count
        };
        console.log("Counts:", counts);

        if (counts.sources !== 1 || counts.chunks !== 2) {
            console.error("FAILED: Counts do not match expected values (1 source, 2 chunks)");
            process.exit(1);
        } else {
            console.log("PASSED: Counts match.");
        }

        // 4. Create Dummy Job & JobRun with Stats
        console.log("\n4. Creating dummy job with stats...");
        const jobId = randomUUID();
        await pool.query('INSERT INTO jobs (id, workspace_id, user_id, type, connector_type, scope_id, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())',
            [jobId, workspaceId, userId, "sync", "google", scopeId, "completed"]);

        const runId = randomUUID();
        const stats = JSON.stringify({
            stage: "done",
            docsDiscovered: 10,
            docsFetched: 10,
            sourcesUpserted: 1,
            chunksCreated: 2
        });

        await pool.query('INSERT INTO job_runs (id, job_id, attempt_number, status, stats_json, created_at, started_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())',
            [runId, jobId, 1, "completed", stats]);

        // 5. Verify Latest Job
        console.log("\n5. Verifying Latest Job...");
        const jobRes = await pool.query('SELECT * FROM jobs WHERE scope_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT 1', [scopeId, "sync"]);
        const latestJob = jobRes.rows[0];
        console.log("Latest Job ID:", latestJob?.id);

        if (latestJob?.id !== jobId) {
            console.error("FAILED: Correct latest job not found");
            process.exit(1);
        } else {
            console.log("PASSED: Found latest job.");
        }

        // 6. Verify Latest Run
        console.log("\n6. Verifying Latest Run...");
        const runRes = await pool.query('SELECT * FROM job_runs WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1', [jobId]);
        const latestRun = runRes.rows[0];
        console.log("Latest Run Stats:", latestRun?.stats_json);

        if (!latestRun || latestRun.stats_json.stage !== "done") {
            console.error("FAILED: Job run stats not retrieved correctly");
            process.exit(1);
        } else {
            console.log("PASSED: Retrieved job run stats.");
        }

        console.log("\nProof script completed successfully!");

    } catch (e) {
        console.error(e);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
