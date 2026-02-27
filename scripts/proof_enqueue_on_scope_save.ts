
import "dotenv/config";
import { db } from "../server/db";
import { jobs, userConnectorAccounts, userConnectorScopes } from "../shared/schema";
import { eq, desc } from "drizzle-orm";

const API_Base = "http://localhost:5000";

async function runProof() {
    console.log("🔍 Starting Proof: Enqueue Job on Scope Save...");

    // 1. Login
    const loginRes = await fetch(`${API_Base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@fieldcopilot.com", password: "admin123" }),
    });
    if (!loginRes.ok) {
        console.error("Login failed:", await loginRes.status, await loginRes.text());
        process.exit(1);
    }
    const cookie = loginRes.headers.get("set-cookie") || "";

    // 2. Find a Connector Account (Google preferrred)
    const accounts = await (db as any).select().from(userConnectorAccounts).limit(1);
    if (accounts.length === 0) { console.warn("No accounts found. Use UI to connect first."); process.exit(0); }
    const account = accounts[0];
    console.log(`👉 Using Account: ${account.type} (${account.id})`);

    // 3. Find/Create Scope
    let scopeId;
    const scopes = await (db as any).select().from(userConnectorScopes).where(eq(userConnectorScopes.accountId, account.id));
    if (scopes.length > 0) {
        scopeId = scopes[0].id;
    } else {
        console.log("Creating temporary scope...");
        const createRes = await fetch(`${API_Base}/api/user-connector-scopes`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: cookie },
            body: JSON.stringify({
                accountId: account.id,
                userId: account.userId,
                type: account.type,
                syncMode: "smart",
                contentStrategy: "smart",
                scopeConfigJson: {},
                exclusionsJson: {}
            })
        });
        const newScope = await createRes.json();
        scopeId = newScope.id;
    }

    // 4. Trigger Save (PATCH)
    console.log(`👉 Triggering Save for Scope ${scopeId}...`);

    // Construct payload that ensures a job is triggered (especially for Atlassian)
    const patchPayload: any = { syncMode: "full" };
    const type = account.type;

    if (type === 'atlassian') {
        patchPayload.scopeConfigJson = { projects: ["TEST_PROJ"], spaces: ["TEST_SPACE"] };
    } else if (type === 'google') {
        patchPayload.scopeConfigJson = { folders: ["root"] };
    } else if (type === 'slack') {
        patchPayload.scopeConfigJson = { channels: ["general"] };
    }

    const patchRes = await fetch(`http://localhost:5000/api/user-connector-scopes/${scopeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Cookie": cookie },
        body: JSON.stringify(patchPayload)
    });

    const responseBody = await patchRes.json();
    if (!patchRes.ok) {
        console.error("PATCH failed:", responseBody);
        process.exit(1);
    }
    console.log("✅ Save successful.");
    console.log("🐛 Server Debug Trace:", JSON.stringify(responseBody._debug, null, 2));

    // DEBUG: Fetch Scope to see what happened
    const [debugScope] = await (db as any).select().from(userConnectorScopes).where(eq(userConnectorScopes.id, scopeId));
    console.log("🕵️ Debug Scope State:");
    // console.log(JSON.stringify(debugScope, null, 2));
    console.log(`TYPE: ${debugScope.type}`);
    console.log(`CONFIG: ${JSON.stringify(debugScope.scopeConfigJson)}`);


    // 5. Verify Job Enqueued
    console.log("👉 Checking Jobs table (Any recent jobs)...");
    await new Promise(r => setTimeout(r, 2000));

    const recentJobs = await (db as any).select().from(jobs)
        .orderBy(desc(jobs.createdAt))
        .limit(5);

    console.log(`Found ${recentJobs.length} recent jobs.`);
    recentJobs.forEach((j: any) => {
        console.log(` - ID: ${j.id}, Type: ${j.type}, Scope: ${j.scopeId}, Created: ${j.createdAt}, Status: ${j.status}`);
        console.log(`   Key: ${j.idempotencyKey}`);
    });

    const specificJob = recentJobs.find((j: any) => j.scopeId === scopeId && j.type === 'sync');

    if (!specificJob) {
        console.error("❌ FAIL: Sync job for this scope not found in recent list.");
        process.exit(1);
    }

    const job = specificJob;
    console.log(`✅ Job Found! ID: ${job.id}`);
    console.log(`   Type: ${job.type}`);
    console.log(`   Param Input:`, JSON.stringify(job.inputJson));
    console.log(`   Status: ${job.status}`);

    if (job.type !== "sync") {
        console.error(`❌ FAIL: Expected job type 'sync', got '${job.type}'`);
        process.exit(1);
    }

    console.log("🎉 PROOF SUCCESS: Sync job auto-enqueued.");
    process.exit(0);
}

runProof();
