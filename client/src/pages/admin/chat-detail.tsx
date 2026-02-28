import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";

type ChatDetailResponse = {
  chat: {
    id: string;
    model?: string;
    environment?: string;
    appVersion?: string;
    gitSha?: string;
    modelConfigJson?: Record<string, unknown>;
    retrievalConfigJson?: Record<string, unknown>;
    createdAt: string;
  };
  messages: Array<{ id: string; role: string; content: string; createdAt: string }>;
  replies: Array<{
    reply: {
      id: string;
      messageId: string;
      createdAt: string;
      latencyMs?: number;
      ttftMs?: number;
      tokensIn?: number;
      tokensOut?: number;
      costUsd?: number;
      status: "ok" | "error";
      traceId?: string;
    };
    retrieval?: { chunksReturnedCount?: number; sourcesReturnedCount?: number; topSimilarity?: number };
    citation?: { citationIntegrityRate?: number };
    eval?: {
      groundedClaimRate?: number;
      unsupportedClaimRate?: number;
      answerRelevanceScore?: number;
      completenessScore?: number;
      lowEvidenceCalibrationJson?: { pass?: boolean; rationale?: string };
    };
    tool?: { toolCallsJson?: unknown[] };
  }>;
  aggregates?: {
    latencyMs?: { avg: number; min: number; max: number; p50: number; p95: number };
    tokens?: { avg: number; min: number; max: number; p50: number; p95: number };
    unsupportedClaimRate?: { avg: number; min: number; max: number; p50: number; p95: number };
  };
  worstReplies?: {
    highestUnsupported?: string | null;
    lowestCitationIntegrity?: string | null;
    highestLatency?: string | null;
  };
};

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

