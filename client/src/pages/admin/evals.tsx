import { useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { EvalRun, EvalSuite } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AlertTriangle, ArrowUpDown, BarChart3, ChevronDown, Clock, Loader2, Play, Upload } from "lucide-react";
import { Line, LineChart, XAxis, YAxis } from "recharts";

type BaselineMode = "previous" | "pinned" | "window";
type Severity = "P0" | "P1" | "P2";

interface EvalCaseResult {
  id: string;
  type: string;
  prompt: string;
  passed: boolean;
  reason?: string;
  recallAtK?: number;
  citationIntegrity?: number;
  unsupportedClaimRate?: number;
  latencyMs?: number;
  tokenUsage?: number;
}

interface EvalRunWithSuite extends EvalRun {
  suite?: EvalSuite;
}

interface EvalDiffResponse {
  baselineMode: BaselineMode;
  gate: { status: "PASS" | "WARN" | "FAIL"; p0Count: number; p1Count: number; p2Count: number };
  diffs: Array<{
    key: string;
    metric: string;
    baseline: number;
    current: number;
    delta: number;
    deltaPercent: number;
    severity: "P0" | "P1" | "P2" | "none";
    status: "pass" | "warning" | "fail";
    reason?: string;
    isRegression: boolean;
  }>;
}

interface RegressedCaseRow {
  caseId: string;
  category: string;
  severity: Severity;
  baseline: { passed: boolean; reason?: string };
  current: { passed: boolean; reason?: string };
  topDeltaReasons: string[];
  drilldownPath: string;
}

interface ProductionSummaryResponse {
  window: string;
  replyCount: number;
  chatCount: number;
  kpis: {
    groundingAvg: number;
    citationIntegrityRate: number;
    hallucinationRiskRate: number;
    retrievalHitRate: number;
    uniqueSourcesAvg: number;
    refusalRate: number;
    safetyRate: number;
    latency: {
      retrievalP50: number;
      retrievalP95: number;
      generationP50: number;
      generationP95: number;
      totalP50: number;
      totalP95: number;
    };
  };
}

interface ProductionWorstResponse {
  window: string;
  metric: string;
  rows: Array<{
    replyId: string;
    chatId: string;
    metric: string;
    value: number;
    traceId?: string | null;
    createdAt: string;
    reason?: string;
  }>;
}

interface ProductionFailureModesResponse {
  window: string;
  totalReplies: number;
  rows: Array<{ mode: string; count: number; rate: number }>;
}

function safeNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function normalizeRate(value: number): number {
  if (value <= 1) return Math.max(0, value);
  if (value <= 100) return Math.max(0, value / 100);
  return 0;
}

function formatPercent(v: number): string {
  return `${(safeNumber(v) * 100).toFixed(1)}%`;
}

function formatDelta(v: number, isPercent = false): string {
  if (!Number.isFinite(v)) return "N/A";
  const prefix = v >= 0 ? "+" : "";
  if (isPercent) return `${prefix}${v.toFixed(1)}%`;
  return `${prefix}${v.toFixed(3)}`;
}

function getSafeSuiteCaseCount(jsonText: string | null): number {
  if (!jsonText) return 0;
  try {
    const parsed = JSON.parse(jsonText) as { cases?: unknown[] };
    return Array.isArray(parsed.cases) ? parsed.cases.length : 0;
  } catch {
    return 0;
  }
}

