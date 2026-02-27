/**
 * Span tracking for chat request phases
 * Records timing and metadata for each phase of a chat request
 */

import { storage } from "../../storage";

export type SpanPhase =
  | "classifyPrompt"
  | "ensureConversation"
  | "retrieve"
  | "llm_call"
  | "stream"
  | "shape_response"
  | "eval_scoring";

export interface SpanContext {
  traceId: string;
  conversationId?: string;
  spans: Map<SpanPhase, SpanData>;
}

export interface SpanData {
  name: SpanPhase;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  metadata?: Record<string, any>;
  error?: string;
}

/**
 * Create a new span context for a request
 */
export function createSpanContext(traceId: string, conversationId?: string): SpanContext {
  return {
    traceId,
    conversationId,
    spans: new Map(),
  };
}

/**
 * Start a span for a phase
 */
export function startSpan(ctx: SpanContext, phase: SpanPhase, metadata?: Record<string, any>): void {
  ctx.spans.set(phase, {
    name: phase,
    startTime: Date.now(),
    metadata,
  });
}

/**
 * End a span for a phase
 */
export function endSpan(
  ctx: SpanContext,
  phase: SpanPhase,
  metadata?: Record<string, any>,
  error?: string
): SpanData | undefined {
  const span = ctx.spans.get(phase);
  if (!span) return undefined;

  span.endTime = Date.now();
  span.durationMs = span.endTime - span.startTime;
  if (metadata) {
    span.metadata = { ...span.metadata, ...metadata };
  }
  if (error) {
    span.error = error;
  }

  return span;
}

/**
 * Record TTFT (Time To First Token) for streaming
 */
export function recordTTFT(ctx: SpanContext, ttftMs: number): void {
  const streamSpan = ctx.spans.get("stream");
  if (streamSpan) {
    streamSpan.metadata = { ...streamSpan.metadata, ttftMs };
  }
}

/**
 * Record tokens streamed
 */
export function recordTokensStreamed(ctx: SpanContext, tokens: number): void {
  const streamSpan = ctx.spans.get("stream");
  if (streamSpan) {
    streamSpan.metadata = { ...streamSpan.metadata, tokensStreamed: tokens };
  }
}

/**
 * Record retrieval stats
 */
export function recordRetrievalStats(
  ctx: SpanContext,
  stats: {
    chunksReturned: number;
    sourcesReturned: number;
    dedupSourcesSaved: number;
    chunks?: any[];
  }
): void {
  const retrieveSpan = ctx.spans.get("retrieve");
  if (retrieveSpan) {
    retrieveSpan.metadata = { ...retrieveSpan.metadata, ...stats };
  }
}

/**
 * Get all spans as an array
 */
export function getSpans(ctx: SpanContext): SpanData[] {
  return Array.from(ctx.spans.values());
}

/**
 * Get total duration from first to last span
 */
export function getTotalDuration(ctx: SpanContext): number {
  const spans = Array.from(ctx.spans.values());
  if (spans.length === 0) return 0;

  const startTimes = spans.map(s => s.startTime);
  const endTimes = spans.filter(s => s.endTime).map(s => s.endTime!);

  if (endTimes.length === 0) return Date.now() - Math.min(...startTimes);

  return Math.max(...endTimes) - Math.min(...startTimes);
}

/**
 * Persist spans to database
 */
export async function persistSpans(ctx: SpanContext): Promise<void> {
  for (const span of ctx.spans.values()) {
    if (!span.endTime) {
      span.endTime = Date.now();
      span.durationMs = span.endTime - span.startTime;
    }

    try {
      await storage.createSpan({
        traceId: ctx.traceId,
        name: span.name,
        kind: "other",
        startedAt: new Date(span.startTime),
        finishedAt: new Date(span.endTime),
        durationMs: span.durationMs,
        status: span.error ? "failed" : "completed",
        metadataJson: span.metadata || {},
      });
    } catch (err) {
      console.error(`Failed to persist span ${span.name}:`, err);
    }
  }
}

/**
 * Helper to time an async function and record as span
 */
export async function withSpanTiming<T>(
  ctx: SpanContext,
  phase: SpanPhase,
  fn: () => Promise<T>,
  initialMetadata?: Record<string, any>
): Promise<T> {
  startSpan(ctx, phase, initialMetadata);
  try {
    const result = await fn();
    endSpan(ctx, phase);
    return result;
  } catch (err) {
    endSpan(ctx, phase, undefined, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
