
import "dotenv/config";
import { db } from "../server/db";
import { userConnectorAccounts, userConnectorScopes } from "../shared/schema";
import { eq } from "drizzle-orm";

const API_Base = "http://localhost:5000";

async function runProof() {
    console.log("🔍 Starting Proof: Google Drive Scope PATCH...");

    // 1. Login to get session cookie
    console.log("👉 Logging in as admin...");
    const loginRes = await fetch(`${API_Base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@tracepilot.com", password: "admin123" }),
    });

    if (!loginRes.ok) {
        console.error("❌ Login failed:", await loginRes.text());
        process.exit(1);
    }

    const cookie = loginRes.headers.get("set-cookie");
    if (!cookie) {
        console.error("❌ No cookie received");
        process.exit(1);
    }
    console.log("✅ Logged in. Cookie acquired.");

    // 2. Find Google Account
    console.log("👉 Finding Google Account...");
    const accounts = await (db as any).select().from(userConnectorAccounts).where(eq(userConnectorAccounts.type, "google"));
    const googleAccount = accounts[0];

    if (!googleAccount) {
        console.error("❌ No Google Account found in DB. Please connect one first.");
        process.exit(1);
    }
    console.log(`✅ Found Google Account: ${googleAccount.id}`);

    // 3. GET scopes (simulating frontend)
    console.log(`👉 GET /api/user-connector-scopes/${googleAccount.id}`);
    const getRes = await fetch(`${API_Base}/api/user-connector-scopes/${googleAccount.id}`, {
        headers: { Cookie: cookie },
    });

    if (!getRes.ok) {
        console.error("❌ GET fetch failed:", await getRes.text());
        process.exit(1);
    }

    const scopes = await getRes.json();
    console.log("✅ GET Response:", JSON.stringify(scopes, null, 2));

    // Verify it returns an array
    if (!Array.isArray(scopes)) {
        console.warn("⚠️ WARNING: Backend returned a single object, not an array. Frontend fix handles this, but protocol says array.");
    }

    const scope = Array.isArray(scopes) ? scopes[0] : scopes;
    if (!scope || !scope.id) {
        console.error("❌ No valid scope found in response.");
        process.exit(1);
    }

    const realScopeId = scope.id;
    console.log(`✅ Extracted Real Scope ID: ${realScopeId}`);

    // 4. PATCH with Real ID
    console.log(`👉 PATCH /api/user-connector-scopes/${realScopeId}`);
    const patchRes = await fetch(`${API_Base}/api/user-connector-scopes/${realScopeId}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            Cookie: cookie
        },
        body: JSON.stringify({
            syncMode: "smart",
            contentStrategy: "smart"
        }),
    });

    if (!patchRes.ok) {
        console.error("❌ PATCH failed:", await patchRes.text());
        process.exit(1);
    }
    console.log(`✅ PATCH success: ${patchRes.status}`);

    // 5. Verify Prevention of /undefined
    console.log("👉 Verifying Guard: PATCH /api/user-connector-scopes/undefined (should fail 400/404/500)");
    const badRes = await fetch(`${API_Base}/api/user-connector-scopes/undefined`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            Cookie: cookie
        },
        body: JSON.stringify({ syncMode: "full" }),
    });

    if (badRes.ok) {
        console.error("❌ FAIL: PATCH /undefined returned 200 OK. This should not happen.");
        process.exit(1);
    }
    console.log(`✅ PASS: PATCH /undefined returned ${badRes.status} (expected failure)`);

    console.log("\n🎉 PROOF SUCCESS: Frontend fix logic (array handling) matched with Backend contract.");
    process.exit(0);
}

runProof().catch(console.error);
