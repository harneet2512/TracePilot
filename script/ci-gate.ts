import { db } from "../server/db";
import { evalRuns, evalSuites } from "../shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { writeFileSync } from "fs";
import { join } from "path";

interface EvalMetrics {
  taskSuccessRate?: number;
  passRate?: number;
  unsupportedClaimRate?: number;
  avgCostPerSuccess?: number;
  recallAtK?: number;
  citationIntegrity?: number;
  toolSelectionAccuracy?: number;
  parameterCorrectness?: number;
  totalTokens?: number;
  totalLatencyMs?: number;
}

interface DiffReport {
  baseline: {
    runId: string;
    suiteName: string;
    metrics: EvalMetrics;
  };
  current: {
    runId: string;
    suiteName: string;
    metrics: EvalMetrics;
  };
  diffs: Array<{
    metric: string;
    baseline: number | undefined;
    current: number | undefined;
    delta: number;
    deltaPercent: number;
    status: "pass" | "fail" | "warning";
    threshold?: number;
  }>;
  regressions: string[];
  passed: boolean;
  timestamp: string;
}

async function runCIGate() {
  console.log("Running CI regression gate...\n");

  // Find baseline suite
  const [baselineSuite] = await db
    .select()
    .from(evalSuites)
    .where(eq(evalSuites.isBaseline, true))
    .limit(1);

  if (!baselineSuite) {
    console.error("No baseline suite found. Mark a suite as baseline first.");
    process.exit(1);
  }

  console.log(`Baseline suite: ${baselineSuite.name}`);

  // Get baseline run (most recent completed run for baseline suite, matching channel if specified)
  const channel = process.argv[2] as "http" | "voice" | "mcp" | undefined;
  
  // Build baseline query with optional channel filter
  const baselineRuns = await (channel 
    ? db.select().from(evalRuns).where(and(
        eq(evalRuns.suiteId, baselineSuite.id),
        eq(evalRuns.channel, channel)
      )).orderBy(desc(evalRuns.createdAt)).limit(1)
    : db.select().from(evalRuns).where(eq(evalRuns.suiteId, baselineSuite.id))
        .orderBy(desc(evalRuns.createdAt)).limit(1));

  if (baselineRuns.length === 0) {
    console.error("No baseline run found. Run the baseline suite first.");
    process.exit(1);
  }

  const baselineRun = baselineRuns[0];
  const baselineMetrics = (baselineRun.metricsJson || {}) as EvalMetrics;

  console.log(`Baseline run: ${baselineRun.id} (${baselineRun.createdAt?.toISOString()})`);
  if (channel) {
    console.log(`Filtering by channel: ${channel}`);
  }

  // Get current run (most recent completed run, matching channel if specified)
  let currentRunsQuery = db.select().from(evalRuns);
  if (channel) {
    currentRunsQuery = currentRunsQuery.where(eq(evalRuns.channel, channel));
  }
  const currentRuns = await currentRunsQuery
    .orderBy(desc(evalRuns.createdAt))
    .limit(1);

  if (currentRuns.length === 0) {
    console.error("No current run found.");
    process.exit(1);
  }

  const currentRun = currentRuns[0];
  const currentMetrics = (currentRun.metricsJson || {}) as EvalMetrics;

  // Warn if channels don't match (cross-channel comparison)
  if (baselineRun.channel !== currentRun.channel) {
    console.warn(`WARNING: Cross-channel comparison detected. Baseline: ${baselineRun.channel}, Current: ${currentRun.channel}`);
  }

  // Get current suite name
  const currentSuite = await db
    .select()
    .from(evalSuites)
    .where(eq(evalSuites.id, currentRun.suiteId))
    .limit(1);

  const currentSuiteName = currentSuite[0]?.name || "Unknown";

  console.log(`Current run: ${currentRun.id} (${currentRun.createdAt?.toISOString()})`);
  console.log(`Current suite: ${currentSuiteName}\n`);

  // Calculate diffs
  const diffs: DiffReport["diffs"] = [];
  const regressions: string[] = [];

  // TSR (Task Success Rate)
  const baselineTSR = baselineMetrics.taskSuccessRate ?? baselineMetrics.passRate ?? 100;
  const currentTSR = currentMetrics.taskSuccessRate ?? currentMetrics.passRate ?? 100;
  const tsrDelta = baselineTSR - currentTSR;
  const tsrDeltaPercent = baselineTSR > 0 ? (tsrDelta / baselineTSR) * 100 : 0;
  const tsrStatus = tsrDelta > 3 ? "fail" : tsrDelta > 1 ? "warning" : "pass";
  diffs.push({
    metric: "Task Success Rate (TSR)",
    baseline: baselineTSR,
    current: currentTSR,
    delta: tsrDelta,
    deltaPercent: tsrDeltaPercent,
    status: tsrStatus,
    threshold: 3,
  });
  if (tsrDelta > 3) {
    regressions.push(
      `TSR dropped ${tsrDelta.toFixed(1)}% (baseline: ${baselineTSR.toFixed(1)}%, current: ${currentTSR.toFixed(1)}%)`
    );
  }

  // Unsupported claim rate
  const baselineUnsupported = baselineMetrics.unsupportedClaimRate ?? 0;
  const currentUnsupported = currentMetrics.unsupportedClaimRate ?? 0;
  const unsupportedDelta = currentUnsupported - baselineUnsupported;
  const unsupportedDeltaPercent = baselineUnsupported > 0 ? (unsupportedDelta / baselineUnsupported) * 100 : (unsupportedDelta > 0 ? Infinity : 0);
  const unsupportedStatus = unsupportedDelta > 2 ? "fail" : unsupportedDelta > 1 ? "warning" : "pass";
  diffs.push({
    metric: "Unsupported Claim Rate",
    baseline: baselineUnsupported,
    current: currentUnsupported,
    delta: unsupportedDelta,
    deltaPercent: unsupportedDeltaPercent,
    status: unsupportedStatus,
    threshold: 2,
  });
  if (unsupportedDelta > 2) {
    regressions.push(
      `Unsupported claim rate rose ${unsupportedDelta.toFixed(1)}% (baseline: ${baselineUnsupported.toFixed(1)}%, current: ${currentUnsupported.toFixed(1)}%)`
    );
  }

  // Cost per success
  const baselineCost = baselineMetrics.avgCostPerSuccess ?? 0;
  const currentCost = currentMetrics.avgCostPerSuccess ?? 0;
  if (baselineCost > 0 && currentCost > 0) {
    const costDelta = currentCost - baselineCost;
    const costDeltaPercent = (costDelta / baselineCost) * 100;
    const tsrImprovement = currentTSR - baselineTSR;
    const costStatus = costDeltaPercent > 10 && tsrImprovement <= 0 ? "fail" : costDeltaPercent > 5 ? "warning" : "pass";
    diffs.push({
      metric: "Cost per Success",
      baseline: baselineCost,
      current: currentCost,
      delta: costDelta,
      deltaPercent: costDeltaPercent,
      status: costStatus,
      threshold: 10,
    });
    if (costDeltaPercent > 10 && tsrImprovement <= 0) {
      regressions.push(
        `Cost per success rose ${costDeltaPercent.toFixed(1)}% without TSR improvement (baseline: ${baselineCost.toFixed(2)}, current: ${currentCost.toFixed(2)})`
      );
    }
  }

  // Additional metrics (informational)
  if (baselineMetrics.recallAtK !== undefined && currentMetrics.recallAtK !== undefined) {
    const recallDelta = currentMetrics.recallAtK - baselineMetrics.recallAtK;
    diffs.push({
      metric: "Recall@K",
      baseline: baselineMetrics.recallAtK,
      current: currentMetrics.recallAtK,
      delta: recallDelta,
      deltaPercent: baselineMetrics.recallAtK > 0 ? (recallDelta / baselineMetrics.recallAtK) * 100 : 0,
      status: recallDelta < -5 ? "warning" : "pass",
    });
  }

  if (baselineMetrics.citationIntegrity !== undefined && currentMetrics.citationIntegrity !== undefined) {
    const integrityDelta = currentMetrics.citationIntegrity - baselineMetrics.citationIntegrity;
    diffs.push({
      metric: "Citation Integrity",
      baseline: baselineMetrics.citationIntegrity,
      current: currentMetrics.citationIntegrity,
      delta: integrityDelta,
      deltaPercent: baselineMetrics.citationIntegrity > 0 ? (integrityDelta / baselineMetrics.citationIntegrity) * 100 : 0,
      status: integrityDelta < -2 ? "warning" : "pass",
    });
  }

  // Print diff table
  console.log("=".repeat(80));
  console.log("METRIC DIFFERENCES");
  console.log("=".repeat(80));
  console.log(
    `${"Metric".padEnd(30)} ${"Baseline".padEnd(12)} ${"Current".padEnd(12)} ${"Delta".padEnd(12)} ${"Status".padEnd(10)}`
  );
  console.log("-".repeat(80));

  for (const diff of diffs) {
    const baselineStr = diff.baseline !== undefined ? diff.baseline.toFixed(2) : "N/A";
    const currentStr = diff.current !== undefined ? diff.current.toFixed(2) : "N/A";
    const deltaStr = diff.delta !== undefined ? (diff.delta >= 0 ? "+" : "") + diff.delta.toFixed(2) : "N/A";
    const statusIcon = diff.status === "fail" ? "❌" : diff.status === "warning" ? "⚠️ " : "✅";
    console.log(
      `${diff.metric.padEnd(30)} ${baselineStr.padEnd(12)} ${currentStr.padEnd(12)} ${deltaStr.padEnd(12)} ${statusIcon}`
    );
  }

  console.log("=".repeat(80));
  console.log();

  // Create report
  const report: DiffReport = {
    baseline: {
      runId: baselineRun.id,
      suiteName: baselineSuite.name,
      metrics: baselineMetrics,
    },
    current: {
      runId: currentRun.id,
      suiteName: currentSuiteName,
      metrics: currentMetrics,
    },
    diffs,
    regressions,
    passed: regressions.length === 0,
    timestamp: new Date().toISOString(),
  };

  // Save report artifacts
  const reportDir = join(process.cwd(), "eval-reports");
  try {
    const fs = await import("fs");
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    // Save JSON report
    const jsonPath = join(reportDir, `ci-gate-${Date.now()}.json`);
    writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`📄 JSON report saved: ${jsonPath}`);

    // Save Markdown report
    const mdPath = join(reportDir, `ci-gate-${Date.now()}.md`);
    const mdReport = generateMarkdownReport(report);
    writeFileSync(mdPath, mdReport);
    console.log(`📄 Markdown report saved: ${mdPath}`);
  } catch (error) {
    console.warn("Warning: Could not save report artifacts:", error);
  }

  // Final verdict
  if (regressions.length > 0) {
    console.error("\n❌ REGRESSION DETECTED:");
    regressions.forEach((r) => console.error(`  - ${r}`));
    console.error("\nCI gate FAILED. Please investigate regressions before merging.");
    process.exit(1);
  } else {
    console.log("\n✅ No regressions detected. CI gate passed.");
    process.exit(0);
  }
}

