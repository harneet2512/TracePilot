import { describe, it } from "node:test";
import assert from "node:assert";
import { classifyRegression, computeMetricDeltas, parseThresholds, resolveBaselineRun } from "../lib/eval/regressionEngine";

describe("eval regression engine", () => {
  it("computes metric deltas and flags regressions", () => {
    const deltas = computeMetricDeltas(
      {
        passRate: 95,
        groundedClaimRate: 92,
        unsupportedClaimRate: 0.008,
        citationIntegrity: 96,
        p95LatencyMs: 1200,
        p95Tokens: 2000,
        totalCostUsd: 0.9,
      },
      {
        passRate: 92,
        groundedClaimRate: 89,
        unsupportedClaimRate: 0.018,
        citationIntegrity: 94,
        p95LatencyMs: 1600,
        p95Tokens: 2600,
        totalCostUsd: 1.4,
      },
      {
        unsupportedClaimIncreaseAbs: 0.005,
        passRateDropAbs: 0.01,
      },
    );

    const passRate = deltas.find((d) => d.key === "passRate");
    const unsupported = deltas.find((d) => d.key === "unsupportedClaimRate");
    assert.ok(passRate);
    assert.ok(unsupported);
    assert.strictEqual(passRate!.isRegression, true);
    assert.strictEqual(unsupported!.isRegression, true);
  });

  it("classifies gate as FAIL when p0 exists", () => {
    const gate = classifyRegression([
      {
        key: "unsupportedClaimRate",
        label: "Unsupported Claim Rate",
        baseline: 0.01,
        current: 0.04,
        delta: 0.03,
        deltaPercent: 300,
        isRegression: true,
        severity: "P0",
      },
    ]);
    assert.strictEqual(gate.status, "FAIL");
    assert.strictEqual(gate.p0Count, 1);
  });

  it("resolves baseline by mode", () => {
    const runs = [
      { id: "run-3", suiteId: "suite-1", status: "completed", channel: "http", createdAt: new Date("2026-01-03"), metricsJson: { passRate: 80 } },
      { id: "run-2", suiteId: "suite-1", status: "completed", channel: "http", createdAt: new Date("2026-01-02"), metricsJson: { passRate: 92 } },
      { id: "run-1", suiteId: "suite-1", status: "completed", channel: "http", createdAt: new Date("2026-01-01"), metricsJson: { passRate: 90 } },
    ];
    const current = runs[0];
    const suite = { id: "suite-1", baselineRunId: "run-1" };

    const previous = resolveBaselineRun({ allRuns: runs as any, currentRun: current as any, suite, baselineMode: "previous" });
    const pinned = resolveBaselineRun({ allRuns: runs as any, currentRun: current as any, suite, baselineMode: "pinned" });
    const window = resolveBaselineRun({ allRuns: runs as any, currentRun: current as any, suite, baselineMode: "window", windowDays: 10 });

    assert.strictEqual(previous?.id, "run-2");
    assert.strictEqual(pinned?.id, "run-1");
    assert.strictEqual(window?.id, "run-2");
  });

  it("keeps default thresholds when payload missing", () => {
    const thresholds = parseThresholds(undefined);
    assert.ok(thresholds.passRateDropAbs > 0);
    assert.ok(thresholds.unsupportedClaimIncreaseAbs > 0);
  });
});
