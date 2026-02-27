
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = "http://localhost:5000"; // Assuming PORT 5000 based on .env
const ACCOUNT_ID = "2bfc786e-953d-4c71-bbce-60d91b729c30";
const SCOPE_ID = "9b4e7977-36f9-45ef-a9b9-63578acdac38";

async function verifyGoogleSync() {
    console.log("=== VERIFICATION START ===");

    // 0. Check DB Mismatch via debug endpoint vs env
    /* 
       We can't easily get the runner's fingerprint here unless we scrape logs, 
       but we can check if the API is returning what we expect.
    */

    // 1. Check Token Status
    console.log(`Checking Token Status for Account ${ACCOUNT_ID}...`);
    try {
        const tokenRes = await fetch(`${BASE_URL}/api/debug/google/token-status/${ACCOUNT_ID}`);
        if (tokenRes.status !== 200) {
            console.error(`FAIL: Token Status Endpoint Returned ${tokenRes.status}`);
            return;
        }
        const tokenData = await tokenRes.json();
        console.log("Token Status:", JSON.stringify(tokenData, null, 2));

        if (!tokenData.accountExists) {
            console.error(`FAIL: Account ${ACCOUNT_ID} missing from DB.`);
            return;
        }
        if (!tokenData.hasAccessToken) {
            console.error(`FAIL: Access Token missing.`);
            return;
        }
        if (!tokenData.hasRefreshToken) {
            console.warn(`WARNING: Refresh Token missing. If access token expires, sync will die.`);
        }
        if (tokenData.accessTokenDecryptedLen <= 0) {
            console.error(`FAIL: Token present but decryption failed (len=${tokenData.accessTokenDecryptedLen}). Encryption Key Mismatch?`);
            // We expect this to be the Failure Mode. 
            // Return failure but allow script to continue if we want to confirm job error? 
            // No, user wants "Expected PASS output" in final report, but currently it IS failing. 
            // I should report the failure accurately.
            return;
        }
        console.log("PASS: Token exists and validates.");

    } catch (e) {
        console.error("FAIL: Could not reach API server.", e);
        return;
    }

    // 2. Trigger Sync Job
    console.log("Triggering Sync Job...");
    try {
        /*
          We need to enqueue a job. We can use the runner exported function if we can import it, 
          or hit an endpoint if one exists. The user asked simply to "enqueue a sync job".
          Since I have access to the codebase, I'll use the script pattern to enqueue directly via DB/Runner logic 
          OR use the /api/jobs/sync endpoint if it exists. 
          Let's use the Runner for direct control, but wait... 
          "Trigger a sync for scopeId=..."
        */

        // Dynamic import to avoid env hoisting issues
        const { enqueueJob } = await import('../server/lib/jobs/runner');
        const { db } = await import('../server/db');
        const { workspaces } = await import('@shared/schema');

        const workspace = await db.query.workspaces.findFirst();

        const job = await enqueueJob({
            type: "sync",
            workspaceId: workspace?.id || "default-workspace",
            userId: "admin-user-id", // Assume admin
            payload: {
                scopeId: SCOPE_ID,
                accountId: ACCOUNT_ID,
                connectorType: "google",
                userId: "admin-user-id"
            },
            connectorType: "google",
            priority: 10
        });

        console.log(`Job Enqueued: ${job.id}`);

        // 3. Poll for Completion
        let attempts = 0;
        while (attempts < 20) {
            await new Promise(r => setTimeout(r, 1000));
            const pollRes = await db.query.jobs.findFirst({
                where: (jobs, { eq }) => eq(jobs.id, job.id)
            });

            if (!pollRes) continue;

            console.log(`Job Status: ${pollRes.status} (Attempt ${pollRes.attempts})`);

            if (pollRes.status === 'completed') {
                console.log("PASS: Job Completed Successfully.");
                return;
            }
            if (pollRes.status === 'dead_letter' || pollRes.status === 'failed') {
                console.log(`FAIL: Job ended in ${pollRes.status}. Check logs.`);
                // Fetch run error
                const runs = await db.query.jobRuns.findMany({
                    where: (runs, { eq }) => eq(runs.jobId, job.id),
                    orderBy: (runs, { desc }) => [desc(runs.createdAt)],
                    limit: 1
                });
                if (runs.length > 0) {
                    console.error(`Last Run Error: ${runs[0].error}`);
                }
                return;
            }
            attempts++;
        }
        console.log("TIMEOUT: Job did not complete in time.");

    } catch (e) {
        console.error("FAIL: Enqueue/Polling failed:", e);
    }
}

verifyGoogleSync();
