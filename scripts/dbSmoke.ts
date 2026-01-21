// Database smoke test - verifies tables exist and queries work
import { db } from "../server/db";
import { sql } from "drizzle-orm";
import {
    evalCases,
    evalRuns,
    evalResults,
    traces,
    spans,
    auditEvents,
    approvals,
} from "../shared/schema";

async function runSmokeTests() {
    console.log("Running database smoke tests...\n");

    let passed = 0;
    let failed = 0;

    // Helper function to check a table
    async function checkTable(name: string, queryFn: () => Promise<any[]>) {
        try {
            const result = await queryFn();
            console.log(`✓ ${name}:`);

            // Drizzle returning { count: X } array
            if (result && result.length > 0) {
                // @ts-ignore
                console.log(`  Count: ${result[0].count}`);
            } else {
                console.log(`  Count: 0`);
            }

            passed++;
        } catch (error) {
            console.error(`✗ ${name}: ${error instanceof Error ? error.message : String(error)}`);
            failed++;
        }
        console.log();
    }

    try {
        await checkTable("eval_cases", () => db.select({ count: sql<number>`count(*)` }).from(evalCases));
        await checkTable("eval_runs", () => db.select({ count: sql<number>`count(*)` }).from(evalRuns));
        await checkTable("eval_results", () => db.select({ count: sql<number>`count(*)` }).from(evalResults));
        await checkTable("traces", () => db.select({ count: sql<number>`count(*)` }).from(traces));
        await checkTable("spans", () => db.select({ count: sql<number>`count(*)` }).from(spans));
        await checkTable("audit_events", () => db.select({ count: sql<number>`count(*)` }).from(auditEvents));
        await checkTable("approvals", () => db.select({ count: sql<number>`count(*)` }).from(approvals));

    } catch (err) {
        console.error("Fatal error during smoke tests:", err);
        failed++;
    }

    console.log("=".repeat(60));
    console.log(`SMOKE TEST RESULTS: ${passed} passed, ${failed} failed`);
    console.log("=".repeat(60));

    if (failed > 0) {
        console.error("\n❌ Some smoke tests failed");
        process.exit(1);
    } else {
        console.log("\n✅ All smoke tests passed");
        process.exit(0);
    }
}

runSmokeTests().catch((error) => {
    console.error("Smoke test failed with error:", error);
    process.exit(1);
});
