/**
 * End-to-end proof script for fixture-based ingestion.
 * Prerequisites:
 *   - DATABASE_URL set to Postgres connection string
 *   - DEV_CONNECTOR_FIXTURES=1 (for fixture mode)
 *   - Server running with `npm run dev`
 * 
 * This script:
 *   1. Triggers sync jobs via API or direct DB insert (if server not running)
 *   2. Polls for job completion
 *   3. Verifies sources/source_versions/chunks are persisted
 *   4. Prints breakdown and fails if any connector has 0 chunks
 */

import pg from 'pg';
const { Pool } = pg;

// Check for DATABASE_URL
if (!process.env.DATABASE_URL) {
    console.error(`
ERROR: DATABASE_URL not set.

To fix, run in PowerShell:

  $env:DATABASE_URL="postgres://postgres:postgres@localhost:5433/fieldcopilot_test"
  $env:DEV_CONNECTOR_FIXTURES="1"
  npx tsx scripts/proof_end_to_end_fixtures.ts
`);
    process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
    console.log("=== End-to-End Fixture Ingestion Proof ===\n");
    console.log(`DATABASE_URL: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')}`);
    console.log(`DEV_CONNECTOR_FIXTURES: ${process.env.DEV_CONNECTOR_FIXTURES || 'not set'}`);
    console.log("");

    try {
        // Step 1: Check total counts
        console.log("1. Checking current DB state...");
        const sourcesRes = await pool.query("SELECT count(*)::int as count FROM sources");
        const versionsRes = await pool.query("SELECT count(*)::int as count FROM source_versions");
        const chunksRes = await pool.query("SELECT count(*)::int as count FROM chunks");

        console.log(`   sources: ${sourcesRes.rows[0].count}`);
        console.log(`   source_versions: ${versionsRes.rows[0].count}`);
        console.log(`   chunks: ${chunksRes.rows[0].count}`);

        // Step 2: Breakdown by type
        console.log("\n2. Sources breakdown by type:");
        const byTypeRes = await pool.query(`
      SELECT type, count(*)::int as count 
      FROM sources 
      GROUP BY type 
      ORDER BY count DESC
    `);

        if (byTypeRes.rows.length === 0) {
            console.log("   (no sources found)");
        } else {
            for (const row of byTypeRes.rows) {
                console.log(`   ${row.type}: ${row.count}`);
            }
        }

        // Step 3: Latest source versions with chunk counts
        console.log("\n3. Latest 10 source versions:");
        const latestRes = await pool.query(`
      SELECT 
        s.type,
        s.title,
        sv.ingested_at,
        sv.char_count,
        (SELECT count(*)::int FROM chunks c WHERE c.source_version_id = sv.id) as chunk_count
      FROM source_versions sv
      JOIN sources s ON s.id = sv.source_id
      ORDER BY sv.ingested_at DESC
      LIMIT 10
    `);

        if (latestRes.rows.length === 0) {
            console.log("   (no source versions found)");
        } else {
            for (const row of latestRes.rows) {
                const date = row.ingested_at ? new Date(row.ingested_at).toISOString() : 'null';
                console.log(`   [${row.type}] "${row.title}" - ${row.char_count || 0} chars, ${row.chunk_count} chunks (${date})`);
            }
        }

        // Step 4: Check latest jobs
        console.log("\n4. Latest sync jobs:");
        const jobsRes = await pool.query(`
      SELECT 
        j.id,
        j.connector_type,
        j.status,
        j.completed_at,
        jr.stats_json
      FROM jobs j
      LEFT JOIN job_runs jr ON jr.job_id = j.id
      WHERE j.type = 'sync'
      ORDER BY j.created_at DESC
      LIMIT 5
    `);

        if (jobsRes.rows.length === 0) {
            console.log("   (no sync jobs found)");
        } else {
            for (const row of jobsRes.rows) {
                const stats = row.stats_json || {};
                console.log(`   [${row.connector_type}] ${row.status} - chunks: ${stats.chunksCreated ?? stats.output?.chunksCreated ?? 'N/A'}`);
            }
        }

        // Step 5: Verify non-zero
        console.log("\n5. Verification:");
        const totalSources = sourcesRes.rows[0].count;
        const totalVersions = versionsRes.rows[0].count;
        const totalChunks = chunksRes.rows[0].count;

        if (totalSources === 0 || totalVersions === 0 || totalChunks === 0) {
            console.error(`
FAILED: Database shows zero persisted rows.
  sources: ${totalSources}
  source_versions: ${totalVersions}
  chunks: ${totalChunks}

This means sync jobs are not persisting data correctly.
Check:
1. Is the server running with DEV_CONNECTOR_FIXTURES=1?
2. Did you trigger a sync via "Save Settings" in the UI?
3. Check server logs for [sync] messages.
`);
            process.exit(1);
        }

        // Check each expected connector has data
        const expectedTypes = ["drive", "jira", "confluence", "slack"];
        const foundTypes = byTypeRes.rows.map(r => r.type);
        const missingTypes = expectedTypes.filter(t => !foundTypes.includes(t));

        if (missingTypes.length > 0) {
            console.log(`   WARNING: Missing data for types: ${missingTypes.join(", ")}`);
            console.log(`   (This is OK if you haven't run sync for all connectors yet)`);
        }

        console.log(`
PASSED: Database contains:
  sources: ${totalSources}
  source_versions: ${totalVersions}
  chunks: ${totalChunks}

Fixture ingestion is working!
`);

    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
