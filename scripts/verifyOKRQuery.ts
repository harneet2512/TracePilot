/**
 * OKR Query Verification Script
 * Hard assertion E2E test with exact expected OKR facts
 */

import "dotenv/config";
import { runAgentTurn } from "../server/lib/agent/agentCore.js";
import { strict as assert } from "assert";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function verifyOKRQuery() {
    console.log("=== OKR Query Verification ===\n");

    // Try to load manifest, but fallback to defaults if not available
    let userId = "demo-eval-user";
    let workspaceId = "demo-eval-workspace";
    let scopeId: string | undefined = "demo-golden-scope";

    try {
        const manifestPath = join(__dirname, "..", "fixtures", "demo_manifest.json");
        const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
        userId = manifest.userId;
        workspaceId = manifest.workspaceId;
        scopeId = manifest.scopeId;
        console.log(`Using manifest: workspace=${workspaceId}, user=${userId}, scope=${scopeId}\n`);
    } catch (e: any) {
        console.log(`No manifest found, using defaults: workspace=${workspaceId}, user=${userId}, scope=${scopeId}\n`);
        console.log("(Run 'npm run demo:seed' to create proper fixtures)\n");
    }

    // Run the OKR query
    console.log('Query: "What are our Q4 OKRs for the AI search project?"');

    const result = await runAgentTurn({
        message: "What are our Q4 OKRs for the AI search project?",
        userId,
        userRole: "admin",
        channel: "http",
        workspaceId,
        scopeId,
        topK: 12
    });

    const fullText = result.answerText + JSON.stringify(result.bullets);

    console.log(`\nAnswer preview: ${result.answerText.substring(0, 150)}...`);
    console.log(`Citations: ${result.citations.length}`);
    console.log(`Bullets: ${result.bullets.length}`);
    console.log(`Sources: ${result.sources.map(s => s.title).join(", ")}\n`);

    // HARD ASSERTIONS
    console.log("Running hard assertions...\n");

    try {
        // Assert 1: Must cite Q4_2024_OKRs document
        console.log("[1/6] Checking source citation...");
        const hasOKRSource = result.citations.some((c: any) =>
            /q4.*okr|okr.*q4/i.test(c.title || "") ||
            result.sources.some((s: any) => /q4.*okr|okr.*q4/i.test(s.title || ""))
        );
        assert(hasOKRSource, "FAIL: Did not cite Q4_2024_OKRs document");
        console.log("   ✅ PASS: Cites Q4_2024_OKRs document");

        // Assert 2: Launch date (November 15 or Nov 15)
        console.log("[2/6] Checking launch date...");
        assert(
            /nov\s*15|november\s*15/i.test(fullText),
            "FAIL: Missing November 15 launch date"
        );
        console.log("   ✅ PASS: Includes November 15 launch date");

        // Assert 3: Latency target (2s AND p95)
        console.log("[3/6] Checking latency target...");
        assert(
            /2s/i.test(fullText) && /p95/i.test(fullText),
            "FAIL: Missing 2s p95 latency target"
        );
        console.log("   ✅ PASS: Includes 2s p95 latency target");

        // Assert 4: Indexing target (500K or 500,000)
        console.log("[4/6] Checking indexing target...");
        assert(
            /500k|500,000/i.test(fullText),
            "FAIL: Missing 500K indexing target"
        );
        console.log("   ✅ PASS: Includes 500K indexing target");

        // Assert 5: Budget ($180,000 or 180,000)
        console.log("[5/6] Checking budget...");
        assert(
            /180,?000|\$180k/i.test(fullText),
            "FAIL: Missing $180,000 budget"
        );
        console.log("   ✅ PASS: Includes $180,000 budget");

        // Assert 6: Forbidden strings
        console.log("[6/6] Checking for forbidden strings...");
        assert(
            !/no okrs found/i.test(fullText),
            "FAIL: Returned 'No OKRs found' (incorrect fallback)"
        );
        assert(
            !/not found in provided sources|unable to find/i.test(fullText),
            "FAIL: Returned 'not found' message (incorrect fallback)"
        );
        console.log("   ✅ PASS: No forbidden strings");

        console.log("\n" + "=".repeat(80));
        console.log("✅ SUCCESS: All OKR extraction assertions passed");
        console.log("=".repeat(80));
        process.exit(0);

    } catch (error: any) {
        console.log("\n" + "=".repeat(80));
        console.error("❌ FAILURE:", error.message);
        console.log("=".repeat(80));
        console.log("\nDebug Info:");
        console.log("  Answer Text:", result.answerText);
        console.log("  Bullets:", JSON.stringify(result.bullets, null, 2));
        console.log("  Sources:", result.sources.map((s: any) => s.title));
        process.exit(1);
    }
}

verifyOKRQuery().catch(err => {
    console.error("\n❌ FATAL ERROR:", err.message);
    console.error(err.stack);
    process.exit(1);
});
