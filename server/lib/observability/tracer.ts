import { v4 as uuidv4 } from "uuid";
import { storage } from "../../storage";
import type { InsertTrace, InsertSpan, Trace, Span } from "@shared/schema";

export interface TraceContext {
  traceId: string;
  requestId: string;
  userId?: string;
  kind: "chat" | "action" | "sync" | "eval" | "playbook";
  parentSpanId?: string;
}

export type SpanKind = "embed" | "retrieve" | "llm" | "tool" | "chunk" | "validate" | "other";

export interface SpanData {
  name: string;
  kind: SpanKind;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  retrievalCount?: number;
  similarityMin?: number;
  similarityMax?: number;
  similarityAvg?: number;
  metadata?: Record<string, unknown>;
}

class Tracer {
  private currentTrace: TraceContext | null = null;
  private activeSpans: Map<string, { startTime: number; data: SpanData }> = new Map();
  
  async startTrace(
    kind: TraceContext["kind"],
    userId?: string,
    requestId?: string
  ): Promise<TraceContext> {
    const reqId = requestId || uuidv4();
    
    const trace: InsertTrace = {
      requestId: reqId,
      kind,
      userId: userId || null,
      status: "running",
      startedAt: new Date(),
    };
    
    const created = await storage.createTrace(trace);
    
    this.currentTrace = { traceId: created.id, requestId: reqId, userId, kind };
    return this.currentTrace;
  }
  
  async endTrace(traceId: string, status: "completed" | "failed" = "completed", errorMessage?: string) {
    const now = new Date();
    
    const trace = await storage.getTrace(traceId);
    const durationMs = trace?.startedAt ? now.getTime() - new Date(trace.startedAt).getTime() : undefined;
    
    await storage.updateTrace(traceId, {
      status,
      finishedAt: now,
      durationMs,
      error: errorMessage || null,
    });
    
    if (this.currentTrace?.traceId === traceId) {
      this.currentTrace = null;
    }
  }
  
  async startSpan(traceId: string, data: SpanData, parentSpanId?: string): Promise<string> {
    const startTime = Date.now();
    
    const span: InsertSpan = {
      traceId,
      parentSpanId: parentSpanId || null,
      name: data.name,
      kind: data.kind,
      status: "running",
      startedAt: new Date(startTime),
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      model: data.model,
      retrievalCount: data.retrievalCount,
      similarityMin: data.similarityMin,
      similarityMax: data.similarityMax,
      similarityAvg: data.similarityAvg,
      metadataJson: data.metadata || null,
    };
    
    const created = await storage.createSpan(span);
    this.activeSpans.set(created.id, { startTime, data });
    
    return created.id;
  }
  
  async endSpan(
    spanId: string,
    status: "completed" | "failed" = "completed",
    updates?: Partial<SpanData>,
    error?: string
  ) {
    const spanInfo = this.activeSpans.get(spanId);
    const now = Date.now();
    const durationMs = spanInfo ? now - spanInfo.startTime : undefined;
    
    const spanUpdates: Partial<InsertSpan> = {
      status,
      finishedAt: new Date(now),
      durationMs,
      error: error || null,
    };
    
    if (updates) {
      if (updates.inputTokens !== undefined) spanUpdates.inputTokens = updates.inputTokens;
      if (updates.outputTokens !== undefined) spanUpdates.outputTokens = updates.outputTokens;
      if (updates.model !== undefined) spanUpdates.model = updates.model;
      if (updates.retrievalCount !== undefined) spanUpdates.retrievalCount = updates.retrievalCount;
      if (updates.similarityMin !== undefined) spanUpdates.similarityMin = updates.similarityMin;
      if (updates.similarityMax !== undefined) spanUpdates.similarityMax = updates.similarityMax;
      if (updates.similarityAvg !== undefined) spanUpdates.similarityAvg = updates.similarityAvg;
      if (updates.metadata !== undefined) spanUpdates.metadataJson = updates.metadata;
    }
    
    await storage.updateSpan(spanId, spanUpdates);
    this.activeSpans.delete(spanId);
  }
  
  async recordSpan(
    traceId: string,
    data: SpanData & { durationMs: number },
    status: "completed" | "failed" = "completed",
    parentSpanId?: string,
    error?: string
  ): Promise<string> {
    const now = new Date();
    
    const span: InsertSpan = {
      traceId,
      parentSpanId: parentSpanId || null,
      name: data.name,
      kind: data.kind,
      status,
      startedAt: new Date(now.getTime() - data.durationMs),
      finishedAt: now,
      durationMs: data.durationMs,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      model: data.model,
      retrievalCount: data.retrievalCount,
      similarityMin: data.similarityMin,
      similarityMax: data.similarityMax,
      similarityAvg: data.similarityAvg,
      error: error || null,
      metadataJson: data.metadata || null,
    };
    
    const created = await storage.createSpan(span);
    return created.id;
  }
  
  getCurrentTrace(): TraceContext | null {
    return this.currentTrace;
  }
}

export const tracer = new Tracer();

export async function withTrace<T>(
  kind: TraceContext["kind"],
  userId: string | undefined,
  fn: (ctx: TraceContext) => Promise<T>,
  requestId?: string
): Promise<T> {
  const ctx = await tracer.startTrace(kind, userId, requestId);
  
  try {
    const result = await fn(ctx);
    await tracer.endTrace(ctx.traceId, "completed");
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await tracer.endTrace(ctx.traceId, "failed", message);
    throw error;
  }
}

export async function withSpan<T>(
  traceId: string,
  data: SpanData,
  fn: () => Promise<T>,
  parentSpanId?: string
): Promise<T> {
  const spanId = await tracer.startSpan(traceId, data, parentSpanId);
  
  try {
    const result = await fn();
    await tracer.endSpan(spanId, "completed");
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await tracer.endSpan(spanId, "failed", undefined, message);
    throw error;
  }
}
