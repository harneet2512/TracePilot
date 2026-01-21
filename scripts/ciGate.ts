import "dotenv/config";
// CI gate script - fails if regression thresholds violated
import { storage } from "../server/storage";
import { runEvalSuite, compareWithBaseline } from "./evalRunner";

const THRESHOLDS = {
    successRateDrop: 3, // Fail if success rate drops > 3%
    citationIntegrityDrop: 2, // Fail if citation integrity drops > 2%
    costIncreaseWithoutImprovement: 10, // Fail if cost increases > 10% without success improving
};

async function runCI() {
    console.log("=== RUNNING CI EVAL GATE ===\n");

    // Get the latest suite
    const suites = await storage.getEvalSuites();
    if (suites.length === 0) {
        console.error("❌ No eval suites found. Run 'npm run seed:e2e' first.");
        process.exit(1);
    }

    const suite = suites[0];
    console.log(`Using suite: ${suite.name}`);

    // Get baseline run (marked as baseline or most recent)
    const runs = await storage.getEvalRunsBySuiteId(suite.id);
    const baselineRun = runs.find(r => (r.metricsJson as any)?.isBaseline) || runs[runs.length - 1];

    if (!baselineRun) {
        console.log("⚠️  No baseline run found. This run will become the baseline.");

        // Run eval
        const { runId, metrics } = await runEvalSuite(suite.id, "default-workspace", "eval-user");

        // Mark as baseline
        await storage.updateEvalRun(runId, {
            metricsJson: { ...metrics, isBaseline: true },
        });

        console.log("\n✓ Baseline established");
        console.log(`  Recall@5: ${metrics.recallAtK.toFixed(2)}%`);
        console.log(`  Citation Integrity: ${metrics.citationIntegrity.toFixed(2)}%`);
        console.log(`  Success Rate: ${metrics.successRate.toFixed(2)}%`);
        console.log(`  Cost per Success: $${metrics.costPerSuccess.toFixed(6)}`);

        process.exit(0);
    }

    console.log(`Baseline run: ${baselineRun.id}`);
    const baselineMetrics = baselineRun.metricsJson as any;
    console.log(`  Baseline Success Rate: ${baselineMetrics.successRate.toFixed(2)}%`);
    console.log(`  Baseline Citation Integrity: ${baselineMetrics.citationIntegrity.toFixed(2)}%`);
    console.log(`  Baseline Cost per Success: $${baselineMetrics.costPerSuccess.toFixed(6)}\n`);

    // Run current eval
    const { runId, metrics } = await runEvalSuite(suite.id, "default-workspace", "eval-user");

    console.log("\n=== CURRENT RUN ===");
    console.log(`  Success Rate: ${metrics.successRate.toFixed(2)}%`);
    console.log(`  Citation Integrity: ${metrics.citationIntegrity.toFixed(2)}%`);
    console.log(`  Cost per Success: $${metrics.costPerSuccess.toFixed(6)}\n`);

    // Compare with baseline
    const diff = await compareWithBaseline(runId, baselineRun.id);

    console.log("=== DIFF FROM BASELINE ===");
    console.log(`  Recall@5: ${diff.recallDiff > 0 ? '+' : ''}${diff.recallDiff.toFixed(2)}%`);
    console.log(`  Citation Integrity: ${diff.citationIntegrityDiff > 0 ? '+' : ''}${diff.citationIntegrityDiff.toFixed(2)}%`);
    console.log(`  Success Rate: ${diff.successRateDiff > 0 ? '+' : ''}${diff.successRateDiff.toFixed(2)}%`);
    console.log(`  Cost per Success: ${diff.costPerSuccessDiff > 0 ? '+' : ''}${diff.costPerSuccessDiff.toFixed(2)}%\n`);

    // Check thresholds
    let failed = false;
    const failures: string[] = [];

    if (diff.successRateDiff < -THRESHOLDS.successRateDrop) {
        failures.push(`❌ Success rate dropped by ${Math.abs(diff.successRateDiff).toFixed(2)}% (threshold: ${THRESHOLDS.successRateDrop}%)`);
        failed = true;
    }

    if (diff.citationIntegrityDiff < -THRESHOLDS.citationIntegrityDrop) {
        failures.push(`❌ Citation integrity dropped by ${Math.abs(diff.citationIntegrityDiff).toFixed(2)}% (threshold: ${THRESHOLDS.citationIntegrityDrop}%)`);
        failed = true;
    }

    if (diff.costPerSuccessDiff > THRESHOLDS.costIncreaseWithoutImprovement && diff.successRateDiff <= 0) {
        failures.push(`❌ Cost increased by ${diff.costPerSuccessDiff.toFixed(2)}% without success improvement (threshold: ${THRESHOLDS.costIncreaseWithoutImprovement}%)`);
        failed = true;
    }

    if (failed) {
        console.log("=== CI GATE: FAILED ===\n");
        failures.forEach(f => console.log(f));
        console.log("\nRegression detected. Fix the issues before merging.\n");
        process.exit(1);
    } else {
        console.log("=== CI GATE: PASSED ===\n");
        console.log("✓ All thresholds met");
        console.log("✓ No regressions detected\n");
        process.exit(0);
    }
}

// Run if called directly
if (require.main === module) {
    runCI().catch((error) => {
        console.error("CI gate failed with error:", error);
        process.exit(1);
    });
}

export { runCI, THRESHOLDS };
