import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { csrfHeaders } from "@/lib/csrf";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { AlertCircle, Info, RefreshCw } from "lucide-react";

type OverviewResponse = {
  chatCount: number;
  replyCount: number;
  successRate: number;
  p95LatencyMs: number;
  p95TtftMs: number;
  avgTokens: number;
  p95Tokens: number;
  totalCostUsd: number;
  avgUnsupportedClaimRate: number;
  p95UnsupportedClaimRate: number;
  avgCitationIntegrityRate: number;
  toolFailureRate: number;
  lowEvidenceFailuresCount: number;
  contradictionHandlingFailuresCount: number;
  enterpriseOverallPassRate?: number;
  enterpriseCitationUiReadinessRate?: number;
  enterpriseHallucinationAvoidanceRate?: number;
  enterpriseStabilityPassRate?: number;
};

type ChatListRow = {
  chatId: string;
  createdAt: string;
  model?: string;
  environment?: string;
  replyCount: number;
  avgUnsupportedClaimRate: number;
  citationIntegrityRate: number;
  p95LatencyMs: number;
  totalTokens: number;
  totalCostUsd: number;
  flags: string[];
};

type ChatListResponse = {
  page: number;
  pageSize: number;
  total: number;
  rows: ChatListRow[];
};

type DiffResponse = {
  diffs: Array<{
    metric: string;
    baseline: number;
    current: number;
    delta: number;
    deltaPercent: number;
    isRegression: boolean;
  }>;
};

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function MetricCard({ title, value, help, className }: { title: string; value: string; help: string; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {title}
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>{help}</TooltipContent>
          </Tooltip>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

export default function AdminChatsOverviewPage() {
  const { toast } = useToast();
  const isDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const [environment, setEnvironment] = useState<string>("all");
  const [model, setModel] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [showDiff, setShowDiff] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (environment !== "all") params.set("environment", environment);
    if (model !== "all") params.set("model", model);
    if (status !== "all") params.set("status", status);
    if (from) params.set("dateFrom", from);
    if (to) params.set("dateTo", to);
    params.set("page", String(page));
    params.set("pageSize", "20");
    return params.toString();
  }, [environment, model, status, from, to, page]);

  const { data: overview, isLoading: loadingOverview, refetch: refetchOverview } = useQuery<OverviewResponse>({
    queryKey: [`/api/admin/chats/overview?${query}`],
  });
  const { data: list, isLoading: loadingList, refetch: refetchList } = useQuery<ChatListResponse>({
    queryKey: [`/api/admin/chats?${query}`],
  });
  const { data: timeseries } = useQuery<Array<{ bucket: string; successRate: number; p95LatencyMs: number; unsupportedClaimRate: number; citationIntegrityRate: number }>>({
    queryKey: [`/api/admin/chats/timeseries?${query}`],
  });
  const { data: compareData } = useQuery<DiffResponse>({
    queryKey: ["/api/admin/chats/compare", query, showDiff],
    enabled: showDiff,
    queryFn: async () => {
      const response = await fetch("/api/admin/chats/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        credentials: "include",
        body: JSON.stringify({
          baselineWindow: { dateFrom: from || undefined, dateTo: to || undefined },
          currentWindow: { dateFrom: from || undefined, dateTo: to || undefined, environment: environment !== "all" ? environment : undefined, model: model !== "all" ? model : undefined },
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
  });

  const diffByMetric = new Map((compareData?.diffs ?? []).map((d) => [d.metric, d]));
  const hasNoQualityData = !loadingOverview && !!overview && overview.chatCount === 0 && overview.replyCount === 0;
  const seedDemoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/seed-demo-eval");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/chats/overview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/chats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/chats/timeseries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/eval-runs"] });
      toast({ title: "Demo data seeded", description: "Chat quality and eval demo data were generated." });
      refreshAll();
    },
    onError: (error) => {
      toast({
        title: "Seed failed",
        description: error instanceof Error ? error.message : "Failed to seed demo data",
        variant: "destructive",
      });
    },
  });
  const refreshAll = () => {
    refetchOverview();
    refetchList();
  };

  return (
    <TooltipProvider>
      <Layout title="Chat Quality">
        <div className="container mx-auto p-6 space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Chat Quality</h1>
              <p className="text-muted-foreground">Enterprise RAG quality and explainability across chats and replies.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant={showDiff ? "default" : "outline"} onClick={() => setShowDiff((v) => !v)}>
                {showDiff ? "Baseline On" : "Compare Baseline"}
              </Button>
              <Button variant="outline" onClick={refreshAll}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                <Select value={environment} onValueChange={setEnvironment}>
                  <SelectTrigger><SelectValue placeholder="Environment" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All envs</SelectItem>
                    <SelectItem value="prod">prod</SelectItem>
                    <SelectItem value="stage">stage</SelectItem>
                    <SelectItem value="dev">dev</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="ok">ok</SelectItem>
                    <SelectItem value="error">error</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Model (e.g. gpt-4o)" value={model === "all" ? "" : model} onChange={(e) => setModel(e.target.value || "all")} />
                <Button variant="outline" onClick={() => setPage(1)}>Apply</Button>
              </div>
            </CardContent>
          </Card>

          {(loadingOverview || !overview) ? (
            <Card><CardContent className="py-8 text-sm text-muted-foreground">Loading overview...</CardContent></Card>
          ) : hasNoQualityData ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No quality data yet</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Chat quality data is generated when users chat with the assistant. Seed demo data to preview this dashboard.
                </p>
                <div className="flex items-center gap-2">
                  <Button asChild variant="outline">
                    <Link href="/chat">Go to Chat</Link>
                  </Button>
                  <Button asChild>
                    <Link href="/admin/evals">Run Eval Suite</Link>
                  </Button>
                  {isDev && (
                    <Button variant="secondary" onClick={() => seedDemoMutation.mutate()} disabled={seedDemoMutation.isPending}>
                      {seedDemoMutation.isPending ? "Seeding..." : "Seed Demo Data"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
              <MetricCard title="Chats" value={String(overview.chatCount)} help="Number of chat sessions in selected range." />
              <MetricCard title="Replies" value={String(overview.replyCount)} help="Number of assistant replies in selected range." />
              <MetricCard title="Success Rate" value={`${(overview.successRate * 100).toFixed(1)}%`} help="Share of replies with status=ok." />
              <MetricCard title="P95 Latency" value={`${Math.round(overview.p95LatencyMs)}ms`} help="95th percentile reply latency." />
              <MetricCard title="P95 TTFT" value={`${Math.round(overview.p95TtftMs)}ms`} help="95th percentile time-to-first-token." />
              <MetricCard title="Avg Tokens" value={overview.avgTokens.toFixed(1)} help="Average tokens per reply (input + output)." />
              <MetricCard title="P95 Tokens" value={overview.p95Tokens.toFixed(0)} help="95th percentile token count per reply." />
              <MetricCard title="Total Cost" value={`$${overview.totalCostUsd.toFixed(4)}`} help="Sum of estimated cost for selected replies." />
              <MetricCard
                title="Unsupported Claim Rate"
                value={`${(overview.avgUnsupportedClaimRate * 100).toFixed(1)}%`}
                help="Average claim-level unsupported rate."
                className={overview.avgUnsupportedClaimRate > 0.2 ? "border-red-500/50" : undefined}
              />
              <MetricCard
                title="Citation Integrity"
                value={`${(overview.avgCitationIntegrityRate * 100).toFixed(1)}%`}
                help="Average rate of citation-to-evidence integrity."
                className={overview.avgCitationIntegrityRate < 0.8 ? "border-amber-500/50" : undefined}
              />
              <MetricCard
                title="Enterprise Pass"
                value={formatPercent(overview.enterpriseOverallPassRate ?? 0)}
                help="Overall pass rate for the enterprise eval pack."
              />
              <MetricCard
                title="Hallucination Avoidance"
                value={formatPercent(overview.enterpriseHallucinationAvoidanceRate ?? 0)}
                help="No-hallucination-under-missing-data pass rate."
              />
              <MetricCard
                title="Citation UI Readiness"
                value={formatPercent(overview.enterpriseCitationUiReadinessRate ?? 0)}
                help="Share of citations with resolvable links."
              />
            </div>
          )}

          {showDiff && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Baseline Deltas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(compareData?.diffs ?? []).map((diff) => (
                  <div key={diff.metric} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
                    <span className="font-medium">{diff.metric}</span>
                    <div className="flex items-center gap-3">
                      <span>delta {diff.delta.toFixed(4)}</span>
                      <span>({diff.deltaPercent.toFixed(2)}%)</span>
                      <Badge variant={diff.isRegression ? "destructive" : "secondary"}>
                        {diff.isRegression ? "Regression" : "Improved"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {!hasNoQualityData && <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Trend: Success and Latency</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeseries ?? []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bucket" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <ReTooltip />
                    <Line yAxisId="left" type="monotone" dataKey="successRate" stroke="hsl(var(--chart-2))" name="Success Rate" />
                    <Line yAxisId="right" type="monotone" dataKey="p95LatencyMs" stroke="hsl(var(--chart-1))" name="P95 Latency (ms)" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Trend: Unsupported vs Citation Integrity</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeseries ?? []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bucket" />
                    <YAxis />
                    <ReTooltip />
                    <Bar dataKey="unsupportedClaimRate" fill="hsl(var(--chart-4))" name="Unsupported Claim Rate" />
                    <Bar dataKey="citationIntegrityRate" fill="hsl(var(--chart-3))" name="Citation Integrity Rate" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>}

          {!hasNoQualityData && <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Chats</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingList || !list ? (
                <div className="text-sm text-muted-foreground py-8">Loading chats...</div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Chat ID</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Model / Env</TableHead>
                        <TableHead>Replies</TableHead>
                        <TableHead>Unsupported</TableHead>
                        <TableHead>Citation Integrity</TableHead>
                        <TableHead>P95 Latency</TableHead>
                        <TableHead>Tokens / Cost</TableHead>
                        <TableHead>Flags</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.rows.map((row) => (
                        <TableRow key={row.chatId}>
                          <TableCell className="font-mono text-xs">
                            <Link href={`/admin/chats/${row.chatId}`} className="underline hover:no-underline">
                              {row.chatId.slice(0, 8)}...
                            </Link>
                          </TableCell>
                          <TableCell>{new Date(row.createdAt).toLocaleString()}</TableCell>
                          <TableCell>{row.model || "n/a"} / {row.environment || "n/a"}</TableCell>
                          <TableCell>{row.replyCount}</TableCell>
                          <TableCell className={row.avgUnsupportedClaimRate > 0.2 ? "text-red-500 font-medium" : ""}>
                            {(row.avgUnsupportedClaimRate * 100).toFixed(1)}%
                          </TableCell>
                          <TableCell className={row.citationIntegrityRate < 0.8 ? "text-amber-500 font-medium" : ""}>
                            {(row.citationIntegrityRate * 100).toFixed(1)}%
                          </TableCell>
                          <TableCell>{Math.round(row.p95LatencyMs)}ms</TableCell>
                          <TableCell>{row.totalTokens} / ${row.totalCostUsd.toFixed(4)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(row.flags || []).length === 0 ? (
                                <Badge variant="secondary">none</Badge>
                              ) : (row.flags || []).map((flag) => (
                                <Badge key={flag} variant={flag === "regression" || flag === "error" ? "destructive" : "secondary"}>
                                  {flag}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-muted-foreground">Total chats: {list.total}</div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                      <Button variant="outline" size="sm" disabled={(page * list.pageSize) >= list.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>}

          {!loadingOverview && overview && overview.replyCount === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              No replies found for the selected filters.
            </div>
          )}
        </div>
      </Layout>
    </TooltipProvider>
  );
}
