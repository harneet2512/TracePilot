export type BaselineMode = "previous" | "pinned" | "window";
export type RegressionSeverity = "P0" | "P1" | "P2" | "none";
export type RegressionGate = "PASS" | "WARN" | "FAIL";

export interface EvalThresholds {
  passRateDropAbs: number;
  unsupportedClaimIncreaseAbs: number;
  unsupportedClaimMaxAbs: number;
  groundednessDropAbs: number;
  citationIntegrityDropAbs: number;
  p95LatencyIncreasePct: number;
  p95LatencyCapMs: number;
  tokensIncreasePct: number;
  tokensCapP95: number;
  costIncreasePct: number;
  costCapUsd: number;
  p0FailCaseIds: string[];
}

export interface MetricDelta {
  key: string;
  label: string;
  baseline: number;
  current: number;
  delta: number;
  deltaPercent: number;
  isRegression: boolean;
  severity: RegressionSeverity;
  reason?: string;
}

export interface GateClassification {
  status: RegressionGate;
  p0Count: number;
  p1Count: number;
  p2Count: number;
  regressedMetricCount: number;
}

type EvalRunLike = {
  id: string;
  suiteId: string;
  channel?: string | null;
  createdAt?: Date | null;
  startedAt?: Date | null;
  baselineRunId?: string | null;
  resultsJson?: unknown;
  metricsJson?: unknown;
  status?: string | null;
};

type EvalSuiteLike = {
  id: string;
  baselineRunId?: string | null;
  thresholdsJson?: unknown;
};

const DEFAULT_THRESHOLDS: EvalThresholds = {
  passRateDropAbs: 0.01,
  unsupportedClaimIncreaseAbs: 0.005,
  unsupportedClaimMaxAbs: 0.02,
  groundednessDropAbs: 0.01,
  citationIntegrityDropAbs: 0.01,
  p95LatencyIncreasePct: 0.1,
  p95LatencyCapMs: 8000,
  tokensIncreasePct: 0.15,
  tokensCapP95: 12000,
  costIncreasePct: 0.15,
  costCapUsd: 5,
  p0FailCaseIds: [],
};

function asNumber(input: unknown): number {
  return typeof input === "number" && Number.isFinite(input) ? input : 0;
}

function normalizeRate(input: unknown): number {
  const raw = asNumber(input);
  if (raw <= 1) return Math.max(0, raw);
  if (raw <= 100) return Math.max(0, raw / 100);
  return 0;
}

function pctDelta(baseline: number, delta: number): number {
  if (baseline === 0) return delta > 0 ? 100 : 0;
  return (delta / baseline) * 100;
}

export function parseThresholds(raw: unknown): EvalThresholds {
  if (!raw || typeof raw !== "object") return DEFAULT_THRESHOLDS;
  const obj = raw as Record<string, unknown>;
  return {
    passRateDropAbs: asNumber(obj.passRateDropAbs) || DEFAULT_THRESHOLDS.passRateDropAbs,
    unsupportedClaimIncreaseAbs: asNumber(obj.unsupportedClaimIncreaseAbs) || DEFAULT_THRESHOLDS.unsupportedClaimIncreaseAbs,
    unsupportedClaimMaxAbs: asNumber(obj.unsupportedClaimMaxAbs) || DEFAULT_THRESHOLDS.unsupportedClaimMaxAbs,
    groundednessDropAbs: asNumber(obj.groundednessDropAbs) || DEFAULT_THRESHOLDS.groundednessDropAbs,
    citationIntegrityDropAbs: asNumber(obj.citationIntegrityDropAbs) || DEFAULT_THRESHOLDS.citationIntegrityDropAbs,
    p95LatencyIncreasePct: asNumber(obj.p95LatencyIncreasePct) || DEFAULT_THRESHOLDS.p95LatencyIncreasePct,
    p95LatencyCapMs: asNumber(obj.p95LatencyCapMs) || DEFAULT_THRESHOLDS.p95LatencyCapMs,
    tokensIncreasePct: asNumber(obj.tokensIncreasePct) || DEFAULT_THRESHOLDS.tokensIncreasePct,
    tokensCapP95: asNumber(obj.tokensCapP95) || DEFAULT_THRESHOLDS.tokensCapP95,
    costIncreasePct: asNumber(obj.costIncreasePct) || DEFAULT_THRESHOLDS.costIncreasePct,
    costCapUsd: asNumber(obj.costCapUsd) || DEFAULT_THRESHOLDS.costCapUsd,
    p0FailCaseIds: Array.isArray(obj.p0FailCaseIds) ? obj.p0FailCaseIds.filter((v): v is string => typeof v === "string") : [],
  };
}

