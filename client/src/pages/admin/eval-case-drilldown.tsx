import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, ExternalLink } from "lucide-react";

type DrilldownResponse = {
  run: { id: string; createdAt?: string };
  baselineRun: { id: string; createdAt?: string };
  current: {
    status: "passed" | "failed";
    reason?: string;
    output?: unknown;
    traceId?: string | null;
    metrics: Record<string, number | null>;
    artifacts: unknown;
  };
  baseline: {
    status: "passed" | "failed";
    reason?: string;
    output?: unknown;
    traceId?: string | null;
    metrics: Record<string, number | null>;
    artifacts: unknown;
  } | null;
  whyRegressed: string[];
  explainability: Record<string, unknown>;
};

function formatMetric(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  if (value >= 0 && value <= 1) return `${(value * 100).toFixed(1)}%`;
  return `${value.toFixed(2)}`;
}

function renderArtifact(value: unknown) {
  if (value === null || value === undefined) return "Not captured";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Not captured";
  }
}

export default function EvalCaseDrilldownPage() {
  const [, params] = useRoute("/admin/evals/runs/:runId/cases/:resultId");
  const runId = params?.runId;
  const resultId = params?.resultId;

  const { data, isLoading } = useQuery<DrilldownResponse>({
    queryKey: [`/api/eval-results/${resultId}/drilldown?runId=${runId}`],
    enabled: Boolean(runId && resultId),
  });

  const metricEntries = Object.entries(data?.current.metrics || {});

  return (
    <Layout title="Eval Case Drilldown">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Case Explainability</h1>
            <p className="text-xs font-mono text-muted-foreground">{resultId}</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/admin/evals">Back to Evals</Link>
          </Button>
        </div>

        {isLoading || !data ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">Loading drilldown...</CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Why Regressed</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.whyRegressed.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No regression reason detected.</p>
                ) : (
                  data.whyRegressed.map((reason, idx) => (
                    <div key={idx} className="text-sm rounded-md border p-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <span>{reason}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Current</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Badge variant={data.current.status === "failed" ? "destructive" : "default"}>
                    {data.current.status.toUpperCase()}
                  </Badge>
                  <p className="text-sm text-muted-foreground">{data.current.reason || "N/A"}</p>
                  <div className="rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
                    {renderArtifact(data.current.output)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Trace: {data.current.traceId ? (
                      <span className="font-mono">{data.current.traceId}</span>
                    ) : "Not captured"}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Baseline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Badge variant={data.baseline?.status === "failed" ? "destructive" : "default"}>
                    {(data.baseline?.status || "missing").toUpperCase()}
                  </Badge>
                  <p className="text-sm text-muted-foreground">{data.baseline?.reason || "N/A"}</p>
                  <div className="rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
                    {renderArtifact(data.baseline?.output)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Trace: {data.baseline?.traceId ? (
                      <span className="font-mono">{data.baseline.traceId}</span>
                    ) : "Not captured"}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Metric Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metric</TableHead>
                      <TableHead>Baseline</TableHead>
                      <TableHead>Current</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metricEntries.map(([key, currentValue]) => (
                      <TableRow key={key}>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">{key}</span>
                            </TooltipTrigger>
                            <TooltipContent>Metric used in guardrail and regression classification.</TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>{formatMetric(data.baseline?.metrics?.[key] ?? null)}</TableCell>
                        <TableCell>{formatMetric(currentValue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Current Explainability Artifacts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground mb-1">Retrieval / citations / claims / rationale</div>
                    <pre className="text-xs overflow-x-auto whitespace-pre-wrap">{renderArtifact(data.current.artifacts)}</pre>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Baseline Explainability Artifacts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground mb-1">Retrieval / citations / claims / rationale</div>
                    <pre className="text-xs overflow-x-auto whitespace-pre-wrap">{renderArtifact(data.baseline?.artifacts)}</pre>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Explainability Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {Object.entries(data.explainability || {}).map(([k, v]) => (
                  <div key={k} className="rounded-md border p-2">
                    <span className="font-medium mr-2">{k}:</span>
                    <span className="text-muted-foreground">{String(v)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
