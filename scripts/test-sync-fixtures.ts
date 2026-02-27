
import { storage } from "../server/storage";
import { db } from "../server/db";
import { runSync } from "../server/lib/sync/orchestrator";
import { googleSyncEngine } from "../server/lib/sync/googleSync";
import { jiraSyncEngine } from "../server/lib/sync/jiraSync";
import { confluenceSyncEngine } from "../server/lib/sync/confluenceSync";
import { slackSyncEngine } from "../server/lib/sync/slackSync";
import { randomUUID } from "crypto";
import { InsertSourceVersion } from "@shared/schema";

async function main() {
    console.log("Starting Sync Persistence Verification...");

    // Set env var for fixtures
    process.env.DEV_CONNECTOR_FIXTURES = "1";

    // create dummy user
    const email = `test-user-${randomUUID()}@example.com`;
    let user = await storage.getUserByEmail(email);
    if (!user) {
        user = await storage.createUser({
            email,
            role: "admin",
            workspaceId: (await db.query.workspaces.findFirst()).id,
            passwordHash: "dummy"
        });
    }

    console.log(`Using user ${user.id} workspace ${user.workspaceId}`);

    // Creating account
    const account = await storage.createUserConnectorAccount({
        userId: user.id,
        workspaceId: user.workspaceId,
        type: "google",
        accessToken: "dummy",
        status: "connected"
    });

    // Create dummy scope
    const scope = await storage.createUserConnectorScope({
        userId: user.id,
        workspaceId: user.workspaceId,
        accountId: account.id,
        type: "google",
        scopeConfigJson: { folderId: "dummy" },
        syncMode: "full",
    });

    const ctx = {
        userId: user.id,
        accountId: account.id,
        scope: { ...scope, accountId: account.id },
        accessToken: "dummy"
    };

    // 1. Google Sync
    console.log("\nTesting Google Sync...");
    const googleRes = await runSync(googleSyncEngine, ctx);
    console.log("Google Result:", googleRes);
    await verifyPersistence("drive", user.id);

    // 2. Jira Sync
    console.log("\nTesting Jira Sync...");
    // Need mocked scope config for Jira
    ctx.scope.type = "atlassian";
    ctx.scope.scopeConfigJson = { cloudId: "dummy", projectKeys: ["PROJ"] };
    const jiraRes = await runSync(jiraSyncEngine, ctx);
    console.log("Jira Result:", jiraRes);
    await verifyPersistence("jira", user.id);

    // 3. Confluence Sync
    console.log("\nTesting Confluence Sync...");
    ctx.scope.scopeConfigJson = { cloudId: "dummy", spaceKeys: ["ENG"] };
    const confRes = await runSync(confluenceSyncEngine, ctx);
    console.log("Confluence Result:", confRes);
    await verifyPersistence("confluence", user.id);

    // 4. Slack Sync
    console.log("\nTesting Slack Sync...");
    ctx.scope.type = "slack";
    ctx.scope.scopeConfigJson = { channelIds: ["C123"] };
    const slackRes = await runSync(slackSyncEngine, ctx);
    console.log("Slack Result:", slackRes);
    await verifyPersistence("slack", user.id);

    console.log("\nVerification Complete!");
    process.exit(0);
}

async function verifyPersistence(type: string, userId: string) {
    const sources = await storage.getSourcesByUserAndType(userId, type);
    console.log(`[${type}] Sources: ${sources.length}`);

    if (sources.length === 0) {
        console.error(`[${type}] FAILED: No sources found`);
        return;
    }

    let totalVersions = 0;
    let totalChunks = 0;

    for (const source of sources) {
        const versions = await storage.getSourceVersions(source.id);
        totalVersions += versions.length;

        // Check if chunks are linked to source (new orchestrator logic)
        const chunks = await storage.getChunksBySourceId(source.id);
        totalChunks += chunks.length;

        const activeVersion = await storage.getActiveSourceVersion(source.id);
        if (!activeVersion) {
            console.error(`[${type}] Source ${source.id} has no active version!`);
        }
    }

    console.log(`[${type}] Source Versions: ${totalVersions}`);
    console.log(`[${type}] Chunks: ${totalChunks}`);

    if (totalVersions === 0) console.error(`[${type}] FAILED: No source versions found`);
    if (totalChunks === 0) console.error(`[${type}] FAILED: No chunks found`);
}

main().catch(console.error);