export function getComparableMetrics(raw: unknown) {
  const m = (raw ?? {}) as Record<string, unknown>;
  const total = asNumber(m.total);
  const passed = asNumber(m.passed);
  return {
    passRate: normalizeRate(m.taskSuccessRate ?? m.passRate ?? (total > 0 ? passed / total : 0)),
    groundedness: normalizeRate(m.groundedClaimRate ?? m.groundedness ?? m.groundedClaimRateAvg),
    unsupportedClaimRate: normalizeRate(m.unsupportedClaimRate ?? m.unsupportedClaimRateAvg),
    citationIntegrity: normalizeRate(m.citationIntegrityRate ?? m.citationIntegrity ?? m.citationPrecision),
    p95LatencyMs: asNumber(m.p95LatencyMs ?? m.p95Latency ?? m.latencyP95Ms),
    p95TtftMs: asNumber(m.p95TtftMs ?? m.ttftP95Ms),
    avgTokens: asNumber(m.avgTokens ?? m.averageTokens),
    p95Tokens: asNumber(m.p95Tokens ?? m.tokensP95),
    totalCostUsd: asNumber(m.totalCostUsd ?? m.avgCostPerSuccess ?? m.costUsd),
  };
}

export function computeMetricDeltas(
  baselineMetricsRaw: unknown,
  currentMetricsRaw: unknown,
  thresholdsRaw?: unknown,
  hasP0CaseFailures = false,
): MetricDelta[] {
  const thresholds = parseThresholds(thresholdsRaw);
  const baseline = getComparableMetrics(baselineMetricsRaw);
  const current = getComparableMetrics(currentMetricsRaw);
  const deltas: MetricDelta[] = [];

  const passRateDelta = current.passRate - baseline.passRate;
  const passRateDrop = baseline.passRate - current.passRate;
  const passRateRegression = passRateDrop >= thresholds.passRateDropAbs || hasP0CaseFailures;
  deltas.push({
    key: "passRate",
    label: "Pass Rate",
    baseline: baseline.passRate,
    current: current.passRate,
    delta: passRateDelta,
    deltaPercent: pctDelta(baseline.passRate, passRateDelta),
    isRegression: passRateRegression,
    severity: hasP0CaseFailures || passRateDrop >= thresholds.passRateDropAbs * 3 ? "P0" : (passRateRegression ? "P1" : "none"),
    reason: passRateRegression ? `pass rate ${(passRateDrop * 100).toFixed(2)}% below baseline` : undefined,
  });

  const groundednessDelta = current.groundedness - baseline.groundedness;
  const groundednessDrop = baseline.groundedness - current.groundedness;
  const groundednessRegression = groundednessDrop >= thresholds.groundednessDropAbs;
  deltas.push({
    key: "groundedness",
    label: "Grounded Claim Rate",
    baseline: baseline.groundedness,
    current: current.groundedness,
    delta: groundednessDelta,
    deltaPercent: pctDelta(baseline.groundedness, groundednessDelta),
    isRegression: groundednessRegression,
    severity: groundednessDrop >= thresholds.groundednessDropAbs * 2 ? "P1" : (groundednessRegression ? "P2" : "none"),
    reason: groundednessRegression ? `groundedness dropped ${(groundednessDrop * 100).toFixed(2)}%` : undefined,
  });

  const unsupportedDelta = current.unsupportedClaimRate - baseline.unsupportedClaimRate;
  const unsupportedRegression = unsupportedDelta >= thresholds.unsupportedClaimIncreaseAbs || current.unsupportedClaimRate > thresholds.unsupportedClaimMaxAbs;
  deltas.push({
    key: "unsupportedClaimRate",
    label: "Unsupported Claim Rate",
    baseline: baseline.unsupportedClaimRate,
    current: current.unsupportedClaimRate,
    delta: unsupportedDelta,
    deltaPercent: pctDelta(baseline.unsupportedClaimRate, unsupportedDelta),
    isRegression: unsupportedRegression,
    severity: current.unsupportedClaimRate > thresholds.unsupportedClaimMaxAbs ? "P0" : (unsupportedRegression ? "P1" : "none"),
    reason: unsupportedRegression ? `unsupported claims +${(Math.max(0, unsupportedDelta) * 100).toFixed(2)}%` : undefined,
  });

  const citationDelta = current.citationIntegrity - baseline.citationIntegrity;
  const citationDrop = baseline.citationIntegrity - current.citationIntegrity;
  const citationRegression = citationDrop >= thresholds.citationIntegrityDropAbs;
  deltas.push({
    key: "citationIntegrity",
    label: "Citation Integrity",
    baseline: baseline.citationIntegrity,
    current: current.citationIntegrity,
    delta: citationDelta,
    deltaPercent: pctDelta(baseline.citationIntegrity, citationDelta),
    isRegression: citationRegression,
    severity: citationDrop >= thresholds.citationIntegrityDropAbs * 2 ? "P1" : (citationRegression ? "P2" : "none"),
    reason: citationRegression ? `citation integrity dropped ${(citationDrop * 100).toFixed(2)}%` : undefined,
  });

  const latencyDelta = current.p95LatencyMs - baseline.p95LatencyMs;
  const latencyPct = pctDelta(baseline.p95LatencyMs, latencyDelta);
  const latencyRegression = latencyPct >= thresholds.p95LatencyIncreasePct * 100 || current.p95LatencyMs > thresholds.p95LatencyCapMs;
  deltas.push({
    key: "p95LatencyMs",
    label: "P95 Latency",
    baseline: baseline.p95LatencyMs,
    current: current.p95LatencyMs,
    delta: latencyDelta,
    deltaPercent: latencyPct,
    isRegression: latencyRegression,
    severity: current.p95LatencyMs > thresholds.p95LatencyCapMs ? "P1" : (latencyRegression ? "P2" : "none"),
    reason: latencyRegression ? `p95 latency +${Math.max(0, latencyPct).toFixed(1)}%` : undefined,
  });

  const tokenDelta = current.p95Tokens - baseline.p95Tokens;
  const tokenPct = pctDelta(baseline.p95Tokens, tokenDelta);
  const tokenRegression = tokenPct >= thresholds.tokensIncreasePct * 100 || current.p95Tokens > thresholds.tokensCapP95;
  deltas.push({
    key: "p95Tokens",
    label: "P95 Tokens",
    baseline: baseline.p95Tokens,
    current: current.p95Tokens,
    delta: tokenDelta,
    deltaPercent: tokenPct,
    isRegression: tokenRegression,
    severity: tokenRegression ? "P2" : "none",
    reason: tokenRegression ? `p95 tokens +${Math.max(0, tokenPct).toFixed(1)}%` : undefined,
  });

  const costDelta = current.totalCostUsd - baseline.totalCostUsd;
  const costPct = pctDelta(baseline.totalCostUsd, costDelta);
  const costRegression = costPct >= thresholds.costIncreasePct * 100 || current.totalCostUsd > thresholds.costCapUsd;
  deltas.push({
    key: "totalCostUsd",
    label: "Total Cost (USD)",
    baseline: baseline.totalCostUsd,
    current: current.totalCostUsd,
    delta: costDelta,
    deltaPercent: costPct,
    isRegression: costRegression,
    severity: current.totalCostUsd > thresholds.costCapUsd ? "P1" : (costRegression ? "P2" : "none"),
    reason: costRegression ? `cost +${Math.max(0, costPct).toFixed(1)}%` : undefined,
  });

  return deltas;
}

