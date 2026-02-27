
import dotenv from 'dotenv';
dotenv.config();

async function testEnqueue() {
    console.log("Testing Enqueue with alias 'drive'...");

    try {
        const { enqueueJob } = await import('../server/lib/jobs/runner');
        const { db } = await import('../server/db');
        const { workspaces, users } = await import('@shared/schema');

        // Get a valid workspace
        const workspace = await db.query.workspaces.findFirst();
        if (!workspace) throw new Error("No workspace found in DB");

        // Get a valid user
        const user = await db.query.users.findFirst();
        if (!user) throw new Error("No user found in DB");

        console.log(`Using Workspace: ${workspace.id}, User: ${user.id}`);

        const job = await enqueueJob({
            type: "sync" as any,
            userId: user.id,
            workspaceId: workspace.id,
            payload: {
                scopeId: "scope-1",
                userId: user.id,
                connectorType: "drive", // ALIAS!
                accountId: "acc-1"
            },
            connectorType: "drive", // ALIAS!
        });

        console.log(`Job Enqueued: ${job.id}`);
        console.log(`Stored Connector Type: ${job.connectorType}`);

        if (job.connectorType === "google") {
            console.log("PASS: Connector type normalized to 'google' in DB.");
        } else {
            console.log(`FAIL: Connector type is ${job.connectorType}`);
        }

    } catch (e) {
        console.error("Enqueue failed:", e);
    }
}

testEnqueue().catch(console.error);
