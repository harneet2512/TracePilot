/**
 * Diagnose RAG retrieval pipeline for a specific scope
 * Checks: visibility, workspace, sourceVersionId matching
 */
import "dotenv/config";
import { Client } from "pg";

const SCOPE_ID = "a24fb115-229d-41e4-82cf-c41507d6dc82";

async function diagnose() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    console.log("\n=== RAG PIPELINE DIAGNOSIS ===\n");
    console.log("Scope ID:", SCOPE_ID);
    console.log("DATABASE_URL:", process.env.DATABASE_URL?.substring(0, 50) + "...");
    console.log("DEV_CONNECTOR_FIXTURES:", process.env.DEV_CONNECTOR_FIXTURES || "NOT SET");

    // 1. Check sources for this scope
    console.log("\n--- STEP 1: Sources ---");
    const sources = await client.query(`
    SELECT id, title, type, visibility, workspace_id, created_by_user_id, url
    FROM sources
    WHERE metadata_json::text LIKE '%${SCOPE_ID}%'
    LIMIT 10
  `);
    console.log(`Found ${sources.rowCount} sources for scope`);
    console.table(sources.rows);

    // 2. Check if ANY sources exist in workspace
    const allSources = await client.query(`
    SELECT workspace_id, COUNT(*) as count, 
           COUNT(CASE WHEN visibility IS NULL THEN 1 END) as null_visibility,
           COUNT(CASE WHEN visibility = 'workspace' THEN 1 END) as workspace_visibility,
           COUNT(CASE WHEN visibility = 'private' THEN 1 END) as private_visibility
    FROM sources
    GROUP BY workspace_id
  `);
    console.log("\n--- STEP 2: Source visibility breakdown ---");
    console.table(allSources.rows);

    // 3. Check source_versions with isActive
    console.log("\n--- STEP 3: Active Source Versions ---");
    const versions = await client.query(`
    SELECT sv.id, sv.source_id, sv.workspace_id, sv.is_active, s.title
    FROM source_versions sv
    JOIN sources s ON s.id = sv.source_id
    WHERE s.metadata_json::text LIKE '%${SCOPE_ID}%'
    LIMIT 10
  `);
    console.log(`Found ${versions.rowCount} source versions`);
    console.table(versions.rows);

    // 4. Check chunks
    console.log("\n--- STEP 4: Chunks ---");
    const chunks = await client.query(`
    SELECT c.id, c.workspace_id, c.source_id, c.source_version_id,
           LEFT(c.content, 50) as content_preview
    FROM chunks c
    WHERE c.metadata_json::text LIKE '%${SCOPE_ID}%'
    LIMIT 5
  `);
    console.log(`Found ${chunks.rowCount} chunks for scope`);
    console.table(chunks.rows);

    // 5. Check what retrieval would filter
    console.log("\n--- STEP 5: Retrieval Filter Check ---");
    const retrievable = await client.query(`
    SELECT s.id, s.title, s.visibility, s.workspace_id, s.created_by_user_id,
           COUNT(c.id) as chunk_count
    FROM sources s
    LEFT JOIN chunks c ON c.source_id = s.id
    WHERE s.metadata_json::text LIKE '%${SCOPE_ID}%'
    GROUP BY s.id, s.title, s.visibility, s.workspace_id, s.created_by_user_id
  `);
    console.table(retrievable.rows);

    // Diagnose visibility issue
    if (sources.rowCount > 0 && sources.rows.every((r: any) => r.visibility === null)) {
        console.log("\n🚨 ISSUE FOUND: All sources have NULL visibility!");
        console.log("   → Retrieval code filters by visibility='workspace' OR visibility='private'");
        console.log("   → NULL values are filtered out, causing 0 chunks returned");
        console.log("\n   FIX: Update sources to have visibility='workspace':");
        console.log(`   UPDATE sources SET visibility = 'workspace' WHERE metadata_json::text LIKE '%${SCOPE_ID}%';`);
    }

    await client.end();
    console.log("\n=== DIAGNOSIS COMPLETE ===\n");
}

diagnose().catch(console.error);
