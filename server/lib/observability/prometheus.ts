/**
 * Prometheus metrics for enterprise-grade observability
 * Exports histogram buckets for TTFT, retrieval, and RAG metrics
 */

import { Registry, Histogram, Counter, collectDefaultMetrics } from "prom-client";

// Create a new registry
export const registry = new Registry();

// Collect default Node.js metrics (memory, CPU, etc.)
collectDefaultMetrics({ register: registry });

// ============================================
// Chat / Streaming Metrics
// ============================================

export const chatTTFTSeconds = new Histogram({
  name: "chat_ttft_seconds",
  help: "Time to first token in chat streaming responses",
  buckets: [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10],
  registers: [registry],
});

export const chatTotalDurationSeconds = new Histogram({
  name: "chat_total_duration_seconds",
  help: "Total duration of chat requests from start to finish",
  buckets: [0.5, 1, 2, 3, 5, 10, 15, 30, 60],
  registers: [registry],
});

// ============================================
// RAG / Retrieval Metrics
// ============================================

export const ragRetrievalDurationSeconds = new Histogram({
  name: "rag_retrieval_duration_seconds",
  help: "Duration of RAG retrieval phase (vector search + fallback)",
  buckets: [0.05, 0.1, 0.25, 0.5, 0.75, 1, 2, 5],
  registers: [registry],
});

export const ragChunksReturned = new Histogram({
  name: "rag_chunks_returned",
  help: "Number of chunks returned by retrieval",
  buckets: [0, 1, 2, 3, 5, 8, 10, 15, 20, 30],
  registers: [registry],
});

export const ragSourcesReturned = new Histogram({
  name: "rag_sources_returned",
  help: "Number of unique sources returned by retrieval",
  buckets: [0, 1, 2, 3, 4, 5, 6, 8, 10],
  registers: [registry],
});

export const ragTopSimilarity = new Histogram({
  name: "rag_top_similarity",
  help: "Top similarity score from retrieval (0-1)",
  buckets: [0.3, 0.4, 0.5, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95],
  registers: [registry],
});

export const ragDedupSourcesSaved = new Histogram({
  name: "rag_dedup_sources_saved",
  help: "Number of duplicate sources removed during deduplication",
  buckets: [0, 1, 2, 3, 5, 10],
  registers: [registry],
});

// ============================================
// LLM Metrics
// ============================================

export const llmDurationSeconds = new Histogram({
  name: "llm_duration_seconds",
  help: "Duration of LLM API calls",
  buckets: [0.5, 1, 2, 3, 5, 10, 15, 30],
  registers: [registry],
});

export const llmTokensInput = new Counter({
  name: "llm_tokens_input_total",
  help: "Total input tokens sent to LLM",
  registers: [registry],
});

export const llmTokensOutput = new Counter({
  name: "llm_tokens_output_total",
  help: "Total output tokens received from LLM",
  registers: [registry],
});

// ============================================
// HTTP Metrics
// ============================================

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["route", "method", "status"],
  registers: [registry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration",
  labelNames: ["route", "method", "status"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

// ============================================
// Error Metrics
// ============================================

export const errorsTotal = new Counter({
  name: "errors_total",
  help: "Total errors by type",
  labelNames: ["type"],
  registers: [registry],
});

// ============================================
// Grounding / Eval Metrics
// ============================================

export const groundingRate = new Histogram({
  name: "grounding_rate",
  help: "Rate of grounded claims per response (0-1)",
  buckets: [0, 0.5, 0.7, 0.8, 0.9, 0.95, 1.0],
  registers: [registry],
});

// ============================================
// Helper to get metrics in Prometheus format
// ============================================

export async function getMetrics(): Promise<string> {
  return registry.metrics();
}

export function getContentType(): string {
  return registry.contentType;
}
