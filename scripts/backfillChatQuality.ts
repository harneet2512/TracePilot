import { storage } from "../server/storage";
import { captureReplyArtifacts } from "../server/lib/scoring/replyScoringPipeline";

async function main() {
  const cutoff = process.env.CHAT_QUALITY_CUTOVER_DATE
    ? new Date(process.env.CHAT_QUALITY_CUTOVER_DATE)
    : new Date("2026-02-15T00:00:00.000Z");

  let page = 1;
  const pageSize = 100;
  let processed = 0;

  while (true) {
    const { rows } = await storage.getAdminConversations({ dateFrom: cutoff }, page, pageSize);
    if (!rows.length) break;

    for (const chat of rows) {
      const messages = await storage.getMessages(chat.id);
      for (const msg of messages) {
        if (msg.role !== "assistant") continue;
        const existing = await storage.getChatReplyByMessageId(msg.id);
        if (existing) continue;
        const metadata = (msg.metadataJson as any) || {};
        const citations = Array.isArray(msg.citationsJson) ? msg.citationsJson : [];
        await captureReplyArtifacts({
          chatId: chat.id,
          messageId: msg.id,
          answerText: msg.content,
          traceId: metadata?.debug?.traceId,
          streamed: false,
          latencyMs: metadata?.response?.meta?.latencyMs?.totalMs ?? 0,
          ttftMs: metadata?.response?.meta?.latencyMs?.ttftMs ?? 0,
          tokensOut: metadata?.tokenUsage?.total ?? 0,
          citations: citations as any,
          retrieval: {
            mode: metadata?.debug?.usedFallback ? "hybrid_fallback" : "hybrid",
            topK: metadata?.debug?.retrievedCount ?? 0,
            chunksReturnedCount: citations.length,
            sourcesReturnedCount: new Set(citations.map((c: any) => c.sourceId)).size,
            topSimilarity: Math.max(0, ...citations.map((c: any) => Number(c.score) || 0)),
            retrievalLatencyMs: metadata?.response?.meta?.latencyMs?.retrievalMs ?? 0,
            retrievedChunks: citations.map((c: any) => ({
              chunkId: c.chunkId,
              sourceId: c.sourceId,
              title: c.title,
              snippet: c.snippet,
              score: c.score,
              url: c.url,
            })),
            dedupStats: { mode: "backfill" },
          },
        });
        processed++;
      }
    }
    page++;
  }

  console.log(`Backfill complete. Cutover=${cutoff.toISOString()} processedReplies=${processed}`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