export default function AdminChatDetailPage() {
  const [, params] = useRoute("/admin/chats/:chatId");
  const chatId = params?.chatId;
  const isDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const [selectedReplyForEval, setSelectedReplyForEval] = useState<string | null>(null);

  const { data, isLoading } = useQuery<ChatDetailResponse>({
    queryKey: [`/api/admin/chats/${chatId}`],
    enabled: Boolean(chatId),
  });

  const runReplyEvalMutation = useMutation({
    mutationFn: async (replyId: string) => {
      const response = await apiRequest("POST", `/api/admin/replies/${replyId}/score`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/chats/${chatId}`] });
    },
  });

  const replyEvalQuery = useQuery<any>({
    queryKey: [selectedReplyForEval ? `/api/admin/replies/${selectedReplyForEval}/eval` : ""],
    enabled: Boolean(selectedReplyForEval),
  });

  return (
    <Layout title="Chat Detail">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Chat Detail</h1>
            <p className="text-muted-foreground text-sm font-mono">{chatId}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/admin/chats">Back to Chats</Link>
            </Button>
          </div>
        </div>

        {isLoading || !data ? (
          <Card><CardContent className="py-8 text-sm text-muted-foreground">Loading chat detail...</CardContent></Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Model:</span> {data.chat.model || "n/a"}</div>
                  <div><span className="text-muted-foreground">Environment:</span> {data.chat.environment || "n/a"}</div>
                  <div><span className="text-muted-foreground">Created:</span> {new Date(data.chat.createdAt).toLocaleString()}</div>
                  <div><span className="text-muted-foreground">App Version:</span> {data.chat.appVersion || "n/a"}</div>
                  <div><span className="text-muted-foreground">Git SHA:</span> {data.chat.gitSha || "n/a"}</div>
                </div>
                {data.replies.some((r) => r.reply.traceId) && (
                  <div className="text-sm text-muted-foreground">
                    Trace links: {data.replies.filter((r) => r.reply.traceId).map((r) => (
                      <span key={r.reply.id} className="mr-3 font-mono">{r.reply.traceId?.slice(0, 8)}...</span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Aggregates</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <StatPill
                  label="Latency (avg / min / max / p50 / p95)"
                  value={`${Math.round(data.aggregates?.latencyMs?.avg || 0)} / ${Math.round(data.aggregates?.latencyMs?.min || 0)} / ${Math.round(data.aggregates?.latencyMs?.max || 0)} / ${Math.round(data.aggregates?.latencyMs?.p50 || 0)} / ${Math.round(data.aggregates?.latencyMs?.p95 || 0)} ms`}
                />
                <StatPill
                  label="Tokens (avg / min / max / p50 / p95)"
                  value={`${Math.round(data.aggregates?.tokens?.avg || 0)} / ${Math.round(data.aggregates?.tokens?.min || 0)} / ${Math.round(data.aggregates?.tokens?.max || 0)} / ${Math.round(data.aggregates?.tokens?.p50 || 0)} / ${Math.round(data.aggregates?.tokens?.p95 || 0)}`}
                />
                <StatPill
                  label="Unsupported Rate (avg / min / max / p50 / p95)"
                  value={`${((data.aggregates?.unsupportedClaimRate?.avg || 0) * 100).toFixed(1)} / ${((data.aggregates?.unsupportedClaimRate?.min || 0) * 100).toFixed(1)} / ${((data.aggregates?.unsupportedClaimRate?.max || 0) * 100).toFixed(1)} / ${((data.aggregates?.unsupportedClaimRate?.p50 || 0) * 100).toFixed(1)} / ${((data.aggregates?.unsupportedClaimRate?.p95 || 0) * 100).toFixed(1)} %`}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Worst Reply Shortcuts</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {data.worstReplies?.highestUnsupported && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/chats/${chatId}/replies/${data.worstReplies.highestUnsupported}`}>Highest Unsupported</Link>
                  </Button>
                )}
                {data.worstReplies?.lowestCitationIntegrity && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/chats/${chatId}/replies/${data.worstReplies.lowestCitationIntegrity}`}>Lowest Citation Integrity</Link>
                  </Button>
                )}
                {data.worstReplies?.highestLatency && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/chats/${chatId}/replies/${data.worstReplies.highestLatency}`}>Highest Latency</Link>
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Conversation Timeline</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {data.messages.map((msg) => {
                  const relatedReply = data.replies.find((r) => msg.role === "assistant" && r.reply.messageId === msg.id);
                  return (
                    <div key={msg.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={msg.role === "assistant" ? "default" : "secondary"}>{msg.role}</Badge>
                          <span className="text-xs text-muted-foreground">{new Date(msg.createdAt).toLocaleString()}</span>
                        </div>
                        {msg.role === "assistant" && (() => {
                          const replyId = data.replies.find((r) => r.reply.messageId === msg.id)?.reply.id || data.replies[0]?.reply.id;
                          return replyId ? (
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/admin/chats/${chatId}/replies/${replyId}`}>
                                View Reply Details
                              </Link>
                            </Button>
                          ) : null;
                        })()}
                      </div>
                      <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                      {msg.role === "assistant" && relatedReply && (
                        <>
                          <Separator className="my-3" />
                          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-xs">
                            <StatPill label="Latency / TTFT" value={`${Math.round(relatedReply.reply.latencyMs || 0)}ms / ${Math.round(relatedReply.reply.ttftMs || 0)}ms`} />
                            <StatPill label="Tokens / Cost" value={`${(relatedReply.reply.tokensIn || 0) + (relatedReply.reply.tokensOut || 0)} / $${(relatedReply.reply.costUsd || 0).toFixed(4)}`} />
                            <StatPill label="Retrieval" value={`${relatedReply.retrieval?.chunksReturnedCount || 0} chunks, ${relatedReply.retrieval?.sourcesReturnedCount || 0} sources`} />
                            <StatPill label="Grounding" value={relatedReply.eval?.groundedClaimRate != null ? `${((relatedReply.eval.groundedClaimRate || 0) * 100).toFixed(1)}% grounded` : "n/a"} />
                            <StatPill label="Citation Integrity" value={`${((relatedReply.citation?.citationIntegrityRate || 0) * 100).toFixed(1)}%`} />
                          </div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {(relatedReply.eval?.unsupportedClaimRate || 0) > 0.2 && <Badge variant="destructive">hallucination risk</Badge>}
                            {(relatedReply.citation?.citationIntegrityRate || 1) < 0.8 && <Badge variant="destructive">citation mismatch</Badge>}
                            {((relatedReply.eval as any)?.contextRelevanceScore || 1) < 0.7 && <Badge variant="secondary">low retrieval relevance</Badge>}
                            {(relatedReply as any).enterpriseEval?.piiLeakPass === false && <Badge variant="destructive">safety flagged</Badge>}
                            {relatedReply.eval?.lowEvidenceCalibrationJson && <Badge variant="secondary">low-evidence check</Badge>}
                            {(((relatedReply.tool?.toolCallsJson as any[]) || []).some((c: any) => c?.status === "failed" || c?.success === false)) && <Badge variant="destructive">tool failure</Badge>}
                            {relatedReply.reply.traceId && (
                              <Button variant="ghost" size="sm" className="h-auto px-1 py-0 underline" asChild>
                                <Link href={`/admin/observability?traceId=${relatedReply.reply.traceId}`}>Trace {relatedReply.reply.traceId.slice(0, 8)}...</Link>
                              </Button>
                            )}
                          </div>
                          <div className="mt-3 rounded-md border p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-medium">Evals</div>
                              {relatedReply.eval?.unsupportedClaimRate != null && relatedReply.eval?.groundedClaimRate != null && (
                                <Badge
                                  variant={
                                    relatedReply.eval.unsupportedClaimRate < 0.2 && relatedReply.eval.groundedClaimRate > 0.7
                                      ? "secondary"
                                      : "destructive"
                                  }
                                >
                                  {relatedReply.eval.unsupportedClaimRate < 0.2 && relatedReply.eval.groundedClaimRate > 0.7 ? "PASS" : "FAIL"}
                                </Badge>
                              )}
                            </div>
                            {relatedReply.eval?.unsupportedClaimRate != null || relatedReply.eval?.groundedClaimRate != null ? (
                              <div className="flex flex-wrap gap-2">
                                <Badge variant="outline">Grounded: {((relatedReply.eval?.groundedClaimRate || 0) * 100).toFixed(1)}%</Badge>
                                <Badge variant="outline">Unsupported: {((relatedReply.eval?.unsupportedClaimRate || 0) * 100).toFixed(1)}%</Badge>
                                <Badge variant="outline">Relevance: {((relatedReply.eval?.answerRelevanceScore || 0) * 100).toFixed(1)}%</Badge>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-muted-foreground">No evals for this reply yet.</span>
                                {isDev && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={runReplyEvalMutation.isPending}
                                    onClick={() => runReplyEvalMutation.mutate(relatedReply.reply.id)}
                                  >
                                    Run eval on this reply
                                  </Button>
                                )}
                              </div>
                            )}
                            <Button variant="ghost" size="sm" className="px-0 h-auto underline" asChild>
                              <Link href={`/admin/chats/${chatId}/replies/${relatedReply.reply.id}`}>See evals for this reply</Link>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedReplyForEval(relatedReply.reply.id)}
                            >
                              View eval details
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </>
        )}
      </div>
      <Dialog open={Boolean(selectedReplyForEval)} onOpenChange={(open) => !open && setSelectedReplyForEval(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reply Eval Explainability</DialogTitle>
          </DialogHeader>
          {replyEvalQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading eval details...</div>
          ) : !replyEvalQuery.data ? (
            <div className="text-sm text-muted-foreground">No eval artifact available for this reply yet.</div>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                <StatPill label="Grounding" value={`${Math.round((Number(replyEvalQuery.data?.metrics?.grounding ?? 0) * 100))}%`} />
                <StatPill label="Integrity" value={`${Math.round((Number(replyEvalQuery.data?.metrics?.citationIntegrity ?? 0) * 100))}%`} />
                <StatPill label="Relevance" value={`${Math.round((Number(replyEvalQuery.data?.metrics?.retrievalRelevance ?? 0) * 100))}%`} />
                <StatPill label="Safety" value={`${Math.round((Number(replyEvalQuery.data?.metrics?.safety ?? 0) * 100))}%`} />
                <StatPill label="Clarity" value={`${Math.round((Number(replyEvalQuery.data?.metrics?.clarity ?? 0) * 100))}%`} />
              </div>
              <div className="rounded-md border p-3">
                <div className="font-medium mb-2">Timing breakdown</div>
                <div className="text-muted-foreground">
                  retrieval {Math.round(Number(replyEvalQuery.data?.timings?.retrievalMs ?? 0))} ms, rerank {Math.round(Number(replyEvalQuery.data?.timings?.rerankMs ?? 0))} ms, generation {Math.round(Number(replyEvalQuery.data?.timings?.generationMs ?? 0))} ms, total {Math.round(Number(replyEvalQuery.data?.timings?.totalMs ?? 0))} ms
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="font-medium mb-2">Reasons</div>
                <div className="space-y-1 text-muted-foreground">
                  <div>Grounding: {replyEvalQuery.data?.reasons?.groundingReason || "N/A"}</div>
                  <div>Integrity: {replyEvalQuery.data?.reasons?.integrityReason || "N/A"}</div>
                  <div>Relevance: {replyEvalQuery.data?.reasons?.relevanceReason || "N/A"}</div>
                  <div>Safety: {replyEvalQuery.data?.reasons?.safetyReason || "N/A"}</div>
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="font-medium mb-2">Retrieved chunks</div>
                <div className="space-y-2">
                  {(replyEvalQuery.data?.retrievedChunks || []).slice(0, 8).map((chunk: any, idx: number) => (
                    <div key={`${chunk.chunkId || "chunk"}-${idx}`} className="border rounded p-2">
                      <div className="font-mono text-xs">{chunk.chunkId || "unknown"} ({chunk.sourceId || "source"}) score {Number(chunk.score || 0).toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground whitespace-pre-wrap">{chunk.text || chunk.snippet || "No snippet available."}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