function generateMarkdownReport(report: DiffReport): string {
  let md = `# CI Gate Report\n\n`;
  md += `**Timestamp:** ${report.timestamp}\n`;
  md += `**Status:** ${report.passed ? "✅ PASSED" : "❌ FAILED"}\n\n`;

  md += `## Baseline\n\n`;
  md += `- **Run ID:** ${report.baseline.runId}\n`;
  md += `- **Suite:** ${report.baseline.suiteName}\n\n`;

  md += `## Current\n\n`;
  md += `- **Run ID:** ${report.current.runId}\n`;
  md += `- **Suite:** ${report.current.suiteName}\n\n`;

  md += `## Metric Differences\n\n`;
  md += `| Metric | Baseline | Current | Delta | Delta % | Status |\n`;
  md += `|--------|----------|---------|-------|---------|--------|\n`;

  for (const diff of report.diffs) {
    const baselineStr = diff.baseline !== undefined ? diff.baseline.toFixed(2) : "N/A";
    const currentStr = diff.current !== undefined ? diff.current.toFixed(2) : "N/A";
    const deltaStr = diff.delta !== undefined ? (diff.delta >= 0 ? "+" : "") + diff.delta.toFixed(2) : "N/A";
    const deltaPercentStr = diff.deltaPercent !== undefined ? (diff.deltaPercent >= 0 ? "+" : "") + diff.deltaPercent.toFixed(1) + "%" : "N/A";
    const statusIcon = diff.status === "fail" ? "❌" : diff.status === "warning" ? "⚠️" : "✅";
    md += `| ${diff.metric} | ${baselineStr} | ${currentStr} | ${deltaStr} | ${deltaPercentStr} | ${statusIcon} |\n`;
  }

  if (report.regressions.length > 0) {
    md += `\n## Regressions\n\n`;
    report.regressions.forEach((r) => {
      md += `- ❌ ${r}\n`;
    });
  }

  return md;
}

runCIGate().catch((error) => {
  console.error("Error running CI gate:", error);
  process.exit(1);
});