export default function EvalsPage() {
  const { toast } = useToast();
  const isDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedSuiteId, setSelectedSuiteId] = useState<string>("");
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [baselineMode, setBaselineMode] = useState<BaselineMode>("previous");
  const [windowDays, setWindowDays] = useState<number>(7);
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [caseSearch, setCaseSearch] = useState("");
  const [sortBy, setSortBy] = useState<"severity" | "caseId">("severity");
  const [dashboardMode, setDashboardMode] = useState<"production" | "suites">("production");
  const [productionWindow, setProductionWindow] = useState<"24h" | "7d" | "30d">("7d");
  const [selectedProductionReplyId, setSelectedProductionReplyId] = useState<string | null>(null);

  const { data: suites = [], isLoading: suitesLoading } = useQuery<EvalSuite[]>({
    queryKey: ["/api/eval-suites"],
  });
  const { data: runs = [], isLoading: runsLoading } = useQuery<EvalRunWithSuite[]>({
    queryKey: ["/api/eval-runs"],
  });

  const completedRuns = useMemo(() => {
    return runs
      .filter((r) => r.status === "completed" && Boolean(r.finishedAt))
      .sort((a, b) => {
        const aTs = new Date(a.startedAt as Date).getTime();
        const bTs = new Date(b.startedAt as Date).getTime();
        return bTs - aTs;
      });
  }, [runs]);

  const selectedRun = useMemo(() => {
    if (selectedRunId) return runs.find((r) => r.id === selectedRunId) || null;
    return completedRuns[0] || null;
  }, [runs, completedRuns, selectedRunId]);

  const selectedSuite = useMemo(() => {
    if (!selectedSuiteId) return null;
    return suites.find((s) => s.id === selectedSuiteId) || null;
  }, [suites, selectedSuiteId]);

  const diffQuery = useQuery<EvalDiffResponse>({
    queryKey: [`/api/eval-runs/${selectedRun?.id}/diff?baselineMode=${baselineMode}&windowDays=${windowDays}`],
    enabled: Boolean(selectedRun?.id),
  });

  const runDetailQuery = useQuery<any>({
    queryKey: [`/api/eval-runs/${selectedRun?.id}`],
    enabled: Boolean(selectedRun?.id),
  });

  const regressedQuery = useQuery<{ regressed: RegressedCaseRow[]; improved: RegressedCaseRow[] }>({
    queryKey: [`/api/eval-runs/${selectedRun?.id}/regressed-cases?baselineMode=${baselineMode}&windowDays=${windowDays}&limit=200`],
    enabled: Boolean(selectedRun?.id),
  });

  const trendsQuery = useQuery<{ points: Array<Record<string, unknown>> }>({
    queryKey: [`/api/eval-suites/${selectedRun?.suiteId}/trends?limit=30`],
    enabled: Boolean(selectedRun?.suiteId),
  });

  const productionSummaryQuery = useQuery<ProductionSummaryResponse>({
    queryKey: [`/api/admin/evals/production/summary?window=${productionWindow}`],
    enabled: dashboardMode === "production",
  });
  const productionWorstQuery = useQuery<ProductionWorstResponse>({
    queryKey: [`/api/admin/evals/production/worst?window=${productionWindow}&metric=citationIntegrity&limit=50`],
    enabled: dashboardMode === "production",
  });
  const productionFailureModesQuery = useQuery<ProductionFailureModesResponse>({
    queryKey: [`/api/admin/evals/production/failure-modes?window=${productionWindow}`],
    enabled: dashboardMode === "production",
  });
  const productionReplyEvalQuery = useQuery<any>({
    queryKey: [selectedProductionReplyId ? `/api/admin/replies/${selectedProductionReplyId}/eval` : ""],
    enabled: Boolean(selectedProductionReplyId),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const payload = JSON.parse(text) as Record<string, unknown>;
      const res = await apiRequest("POST", "/api/eval-suites", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/eval-suites"] });
      toast({ title: "Suite uploaded", description: "Evaluation suite created successfully." });
    },
    onError: (error) => {
      toast({ title: "Upload failed", description: error instanceof Error ? error.message : "Invalid suite file", variant: "destructive" });
    },
  });

  const runMutation = useMutation({
    mutationFn: async (suiteId: string) => {
      const res = await apiRequest("POST", `/api/eval-suites/${suiteId}/run`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/eval-runs"] });
      toast({ title: "Evaluation started", description: "Run started successfully." });
    },
    onError: (error) => {
      toast({ title: "Run failed", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    },
  });

  const seedDemoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/seed-demo-eval");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/eval-suites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/eval-runs"] });
      toast({ title: "Demo run seeded", description: "A demo eval suite and run were created." });
    },
    onError: (error) => {
      toast({ title: "Seed failed", description: error instanceof Error ? error.message : "Unable to seed demo run", variant: "destructive" });
    },
  });

  const runEnterprisePackMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/run-enterprise-eval-pack", { repeatCount: 1 });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/eval-runs"] });
      toast({ title: "Enterprise eval pack run started" });
    },
    onError: (error) => {
      toast({ title: "Enterprise eval pack failed", description: error instanceof Error ? error.message : "Unable to run enterprise eval pack", variant: "destructive" });
    },
  });

  const selectedRunResolved = runDetailQuery.data || selectedRun;
  const runResultsRaw = typeof selectedRunResolved?.resultsJson === "string"
    ? (() => {
        try {
          return JSON.parse(selectedRunResolved.resultsJson) as unknown;
        } catch {
          return [];
        }
      })()
    : selectedRunResolved?.resultsJson;
  const runResults: EvalCaseResult[] = Array.isArray(runResultsRaw)
    ? (runResultsRaw as EvalCaseResult[])
    : [];
  const enterpriseArtifacts: Array<any> = Array.isArray(selectedRunResolved?.enterpriseEvalArtifacts)
    ? selectedRunResolved.enterpriseEvalArtifacts
    : [];
  const enterprisePassRate = enterpriseArtifacts.length
    ? enterpriseArtifacts.filter((a) => a?.overallPass).length / enterpriseArtifacts.length
    : 0;
  const enterpriseAvgScore = enterpriseArtifacts.length
    ? enterpriseArtifacts.reduce((sum, a) => sum + (Number(a?.overallScore) || 0), 0) / enterpriseArtifacts.length
    : 0;

  const filteredRegressed = useMemo(() => {
    const rows = regressedQuery.data?.regressed || [];
    const filtered = rows.filter((row) => {
      if (severityFilter !== "all" && row.severity !== severityFilter) return false;
      if (categoryFilter !== "all" && row.category !== categoryFilter) return false;
      if (caseSearch && !row.caseId.toLowerCase().includes(caseSearch.toLowerCase())) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (sortBy === "caseId") return a.caseId.localeCompare(b.caseId);
      const rank = { P0: 3, P1: 2, P2: 1 };
      return rank[b.severity] - rank[a.severity];
    });
  }, [regressedQuery.data?.regressed, severityFilter, categoryFilter, caseSearch, sortBy]);

  const categories = useMemo(() => {
    const rows = regressedQuery.data?.regressed || [];
    return Array.from(new Set(rows.map((r) => r.category)));
  }, [regressedQuery.data?.regressed]);

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    uploadMutation.mutate(file);
  };

  const gate = diffQuery.data?.gate;
  const keyDeltas = diffQuery.data?.diffs || [];
  const topMetrics = keyDeltas.filter((d) =>
    ["passRate", "groundedness", "unsupportedClaimRate", "citationIntegrity", "p95LatencyMs", "p95Tokens", "totalCostUsd"].includes(d.key)
  );
  const showGlobalEmpty = !suitesLoading && !runsLoading && suites.length === 0 && runs.length === 0;
  const baselineSelectorDisabled = completedRuns.length === 0;
  const hasBaselineComparison = Boolean(gate && topMetrics.length > 0 && !diffQuery.isError);
  const currentRunMetricsRaw = selectedRunResolved?.metricsJson;
  const currentRunMetrics = typeof currentRunMetricsRaw === "string"
    ? (() => {
        try {
          return JSON.parse(currentRunMetricsRaw) as Record<string, unknown>;
        } catch {
          return {} as Record<string, unknown>;
        }
      })()
    : ((currentRunMetricsRaw as Record<string, unknown>) || {});
  const currentPassRate = normalizeRate(safeNumber(currentRunMetrics.passRate));
  const currentUnsupported = normalizeRate(safeNumber(currentRunMetrics.unsupportedClaimRate));
  const currentCitationIntegrity = normalizeRate(safeNumber(currentRunMetrics.citationIntegrity));
  const currentP95Latency = safeNumber(currentRunMetrics.p95LatencyMs);
  const currentP95Tokens = safeNumber(currentRunMetrics.p95Tokens);
  const currentCost = safeNumber(currentRunMetrics.totalCostUsd);

  if (dashboardMode === "production") {
    const prod = productionSummaryQuery.data;
    return (
      <Layout title="Evaluations">
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">Eval Regression Cockpit</h2>
              <p className="text-sm text-muted-foreground">
                Production reply quality with enterprise explainability and latency breakdown.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="default" onClick={() => setDashboardMode("production")}>Production Chats</Button>
              <Button variant="outline" onClick={() => setDashboardMode("suites")}>Eval Suites</Button>
              <Select value={productionWindow} onValueChange={(v) => setProductionWindow(v as "24h" | "7d" | "30d")}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">24h</SelectItem>
                  <SelectItem value="7d">7d</SelectItem>
                  <SelectItem value="30d">30d</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {productionSummaryQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !prod || prod.replyCount === 0 ? (
            <Card>
              <CardHeader><CardTitle className="text-base">No production reply eval data yet</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Run chats and/or seed demo data to generate production evaluation telemetry.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
                <div className="rounded-md border p-3 text-sm"><div className="text-muted-foreground">Replies</div><div className="font-medium">{prod.replyCount}</div></div>
                <div className="rounded-md border p-3 text-sm"><div className="text-muted-foreground">Grounding avg</div><div className="font-medium">{formatPercent(prod.kpis.groundingAvg)}</div></div>
                <div className="rounded-md border p-3 text-sm"><div className="text-muted-foreground">Citation integrity</div><div className="font-medium">{formatPercent(prod.kpis.citationIntegrityRate)}</div></div>
                <div className="rounded-md border p-3 text-sm"><div className="text-muted-foreground">Hallucination risk</div><div className="font-medium">{formatPercent(prod.kpis.hallucinationRiskRate)}</div></div>
                <div className="rounded-md border p-3 text-sm"><div className="text-muted-foreground">Safety pass</div><div className="font-medium">{formatPercent(prod.kpis.safetyRate)}</div></div>
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base">Latency split (p50 / p95)</CardTitle></CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3 text-sm">
                  <div className="rounded-md border p-3"><div className="text-muted-foreground">Retrieval</div><div className="font-medium">{Math.round(prod.kpis.latency.retrievalP50)} / {Math.round(prod.kpis.latency.retrievalP95)} ms</div></div>
                  <div className="rounded-md border p-3"><div className="text-muted-foreground">Generation</div><div className="font-medium">{Math.round(prod.kpis.latency.generationP50)} / {Math.round(prod.kpis.latency.generationP95)} ms</div></div>
                  <div className="rounded-md border p-3"><div className="text-muted-foreground">Total</div><div className="font-medium">{Math.round(prod.kpis.latency.totalP50)} / {Math.round(prod.kpis.latency.totalP95)} ms</div></div>
                </CardContent>
              </Card>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle className="text-base">Worst replies (citation integrity)</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Reply</TableHead>
                          <TableHead>Chat</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(productionWorstQuery.data?.rows || []).slice(0, 20).map((row) => (
                          <TableRow key={row.replyId}>
                            <TableCell className="font-mono text-xs">{row.replyId.slice(0, 8)}...</TableCell>
                            <TableCell className="font-mono text-xs">{row.chatId.slice(0, 8)}...</TableCell>
                            <TableCell>{formatPercent(row.value)}</TableCell>
                            <TableCell>
                              <Button size="sm" variant="outline" onClick={() => setSelectedProductionReplyId(row.replyId)}>View eval</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">Top failure modes</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Failure mode</TableHead>
                          <TableHead>Count</TableHead>
                          <TableHead>Rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(productionFailureModesQuery.data?.rows || []).map((row) => (
                          <TableRow key={row.mode}>
                            <TableCell>{row.mode}</TableCell>
                            <TableCell>{row.count}</TableCell>
                            <TableCell>{formatPercent(row.rate)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
          <Dialog open={Boolean(selectedProductionReplyId)} onOpenChange={(open) => !open && setSelectedProductionReplyId(null)}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Production Reply Explainability</DialogTitle></DialogHeader>
              {productionReplyEvalQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading eval artifact...</div>
              ) : !productionReplyEvalQuery.data ? (
                <div className="text-sm text-muted-foreground">No eval artifact found for this reply.</div>
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="rounded-md border p-3">
                    <div className="font-medium mb-1">Reasons</div>
                    <div className="text-muted-foreground space-y-1">
                      <div>{productionReplyEvalQuery.data?.reasons?.groundingReason || "N/A"}</div>
                      <div>{productionReplyEvalQuery.data?.reasons?.integrityReason || "N/A"}</div>
                      <div>{productionReplyEvalQuery.data?.reasons?.relevanceReason || "N/A"}</div>
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="font-medium mb-1">Retrieved chunks</div>
                    <div className="space-y-2">
                      {(productionReplyEvalQuery.data?.retrievedChunks || []).slice(0, 8).map((chunk: any, idx: number) => (
                        <div key={`${chunk.chunkId || "chunk"}-${idx}`} className="rounded border p-2">
                          <div className="font-mono text-xs">{chunk.chunkId || "unknown"} ({chunk.sourceId || "source"})</div>
                          <div className="text-xs text-muted-foreground whitespace-pre-wrap">{chunk.text || chunk.snippet || "No snippet available."}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Evaluations">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Eval Regression Cockpit</h2>
            <p className="text-sm text-muted-foreground">
              Release gate with baseline comparison, regressions, trends, and explainability drilldown.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" className="hidden" accept=".json" onChange={handleUpload} />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
              {uploadMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Upload Suite
            </Button>
            <Button variant="outline" onClick={() => setDashboardMode("production")}>Production Chats</Button>
            <Button variant="default" onClick={() => setDashboardMode("suites")}>Eval Suites</Button>
            {isDev && (
              <Button variant="outline" onClick={() => seedDemoMutation.mutate()} disabled={seedDemoMutation.isPending}>
                {seedDemoMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Seed Demo Run
              </Button>
            )}
            {isDev && (
              <Button variant="secondary" onClick={() => runEnterprisePackMutation.mutate()} disabled={runEnterprisePackMutation.isPending}>
                {runEnterprisePackMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BarChart3 className="h-4 w-4 mr-2" />}
                Run Enterprise Eval Pack
              </Button>
            )}
          </div>
        </div>

        {showGlobalEmpty && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No eval runs yet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload a suite or seed a demo run.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
                  {uploadMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  Upload Suite
                </Button>
                {isDev && (
                  <Button variant="secondary" onClick={() => seedDemoMutation.mutate()} disabled={seedDemoMutation.isPending}>
                    {seedDemoMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                    Seed Demo Run
                  </Button>
                )}
                {isDev && (
                  <Button onClick={() => runEnterprisePackMutation.mutate()} disabled={runEnterprisePackMutation.isPending}>
                    {runEnterprisePackMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BarChart3 className="h-4 w-4 mr-2" />}
                    Run Enterprise Eval Pack
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Baseline Selector</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
            <Select value={selectedRun?.id || ""} onValueChange={setSelectedRunId} disabled={baselineSelectorDisabled}>
              <SelectTrigger><SelectValue placeholder="Select run" /></SelectTrigger>
              <SelectContent>
                {completedRuns.map((run) => (
                  <SelectItem key={run.id} value={run.id}>
                    {(run.suite?.name || "Suite")} - {new Date(run.startedAt).toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={baselineMode} onValueChange={(v) => setBaselineMode(v as BaselineMode)} disabled={baselineSelectorDisabled}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="previous">Previous run</SelectItem>
                <SelectItem value="pinned">Pinned baseline</SelectItem>
                <SelectItem value="window">Last N days</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={1}
              value={windowDays}
              onChange={(e) => setWindowDays(Math.max(1, Number(e.target.value) || 7))}
              placeholder="Window days"
              disabled={baselineSelectorDisabled}
            />
            </div>
            {baselineSelectorDisabled && (
              <p className="text-sm text-muted-foreground">
                Baseline selector is disabled because no completed runs exist yet. Seed a demo run or run a suite.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Enterprise Eval Pack</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedRun ? (
              <div className="text-sm text-muted-foreground">Select a run to inspect enterprise eval metrics.</div>
            ) : enterpriseArtifacts.length === 0 ? (
              <div className="text-sm text-muted-foreground">No enterprise eval artifacts for this run yet.</div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-md border p-3 text-sm">
                    <div className="text-muted-foreground">Overall pass rate</div>
                    <div className="font-medium">{formatPercent(enterprisePassRate)}</div>
                  </div>
                  <div className="rounded-md border p-3 text-sm">
                    <div className="text-muted-foreground">Average composite score</div>
                    <div className="font-medium">{formatPercent(enterpriseAvgScore)}</div>
                  </div>
                  <div className="rounded-md border p-3 text-sm">
                    <div className="text-muted-foreground">Artifacts</div>
                    <div className="font-medium">{enterpriseArtifacts.length}</div>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Overall</TableHead>
                      <TableHead>Evidence Coverage</TableHead>
                      <TableHead>Clarity</TableHead>
                      <TableHead>PII Guard</TableHead>
                      <TableHead>Citation UI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enterpriseArtifacts.slice(0, 50).map((artifact, idx) => (
                      <TableRow key={`${artifact.id || "enterprise"}-${idx}`}>
                        <TableCell>
                          <Badge variant={artifact.overallPass ? "secondary" : "destructive"}>
                            {artifact.overallPass ? "PASS" : "FAIL"}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatPercent(Number(artifact.evidenceCoverageScore) || 0)}</TableCell>
                        <TableCell>{formatPercent(Number(artifact.clarityScore) || 0)}</TableCell>
                        <TableCell>{artifact.piiLeakPass ? "pass" : "fail"}</TableCell>
                        <TableCell>{formatPercent(Number(artifact.citationUiReadinessScore) || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Release Gate Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {diffQuery.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : !selectedRun ? (
              <div className="text-sm text-muted-foreground">Select a run to view release gate metrics.</div>
            ) : !hasBaselineComparison ? (
              <>
                <div className="text-sm text-muted-foreground">
                  No baseline run comparison is available yet. Create another run, or use pinned/window baseline mode.
                </div>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-md border p-3 text-sm">
                    <div className="text-muted-foreground">Pass rate</div>
                    <div className="font-medium">{formatPercent(currentPassRate)}</div>
                  </div>
                  <div className="rounded-md border p-3 text-sm">
                    <div className="text-muted-foreground">Unsupported claim rate</div>
                    <div className="font-medium">{formatPercent(currentUnsupported)}</div>
                  </div>
                  <div className="rounded-md border p-3 text-sm">
                    <div className="text-muted-foreground">Citation integrity</div>
                    <div className="font-medium">{formatPercent(currentCitationIntegrity)}</div>
                  </div>
                  <div className="rounded-md border p-3 text-sm">
                    <div className="text-muted-foreground">P95 latency</div>
                    <div className="font-medium">{Math.round(currentP95Latency)} ms</div>
                  </div>
                  <div className="rounded-md border p-3 text-sm">
                    <div className="text-muted-foreground">P95 tokens</div>
                    <div className="font-medium">{Math.round(currentP95Tokens)}</div>
                  </div>
                  <div className="rounded-md border p-3 text-sm">
                    <div className="text-muted-foreground">Total cost</div>
                    <div className="font-medium">${currentCost.toFixed(4)}</div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={gate?.status === "FAIL" ? "destructive" : gate?.status === "WARN" ? "secondary" : "default"}>
                    {gate?.status || "N/A"}
                  </Badge>
                  <Badge variant="outline">P0: {gate?.p0Count ?? 0}</Badge>
                  <Badge variant="outline">P1: {gate?.p1Count ?? 0}</Badge>
                  <Badge variant="outline">P2: {gate?.p2Count ?? 0}</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                  {topMetrics.map((metric) => (
                    <div key={metric.key} className="rounded-md border p-3">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">{metric.metric}</span>
                          </TooltipTrigger>
                          <TooltipContent>{metric.reason || "Guardrail metric used for ship/no-ship gate."}</TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="text-sm font-medium">
                        {formatDelta(metric.deltaPercent, true)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {metric.baseline.toFixed(3)} {"->"} {metric.current.toFixed(3)}
                      </div>
                      {metric.isRegression && (
                        <Badge
                          className="mt-2"
                          variant={metric.severity === "P0" ? "destructive" : "secondary"}
                        >
                          {metric.severity}: {metric.reason || "Regression"}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="regressed-cases-section">
          <CardHeader className="space-y-3">
            <CardTitle className="text-base">Regressed Cases</CardTitle>
            <div className="grid gap-3 md:grid-cols-5">
              <Input value={caseSearch} onChange={(e) => setCaseSearch(e.target.value)} placeholder="Search case_id" />
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severities</SelectItem>
                  <SelectItem value="P0">P0</SelectItem>
                  <SelectItem value="P1">P1</SelectItem>
                  <SelectItem value="P2">P2</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => setSortBy(sortBy === "severity" ? "caseId" : "severity")}>
                <ArrowUpDown className="h-4 w-4 mr-1" />
                Sort: {sortBy}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {regressedQuery.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : !filteredRegressed.length ? (
              <div className="text-sm text-muted-foreground">No regressed cases for current filters.</div>
            ) : (
                <Table data-testid="regressed-cases-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Case</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Baseline</TableHead>
                    <TableHead>Current</TableHead>
                    <TableHead>Why</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRegressed.map((row) => (
                    <TableRow key={row.caseId}>
                      <TableCell className="font-mono text-xs">{row.caseId}</TableCell>
                      <TableCell>{row.category}</TableCell>
                      <TableCell>
                        <Badge variant={row.severity === "P0" ? "destructive" : "secondary"}>{row.severity}</Badge>
                      </TableCell>
                      <TableCell>{row.baseline.passed ? "pass" : "fail"}</TableCell>
                      <TableCell>{row.current.passed ? "pass" : "fail"}</TableCell>
                      <TableCell className="max-w-xs truncate">{row.topDeltaReasons.join(", ") || "N/A"}</TableCell>
                      <TableCell>
                        <Link href={row.drilldownPath}>
                          <Button size="sm" variant="outline">Explain</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Collapsible>
          <Card>
            <CardHeader>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium">
                <ChevronDown className="h-4 w-4" />
                Improved cases ({regressedQuery.data?.improved?.length ?? 0})
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                {(regressedQuery.data?.improved || []).slice(0, 20).map((row) => (
                  <div key={row.caseId} className="text-sm py-1 border-b last:border-b-0">
                    <span className="font-mono text-xs mr-2">{row.caseId}</span>
                    <span className="text-muted-foreground">{row.category}</span>
                  </div>
                ))}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trends</CardTitle>
          </CardHeader>
          <CardContent>
            {trendsQuery.isLoading ? (
              <Skeleton className="h-60 w-full" />
            ) : (
              <ChartContainer
                className="h-64 w-full"
                config={{
                  passRate: { label: "Pass rate", color: "hsl(var(--chart-1))" },
                  unsupportedClaimRate: { label: "Unsupported", color: "hsl(var(--chart-2))" },
                  p95LatencyMs: { label: "P95 latency", color: "hsl(var(--chart-3))" },
                  totalCostUsd: { label: "Cost", color: "hsl(var(--chart-4))" },
                }}
              >
                <LineChart data={(trendsQuery.data?.points || []).map((row) => ({
                  createdAt: String(row.createdAt || ""),
                  passRate: normalizeRate(safeNumber(row.passRate)),
                  unsupportedClaimRate: normalizeRate(safeNumber(row.unsupportedClaimRate)),
                  p95LatencyMs: safeNumber(row.p95LatencyMs),
                  totalCostUsd: safeNumber(row.totalCostUsd),
                }))}>
                  <XAxis dataKey="createdAt" hide />
                  <YAxis hide />
                  <Line type="monotone" dataKey="passRate" stroke="var(--color-passRate)" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="unsupportedClaimRate" stroke="var(--color-unsupportedClaimRate)" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="p95LatencyMs" stroke="var(--color-p95LatencyMs)" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="totalCostUsd" stroke="var(--color-totalCostUsd)" dot={false} strokeWidth={2} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                </LineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Evaluation Suites</CardTitle></CardHeader>
            <CardContent>
              {suitesLoading ? (
                <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : suites.length === 0 ? (
                <div className="text-sm text-muted-foreground">No suites uploaded yet.</div>
              ) : (
                <div className="space-y-3">
                  {suites.map((suite) => (
                    <div key={suite.id} className="border rounded-md p-3 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{suite.name}</div>
                        <div className="text-xs text-muted-foreground">{getSafeSuiteCaseCount(suite.jsonText)} cases</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant={selectedSuite?.id === suite.id ? "default" : "outline"} onClick={() => setSelectedSuiteId(suite.id)}>
                          Select
                        </Button>
                        <Button size="sm" onClick={() => runMutation.mutate(suite.id)} disabled={runMutation.isPending}>
                          {runMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Play className="h-3 w-3 mr-1" />Run</>}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Recent Runs</CardTitle></CardHeader>
            <CardContent>
              {runsLoading ? (
                <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : runs.length === 0 ? (
                <div className="text-sm text-muted-foreground">No runs yet. Upload an eval suite and run it to see results here.</div>
              ) : (
                <div className="space-y-2">
                  {runs.slice(0, 8).map((run) => {
                    const summary = run.summaryJson as { passRate?: number; passed?: number; failed?: number } | null;
                    const rate = normalizeRate(safeNumber(summary?.passRate));
                    return (
                      <button
                        key={run.id}
                        type="button"
                        className="w-full text-left border rounded-md p-3 hover:bg-accent/30"
                        onClick={() => setSelectedRunId(run.id)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium">{run.suite?.name || "Unknown suite"}</div>
                            <div className="text-xs text-muted-foreground">{new Date(run.startedAt).toLocaleString()}</div>
                          </div>
                          {run.status === "running" ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <Badge variant={rate >= 0.9 ? "default" : "destructive"}>{formatPercent(rate)}</Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run Detail</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedRun ? (
              <div className="text-sm text-muted-foreground">Select a run to inspect per-case regressions.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Unsupported</TableHead>
                    <TableHead>Citation</TableHead>
                    <TableHead>Latency</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runResults.slice(0, 200).map((result) => (
                    <TableRow key={result.id}>
                      <TableCell className="font-mono text-xs">{result.id}</TableCell>
                      <TableCell>
                        {result.passed ? (
                          <Badge variant="outline" className="text-green-500 border-green-500/40">pass</Badge>
                        ) : (
                          <Badge variant="destructive">fail</Badge>
                        )}
                      </TableCell>
                      <TableCell>{formatPercent(safeNumber(result.unsupportedClaimRate))}</TableCell>
                      <TableCell>{formatPercent(safeNumber(result.citationIntegrity))}</TableCell>
                      <TableCell>{Math.round(safeNumber(result.latencyMs))} ms</TableCell>
                      <TableCell>{Math.round(safeNumber(result.tokenUsage))}</TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">{result.reason || "N/A"}</TableCell>
                      <TableCell>
                        <Link href={`/admin/evals/runs/${selectedRun.id}/cases/${result.id}`}>
                          <Button size="sm" variant="ghost">Drilldown</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Enterprise Run Health</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4 text-sm">
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Latest completed</div>
              <div className="font-medium">{completedRuns[0]?.finishedAt ? new Date(completedRuns[0].finishedAt as Date).toLocaleString() : "N/A"}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground flex items-center gap-1"><BarChart3 className="h-3 w-3" /> Completed runs</div>
              <div className="font-medium">{completedRuns.length}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3" /> Running</div>
              <div className="font-medium">{runs.filter((r) => r.status === "running").length}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Runs with failures</div>
              <div className="font-medium">
                {completedRuns.filter((run) => {
                  const summary = run.summaryJson as { failed?: number } | null;
                  return safeNumber(summary?.failed) > 0;
                }).length}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
