
import { db } from "../server/db";
import { userConnectorAccounts, userConnectorScopes, sources } from "@shared/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

async function repair() {
    console.log("=== REPAIRING CONNECTOR TYPES ===");

    // 1. Repair Accounts
    const accounts = await db.select().from(userConnectorAccounts);
    let repairedAccounts = 0;
    for (const acc of accounts) {
        if (acc.type === 'drive' || acc.type === 'google-drive') {
            await db.update(userConnectorAccounts)
                .set({ type: 'google' })
                .where(eq(userConnectorAccounts.id, acc.id));
            repairedAccounts++;
        }
    }
    console.log(`Repaired Accounts: ${repairedAccounts}`);

    // 2. Repair Scopes
    const scopes = await db.select().from(userConnectorScopes);
    let repairedScopes = 0;
    for (const scope of scopes) {
        if (scope.type === 'drive' || scope.type === 'google-drive') {
            await db.update(userConnectorScopes)
                .set({ type: 'google' })
                .where(eq(userConnectorScopes.id, scope.id));
            repairedScopes++;
        }
    }
    console.log(`Repaired Scopes: ${repairedScopes}`);

    // 3. Repair Sources
    // Note: sources 'type' column is text, verify where usage
    const allSources = await db.select().from(sources);
    let repairedSources = 0;
    for (const src of allSources) {
        if (src.type === 'drive' || src.type === 'google-drive') {
            await db.update(sources)
                .set({ type: 'google' })
                .where(eq(sources.id, src.id));
            repairedSources++;
        }
    }
    console.log(`Repaired Sources: ${repairedSources}`);

    console.log("DONE");
    process.exit(0);
}

repair().catch(console.error);