export function classifyRegression(deltas: MetricDelta[]): GateClassification {
  const failing = deltas.filter((d) => d.isRegression);
  const p0Count = failing.filter((d) => d.severity === "P0").length;
  const p1Count = failing.filter((d) => d.severity === "P1").length;
  const p2Count = failing.filter((d) => d.severity === "P2").length;
  const status: RegressionGate = p0Count > 0 ? "FAIL" : (p1Count > 0 ? "WARN" : "PASS");
  return { status, p0Count, p1Count, p2Count, regressedMetricCount: failing.length };
}

export function toLegacyDiffStatus(delta: MetricDelta): "pass" | "warning" | "fail" {
  if (!delta.isRegression) return "pass";
  return delta.severity === "P0" ? "fail" : "warning";
}

export function resolveBaselineRun(params: {
  allRuns: EvalRunLike[];
  currentRun: EvalRunLike;
  suite?: EvalSuiteLike | null;
  baselineMode?: BaselineMode;
  explicitBaselineRunId?: string;
  windowDays?: number;
}): EvalRunLike | undefined {
  const {
    allRuns,
    currentRun,
    suite,
    baselineMode = "previous",
    explicitBaselineRunId,
    windowDays = 7,
  } = params;

  const completedSuiteRuns = allRuns
    .filter((r) =>
      r.id !== currentRun.id &&
      r.suiteId === currentRun.suiteId &&
      r.status === "completed" &&
      r.channel === currentRun.channel)
    .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));

  if (explicitBaselineRunId) {
    return allRuns.find((r) => r.id === explicitBaselineRunId);
  }

  if (baselineMode === "pinned") {
    const pinnedId = suite?.baselineRunId ?? currentRun.baselineRunId;
    if (pinnedId) {
      return allRuns.find((r) => r.id === pinnedId);
    }
  }

  if (baselineMode === "window") {
    const currentTs = currentRun.createdAt?.getTime() || Date.now();
    const windowStart = currentTs - (windowDays * 24 * 60 * 60 * 1000);
    const inWindow = completedSuiteRuns.filter((run) => {
      const createdTs = run.createdAt?.getTime() || 0;
      return createdTs >= windowStart && createdTs < currentTs;
    });
    if (inWindow.length > 0) {
      return inWindow.sort((a, b) => {
        const aPass = getComparableMetrics(a.metricsJson).passRate;
        const bPass = getComparableMetrics(b.metricsJson).passRate;
        return bPass - aPass;
      })[0];
    }
  }

  return completedSuiteRuns[0];
}
