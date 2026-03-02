import { Link, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";

type ReplyDetailResponse = {
  chat: { id: string; model?: string; environment?: string };
  reply: {
    id: string;
    createdAt: string;
    latencyMs?: number;
    ttftMs?: number;
    tokensIn?: number;
    tokensOut?: number;
    costUsd?: number;
    traceId?: string;
  };
  inputMessages: Array<{ id: string; role: string; content: string; createdAt: string }>;
  assistantMessage?: { id: string; content: string; createdAt: string };
  retrieval?: {
    retrievedChunksJson?: Array<{ chunkId: string; sourceId: string; title?: string; snippet?: string; score?: number; url?: string }>;
    chunksReturnedCount?: number;
    sourcesReturnedCount?: number;
    topSimilarity?: number;
    retrievalLatencyMs?: number;
  };
  citation?: {
    citationsJson?: Array<{ chunkId?: string; sourceId?: string; sentenceIndex?: number; url?: string }>;
    citationCoverageRate?: number;
    citationIntegrityRate?: number;
    citationMisattributionRate?: number;
    repairApplied?: boolean;
    repairNotesJson?: unknown;
  };
  eval?: {
    claimsJson?: string[];
    claimLabelsJson?: Array<{ claim: string; label: "entailed" | "unsupported" | "contradicted"; supportingChunkIds?: string[]; rationale?: string }>;
    groundedClaimRate?: number;
    unsupportedClaimRate?: number;
    contradictionRate?: number;
    answerRelevanceScore?: number;
    completenessScore?: number;
    contextRelevanceScore?: number;
    contextRecallScore?: number;
    lowEvidenceCalibrationJson?: { pass?: boolean; rationale?: string };
    formatValidRate?: number;
    judgeModel?: string;
    judgeVersion?: string;
    judgeRationalesJson?: string[];
  };
  tool?: {
    toolCallsJson?: Array<{ name?: string; params?: unknown; responseSummary?: string; latencyMs?: number; status?: string; success?: boolean }>;
    retryCount?: number;
    idempotencyKey?: string;
    duplicateActionDetected?: boolean;
  };
  observability?: {
    traceId?: string;
    spans?: Array<{ name: string; kind: string; durationMs?: number; startedAt?: string }>;
  };
  deterministicChecks?: {
    abstentionPass: boolean;
    ownerCitationPass: boolean;
    deadlineCitationPass: boolean;
    retrievalRecallPass: boolean;
    failedChecks?: string[];
  };
  enterpriseEval?: {
    overallPass?: boolean;
    overallScore?: number;
    evidenceCoverageScore?: number;
    clarityScore?: number;
    piiLeakPass?: boolean;
    citationUiReadinessScore?: number;
    summaryJson?: Record<string, unknown>;
  };
};

function numberSentences(text: string): string {
  const parts = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.map((p, i) => `[${i + 1}] ${p}`).join("\n");
}

export default function AdminReplyDetailPage() {
  const [, params] = useRoute("/admin/chats/:chatId/replies/:replyId");
  const chatId = params?.chatId;
  const replyId = params?.replyId;
  const isDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

  const { data, isLoading } = useQuery<ReplyDetailResponse>({
    queryKey: [`/api/admin/chats/${chatId}/replies/${replyId}`],
    enabled: Boolean(chatId && replyId),
  });

  const runReplyEvalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/admin/replies/${replyId}/score`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/chats/${chatId}/replies/${replyId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/chats/${chatId}`] });
    },
  });

  return (
    <Layout title="Reply Detail">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Reply Detail</h1>
            <p className="text-muted-foreground text-sm font-mono">{replyId}</p>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/admin/chats/${chatId}`}>Back to Chat</Link>
          </Button>
        </div>

        {isLoading || !data ? (
          <Card><CardContent className="py-8 text-sm text-muted-foreground">Loading reply detail...</CardContent></Card>
        ) : (
          <>
            <Card>
              <CardHeader><CardTitle className="text-base">1) Inputs / Outputs</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div>Model: {data.chat.model || "n/a"}</div>
                  <div>Env: {data.chat.environment || "n/a"}</div>
                  <div>Reply at: {new Date(data.reply.createdAt).toLocaleString()}</div>
                </div>
                <Separator />
                <div>
                  <h3 className="text-sm font-medium mb-2">Triggering user message(s)</h3>
                  <div className="space-y-2">
                    {data.inputMessages.map((msg) => (
                      <div key={msg.id} className="rounded-md border p-2 text-sm">
                        <div className="text-xs text-muted-foreground mb-1">{new Date(msg.createdAt).toLocaleString()}</div>
                        {msg.content}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium mb-2">Assistant final response (sentence numbered)</h3>
                  <pre className="rounded-md border p-3 text-xs whitespace-pre-wrap">{numberSentences(data.assistantMessage?.content || "")}</pre>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">2) Retrieval Evidence</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <div>Chunks: {data.retrieval?.chunksReturnedCount ?? 0}</div>
                  <div>Sources: {data.retrieval?.sourcesReturnedCount ?? 0}</div>
                  <div>Top similarity: {(data.retrieval?.topSimilarity ?? 0).toFixed(3)}</div>
                  <div>Retrieval latency: {Math.round(data.retrieval?.retrievalLatencyMs ?? 0)}ms</div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Chunk ID</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Snippet</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data.retrieval?.retrievedChunksJson || []).map((chunk) => (
                      <TableRow key={`${chunk.sourceId}:${chunk.chunkId}`}>
                        <TableCell className="font-mono text-xs">{chunk.chunkId}</TableCell>
                        <TableCell className="font-mono text-xs">{chunk.sourceId}</TableCell>
                        <TableCell>{(chunk.score ?? 0).toFixed(3)}</TableCell>
                        <TableCell className="text-sm">{chunk.snippet || ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">3) Citations Mapping</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div>Coverage: {((data.citation?.citationCoverageRate ?? 0) * 100).toFixed(1)}%</div>
                  <div>Integrity: {((data.citation?.citationIntegrityRate ?? 0) * 100).toFixed(1)}%</div>
                  <div>Misattribution: {((data.citation?.citationMisattributionRate ?? 0) * 100).toFixed(1)}%</div>
                </div>
                <div className="text-sm">
                  Repair applied: <Badge variant={data.citation?.repairApplied ? "secondary" : "outline"}>{data.citation?.repairApplied ? "yes" : "no"}</Badge>
                </div>
                <pre className="rounded-md border p-3 text-xs whitespace-pre-wrap">{JSON.stringify(data.citation?.repairNotesJson ?? {}, null, 2)}</pre>
              </CardContent>
            </Card>

            {data.deterministicChecks ? (
              <Card>
                <CardHeader><CardTitle className="text-base">3b) Deterministic checks</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>Abstention (zero-chunk guard): <Badge variant={data.deterministicChecks.abstentionPass ? "secondary" : "destructive"}>{data.deterministicChecks.abstentionPass ? "pass" : "fail"}</Badge></div>
                  <div>Owner in cited source: <Badge variant={data.deterministicChecks.ownerCitationPass ? "secondary" : "destructive"}>{data.deterministicChecks.ownerCitationPass ? "pass" : "fail"}</Badge></div>
                  <div>Deadline in cited source: <Badge variant={data.deterministicChecks.deadlineCitationPass ? "secondary" : "destructive"}>{data.deterministicChecks.deadlineCitationPass ? "pass" : "fail"}</Badge></div>
                  <div>Retrieval recall @K: <Badge variant={data.deterministicChecks.retrievalRecallPass ? "secondary" : "destructive"}>{data.deterministicChecks.retrievalRecallPass ? "pass" : "fail"}</Badge></div>
                  {(data.deterministicChecks.failedChecks?.length ?? 0) > 0 && (
                    <div className="md:col-span-2 text-muted-foreground">Failed: {data.deterministicChecks.failedChecks!.join(", ")}</div>
                  )}
                </CardContent>
              </Card>
            ) : null}

            {data.eval ? (
              <>
                <Card>
                  <CardHeader><CardTitle className="text-base">4) Claim-based Grounding</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div>Grounded claim rate: {((data.eval?.groundedClaimRate ?? 0) * 100).toFixed(1)}%</div>
                      <div>Unsupported claim rate: {((data.eval?.unsupportedClaimRate ?? 0) * 100).toFixed(1)}%</div>
                      <div>Contradiction rate: {((data.eval?.contradictionRate ?? 0) * 100).toFixed(1)}%</div>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Claim</TableHead>
                          <TableHead>Label</TableHead>
                          <TableHead>Supporting Chunks</TableHead>
                          <TableHead>Rationale</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(data.eval?.claimLabelsJson || []).map((row, idx) => (
                          <TableRow key={`${idx}-${row.claim}`}>
                            <TableCell>{row.claim}</TableCell>
                            <TableCell>
                              <Badge variant={row.label === "entailed" ? "secondary" : "destructive"}>{row.label}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{(row.supportingChunkIds || []).join(", ") || "n/a"}</TableCell>
                            <TableCell className="text-sm">{row.rationale || ""}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">5) Other Quality Signals</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div>Answer relevance: {((data.eval?.answerRelevanceScore ?? 0) * 100).toFixed(1)}%</div>
                    <div>Completeness: {((data.eval?.completenessScore ?? 0) * 100).toFixed(1)}%</div>
                    <div>Context relevance: {((data.eval?.contextRelevanceScore ?? 0) * 100).toFixed(1)}%</div>
                    <div>Context recall: {((data.eval?.contextRecallScore ?? 0) * 100).toFixed(1)}%</div>
                    <div>Format compliance: {((data.eval?.formatValidRate ?? 0) * 100).toFixed(1)}%</div>
                    <div>
                      Low-evidence calibration:{" "}
                      <Badge variant={data.eval?.lowEvidenceCalibrationJson?.pass ? "secondary" : "destructive"}>
                        {data.eval?.lowEvidenceCalibrationJson?.pass ? "pass" : "fail"}
                      </Badge>
                    </div>
                    <div className="md:col-span-3">Rationale: {data.eval?.lowEvidenceCalibrationJson?.rationale || "n/a"}</div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardHeader><CardTitle className="text-base">4) Claim-based Grounding</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">No evals for this reply yet.</p>
                  {isDev && (
                    <Button
                      variant="outline"
                      onClick={() => runReplyEvalMutation.mutate()}
                      disabled={runReplyEvalMutation.isPending}
                    >
                      Run eval on this reply
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle className="text-base">6) Tool Calls</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div>Retry count: {data.tool?.retryCount ?? 0}</div>
                  <div>Idempotency key: {data.tool?.idempotencyKey || "n/a"}</div>
                  <div>Duplicate action: {data.tool?.duplicateActionDetected ? "yes" : "no"}</div>
                </div>
                <pre className="rounded-md border p-3 text-xs whitespace-pre-wrap">{JSON.stringify(data.tool?.toolCallsJson ?? [], null, 2)}</pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">7) Observability Links</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">Trace ID: <span className="font-mono">{data.observability?.traceId || "n/a"}</span></div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Span</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Started</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data.observability?.spans || []).map((span, idx) => (
                      <TableRow key={`${span.name}-${idx}`}>
                        <TableCell>{span.name}</TableCell>
                        <TableCell>{span.kind}</TableCell>
                        <TableCell>{Math.round(span.durationMs ?? 0)}ms</TableCell>
                        <TableCell>{span.startedAt ? new Date(span.startedAt).toLocaleString() : "n/a"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">8) Enterprise Eval Pack</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {!data.enterpriseEval ? (
                  <div className="text-sm text-muted-foreground">No enterprise eval artifact yet.</div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Badge variant={data.enterpriseEval.overallPass ? "secondary" : "destructive"}>
                        {data.enterpriseEval.overallPass ? "PASS" : "FAIL"}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        Composite score: {(((data.enterpriseEval.overallScore ?? 0) * 100).toFixed(1))}%
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                      <div>Evidence coverage: {((data.enterpriseEval.evidenceCoverageScore ?? 0) * 100).toFixed(1)}%</div>
                      <div>Clarity: {((data.enterpriseEval.clarityScore ?? 0) * 100).toFixed(1)}%</div>
                      <div>PII guard: {data.enterpriseEval.piiLeakPass ? "pass" : "fail"}</div>
                      <div>Citation UI readiness: {((data.enterpriseEval.citationUiReadinessScore ?? 0) * 100).toFixed(1)}%</div>
                    </div>
                    <pre className="rounded-md border p-3 text-xs whitespace-pre-wrap">
                      {JSON.stringify(data.enterpriseEval.summaryJson ?? {}, null, 2)}
                    </pre>
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
