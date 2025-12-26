import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Clock, AlertCircle, CheckCircle2, RefreshCw, Zap } from "lucide-react";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";

interface Trace {
  id: string;
  requestId: string;
  userId: string | null;
  kind: "chat" | "action" | "sync" | "eval" | "playbook";
  status: "running" | "completed" | "failed";
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
}

interface Span {
  id: string;
  traceId: string;
  parentSpanId: string | null;
  name: string;
  kind: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  model: string | null;
  retrievalCount: number | null;
  error: string | null;
}

interface ObservabilityMetrics {
  totalTraces: number;
  tracesByKind: Record<string, number>;
  tracesByStatus: Record<string, number>;
  avgDurationMs: number | null;
  errorRate: number;
  p50DurationMs: number | null;
  p95DurationMs: number | null;
  totalSpans: number;
  spansByKind: Record<string, number>;
  avgTokensPerRequest: number | null;
}

export default function ObservabilityPage() {
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  const { data: traces, isLoading: tracesLoading, refetch: refetchTraces } = useQuery<Trace[]>({
    queryKey: ["/api/traces", kindFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (kindFilter !== "all") params.set("kind", kindFilter);
      params.set("limit", "50");
      const res = await fetch(`/api/traces?${params}`);
      if (!res.ok) throw new Error("Failed to fetch traces");
      return res.json();
    },
  });

  const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery<ObservabilityMetrics>({
    queryKey: ["/api/admin/observability/metrics"],
  });

  const { data: traceDetails } = useQuery<{ trace: Trace; spans: Span[] }>({
    queryKey: ["/api/traces", selectedTraceId],
    enabled: !!selectedTraceId,
    queryFn: async () => {
      const res = await fetch(`/api/traces/${selectedTraceId}`);
      if (!res.ok) throw new Error("Failed to fetch trace details");
      return res.json();
    },
  });

  const handleRefresh = () => {
    refetchTraces();
    refetchMetrics();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "failed":
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground animate-pulse" />;
    }
  };

  const getKindColor = (kind: string) => {
    switch (kind) {
      case "chat":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
      case "action":
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400";
      case "sync":
        return "bg-orange-500/10 text-orange-600 dark:text-orange-400";
      case "eval":
        return "bg-green-500/10 text-green-600 dark:text-green-400";
      case "playbook":
        return "bg-pink-500/10 text-pink-600 dark:text-pink-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="p-6 space-y-6" data-testid="page-observability">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Observability</h1>
          <p className="text-muted-foreground">Monitor traces, spans, and system performance</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} data-testid="button-refresh">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Total Traces</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-bold" data-testid="text-total-traces">
                {metrics?.totalTraces ?? 0}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-bold" data-testid="text-avg-duration">
                {metrics?.avgDurationMs ? `${Math.round(metrics.avgDurationMs)}ms` : "-"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            <AlertCircle className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-bold" data-testid="text-error-rate">
                {metrics?.errorRate ? `${(metrics.errorRate * 100).toFixed(1)}%` : "0%"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Avg Tokens</CardTitle>
            <Zap className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-bold" data-testid="text-avg-tokens">
                {metrics?.avgTokensPerRequest ? Math.round(metrics.avgTokensPerRequest) : "-"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle>Traces</CardTitle>
              <Select value={kindFilter} onValueChange={setKindFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-kind-filter">
                  <SelectValue placeholder="Filter by kind" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All kinds</SelectItem>
                  <SelectItem value="chat">Chat</SelectItem>
                  <SelectItem value="action">Action</SelectItem>
                  <SelectItem value="sync">Sync</SelectItem>
                  <SelectItem value="eval">Eval</SelectItem>
                  <SelectItem value="playbook">Playbook</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <CardDescription>Recent traces across all operations</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              {tracesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : traces && traces.length > 0 ? (
                <div className="space-y-2">
                  {traces.map((trace) => (
                    <div
                      key={trace.id}
                      className={`p-3 rounded-md border cursor-pointer hover-elevate ${
                        selectedTraceId === trace.id ? "bg-accent" : ""
                      }`}
                      onClick={() => setSelectedTraceId(trace.id)}
                      data-testid={`trace-row-${trace.id}`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(trace.status)}
                          <Badge variant="outline" className={getKindColor(trace.kind)}>
                            {trace.kind}
                          </Badge>
                          <span className="text-sm font-mono text-muted-foreground truncate max-w-[200px]">
                            {trace.requestId.slice(0, 8)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          {trace.durationMs && (
                            <span data-testid={`text-duration-${trace.id}`}>
                              {trace.durationMs}ms
                            </span>
                          )}
                          <span>
                            {formatDistanceToNow(new Date(trace.startedAt), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                      {trace.error && (
                        <p className="mt-1 text-sm text-destructive truncate">{trace.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No traces found
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trace Details</CardTitle>
            <CardDescription>
              {selectedTraceId ? "Spans for selected trace" : "Select a trace to view details"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedTraceId && traceDetails ? (
              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  <div className="p-3 rounded-md bg-muted/50">
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusIcon(traceDetails.trace.status)}
                      <span className="font-medium">{traceDetails.trace.kind}</span>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>Request ID: {traceDetails.trace.requestId}</p>
                      {traceDetails.trace.durationMs && (
                        <p>Duration: {traceDetails.trace.durationMs}ms</p>
                      )}
                      <p>
                        Started: {new Date(traceDetails.trace.startedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {traceDetails.spans.length > 0 ? (
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Spans ({traceDetails.spans.length})</h4>
                      {traceDetails.spans.map((span) => (
                        <div
                          key={span.id}
                          className="p-2 rounded-md border text-sm"
                          data-testid={`span-row-${span.id}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(span.status)}
                              <span className="font-medium">{span.name}</span>
                            </div>
                            {span.durationMs && (
                              <span className="text-muted-foreground">
                                {span.durationMs}ms
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-muted-foreground text-xs flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs">
                              {span.kind}
                            </Badge>
                            {span.model && <span>Model: {span.model}</span>}
                            {span.inputTokens && <span>In: {span.inputTokens}</span>}
                            {span.outputTokens && <span>Out: {span.outputTokens}</span>}
                            {span.retrievalCount && <span>Chunks: {span.retrievalCount}</span>}
                          </div>
                          {span.error && (
                            <p className="mt-1 text-destructive text-xs truncate">
                              {span.error}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No spans recorded</p>
                  )}
                </div>
              </ScrollArea>
            ) : (
              <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                Click on a trace to view its spans
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Traces by Kind</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(metrics.tracesByKind || {}).map(([kind, count]) => (
                  <div key={kind} className="flex items-center justify-between">
                    <Badge variant="outline" className={getKindColor(kind)}>
                      {kind}
                    </Badge>
                    <span className="font-medium">{count as number}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Spans by Kind</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(metrics.spansByKind || {}).map(([kind, count]) => (
                  <div key={kind} className="flex items-center justify-between">
                    <Badge variant="secondary">{kind}</Badge>
                    <span className="font-medium">{count as number}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
