/**
 * Verification script for sync and retrieval fixes
 * Run with: npx tsx scripts/verify-sync-and-retrieval.ts <scopeId>
 * 
 * Uses the debug endpoint to verify:
 * - workspaceId is never null
 * - sources > 0 after sync
 * - chunks > 0 after sync
 * - Top sources have correct fields
 */

const SCOPE_ID = process.argv[2] || "a243be20-c194-40de-aa5a-cc6254f34179";
const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

async function main() {
    console.log("=== Sync & Retrieval Verification ===\n");
    console.log(`Scope ID: ${SCOPE_ID}`);
    console.log(`Base URL: ${BASE_URL}\n`);

    // Hit the debug summary endpoint
    const url = `${BASE_URL}/api/debug/scope/${SCOPE_ID}/summary?skip_auth=1`;
    console.log(`Fetching: ${url}\n`);

    const response = await fetch(url);

    if (!response.ok) {
        console.error(`❌ FAIL: HTTP ${response.status}`);
        const text = await response.text();
        console.error(text);
        process.exit(1);
    }

    const data = await response.json();
    console.log("Response:", JSON.stringify(data, null, 2));
    console.log("\n=== Assertions ===\n");

    let passed = 0;
    let failed = 0;

    // 1. workspaceId not null
    if (data.workspaceId) {
        console.log(`✅ PASS: workspaceId = "${data.workspaceId}"`);
        passed++;
    } else {
        console.error(`❌ FAIL: workspaceId is null or empty`);
        failed++;
    }

    // 2. latestJob.workspaceId not null
    if (data.latestJob?.workspaceId) {
        console.log(`✅ PASS: latestJob.workspaceId = "${data.latestJob.workspaceId}"`);
        passed++;
    } else if (data.latestJob) {
        console.warn(`⚠️ WARN: latestJob exists but workspaceId is null`);
        failed++;
    } else {
        console.log(`— SKIP: No latestJob found`);
    }

    // 3. sources > 0
    if (data.counts.sources > 0) {
        console.log(`✅ PASS: sources count = ${data.counts.sources}`);
        passed++;
    } else {
        console.error(`❌ FAIL: sources count = 0`);
        failed++;
    }

    // 4. chunks > 0
    if (data.counts.chunks > 0) {
        console.log(`✅ PASS: chunks count = ${data.counts.chunks}`);
        passed++;
    } else {
        console.error(`❌ FAIL: chunks count = 0`);
        failed++;
    }

    // 5. All topSources have workspaceId and createdByUserId
    const topSources = data.topSources || [];
    let allHaveWorkspace = true;
    let allHaveCreator = true;

    for (const s of topSources) {
        if (!s.workspaceId) allHaveWorkspace = false;
        if (!s.createdByUserId) allHaveCreator = false;
    }

    if (topSources.length > 0) {
        if (allHaveWorkspace) {
            console.log(`✅ PASS: All ${topSources.length} sources have workspaceId`);
            passed++;
        } else {
            console.error(`❌ FAIL: Some sources missing workspaceId`);
            failed++;
        }

        if (allHaveCreator) {
            console.log(`✅ PASS: All ${topSources.length} sources have createdByUserId`);
            passed++;
        } else {
            console.error(`❌ FAIL: Some sources missing createdByUserId`);
            failed++;
        }
    }

    // 6. Check job status
    if (data.latestJob) {
        console.log(`ℹ️ Job status: ${data.latestJob.status}`);
        if (data.latestRun) {
            const stats = data.latestRun.statsJson || {};
            console.log(`ℹ️ Run stats: discovered=${stats.docsDiscovered || stats.discovered || 0}, processed=${stats.sourcesUpserted || stats.processed || 0}, chunks=${stats.chunksCreated || 0}`);
        }
    }

    console.log("\n=== Summary ===");
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
        console.log("\n❌ VERIFICATION FAILED");
        process.exit(1);
    } else {
        console.log("\n✅ VERIFICATION PASSED");
        process.exit(0);
    }
}

main().catch((err) => {
    console.error("Verification error:", err);
    process.exit(1);
});
