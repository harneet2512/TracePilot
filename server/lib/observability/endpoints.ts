// Enhanced observability endpoints with full metrics
import { Request, Response } from "express";
import { storage } from "../../storage";
import { db as _db } from "../../db";
const db = _db as any;
import { traces, spans, sources, chunks, auditEvents } from "@shared/schema";
import { and, eq, gte, lte, desc, sql } from "drizzle-orm";

export async function getObservabilityChat(req: Request, res: Response) {
    try {
        const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 24 * 60 * 60 * 1000);
        const to = req.query.to ? new Date(req.query.to as string) : new Date();

        const chatTraces = await db
            .select()
            .from(traces)
            .where(and(
                eq(traces.kind, "chat"),
                gte(traces.createdAt, from),
                lte(traces.createdAt, to)
            ))
            .orderBy(desc(traces.createdAt))
            .limit(1000);

        // Get spans for these traces to calculate token usage
        const traceIds = chatTraces.map((t: any) => t.id);
        const chatSpans = traceIds.length > 0 ? await db
            .select()
            .from(spans)
            .where(sql`${spans.traceId} = ANY(${traceIds})`)
            .limit(10000) : [];

        const totalChats = chatTraces.length;
        const successfulChats = chatTraces.filter((t: any) => t.status === "completed").length;
        const durations = chatTraces.filter((t: any) => t.durationMs).map((t: any) => t.durationMs!);

        const avgDurationMs = durations.length > 0
            ? Math.round(durations.reduce((a: any, b: any) => a + b, 0) / durations.length)
            : 0;

        durations.sort((a: any, b: any) => a - b);
        const p95DurationMs = durations[Math.floor(durations.length * 0.95)] || 0;

        // Calculate token usage and cost
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        for (const span of chatSpans) {
            totalInputTokens += span.inputTokens || 0;
            totalOutputTokens += span.outputTokens || 0;
        }
        const avgTokensPerChat = totalChats > 0 ? Math.round((totalInputTokens + totalOutputTokens) / totalChats) : 0;
        // Approximate cost: $0.01 per 1K input tokens, $0.03 per 1K output tokens (GPT-4 pricing)
        const totalCost = (totalInputTokens / 1000) * 0.01 + (totalOutputTokens / 1000) * 0.03;
        const avgCostPerChat = totalChats > 0 ? totalCost / totalChats : 0;

        // Group by hour for timeseries
        const byHour: Record<string, { count: number; avgDuration: number; errors: number }> = {};
        for (const trace of chatTraces) {
            const hour = new Date(trace.createdAt).toISOString().slice(0, 13);
            if (!byHour[hour]) {
                byHour[hour] = { count: 0, avgDuration: 0, errors: 0 };
            }
            byHour[hour].count++;
            if (trace.durationMs) {
                byHour[hour].avgDuration += trace.durationMs;
            }
            if (trace.status === "failed") {
                byHour[hour].errors++;
            }
        }

        for (const hour in byHour) {
            if (byHour[hour].count > 0) {
                byHour[hour].avgDuration = Math.round(byHour[hour].avgDuration / byHour[hour].count);
            }
        }

        res.json({
            kpis: {
                totalChats,
                successRate: totalChats > 0 ? (successfulChats / totalChats) * 100 : 0,
                avgDurationMs,
                p95DurationMs,
                avgTokensPerChat,
                totalCost: Math.round(totalCost * 100) / 100,
                avgCostPerChat: Math.round(avgCostPerChat * 10000) / 10000,
            },
            timeseries: Object.entries(byHour).map(([hour, data]) => ({
                hour,
                count: data.count,
                avgDuration: data.avgDuration,
                errors: data.errors,
            })).sort((a, b) => a.hour.localeCompare(b.hour)),
            topErrors: chatTraces
                .filter((t: any) => t.error)
                .slice(0, 10)
                .map((t: any) => ({ error: t.error, count: 1 })),
        });
    } catch (error) {
        console.error("Get observability chat error:", error);
        res.status(500).json({ error: "Failed to get chat metrics" });
    }
}

export async function getObservabilityRetrieval(req: Request, res: Response) {
    try {
        const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 24 * 60 * 60 * 1000);
        const to = req.query.to ? new Date(req.query.to as string) : new Date();
        const connector = req.query.connector as string | undefined;

        const retrievalSpans = await db
            .select()
            .from(spans)
            .where(and(
                eq(spans.kind, "retrieve"),
                gte(spans.createdAt, from),
                lte(spans.createdAt, to)
            ))
            .orderBy(desc(spans.createdAt))
            .limit(1000);

        const totalRetrievals = retrievalSpans.length;
        const avgChunksRetrieved = retrievalSpans.length > 0
            ? Math.round(retrievalSpans.reduce((sum: any, s: any) => sum + (s.retrievalCount || 0), 0) / retrievalSpans.length)
            : 0;

        const durations = retrievalSpans.filter((s: any) => s.durationMs).map((s: any) => s.durationMs!);
        const avgDurationMs = durations.length > 0
            ? Math.round(durations.reduce((a: any, b: any) => a + b, 0) / durations.length)
            : 0;

        const similarities = retrievalSpans
            .filter((s: any) => s.similarityMin !== null && s.similarityMin !== undefined)
            .map((s: any) => s.similarityMin!);
        const avgSimilarity = similarities.length > 0
            ? similarities.reduce((a: any, b: any) => a + b, 0) / similarities.length
            : 0;

        // Group by hour
        const byHour: Record<string, { count: number; avgChunks: number; avgSimilarity: number }> = {};
        for (const span of retrievalSpans) {
            const hour = new Date(span.createdAt).toISOString().slice(0, 13);
            if (!byHour[hour]) {
                byHour[hour] = { count: 0, avgChunks: 0, avgSimilarity: 0 };
            }
            byHour[hour].count++;
            byHour[hour].avgChunks += span.retrievalCount || 0;
            byHour[hour].avgSimilarity += span.similarityMin || 0;
        }

        for (const hour in byHour) {
            if (byHour[hour].count > 0) {
                byHour[hour].avgChunks = Math.round(byHour[hour].avgChunks / byHour[hour].count);
                byHour[hour].avgSimilarity = Math.round((byHour[hour].avgSimilarity / byHour[hour].count) * 100) / 100;
            }
        }

        res.json({
            kpis: {
                totalRetrievals,
                avgChunksRetrieved,
                avgDurationMs,
                avgSimilarity: Math.round(avgSimilarity * 100) / 100,
            },
            timeseries: Object.entries(byHour).map(([hour, data]) => ({
                hour,
                count: data.count,
                avgChunks: data.avgChunks,
                avgSimilarity: data.avgSimilarity,
            })).sort((a, b) => a.hour.localeCompare(b.hour)),
        });
    } catch (error) {
        console.error("Get observability retrieval error:", error);
        res.status(500).json({ error: "Failed to get retrieval metrics" });
    }
}

export async function getObservabilityCitations(req: Request, res: Response) {
    try {
        const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 24 * 60 * 60 * 1000);
        const to = req.query.to ? new Date(req.query.to as string) : new Date();

        const chatTraces = await db
            .select()
            .from(traces)
            .where(and(
                eq(traces.kind, "chat"),
                gte(traces.createdAt, from),
                lte(traces.createdAt, to)
            ))
            .limit(1000);

        let totalCitations = 0;
        let citationsWithUrl = 0;
        let citationsWithValidChunk = 0;

        for (const trace of chatTraces) {
            const metadata = trace.metadataJson as any;
            if (metadata?.citations) {
                for (const citation of metadata.citations) {
                    totalCitations++;
                    if (citation.url) {
                        citationsWithUrl++;
                    }
                    if (citation.chunkId) {
                        const chunk = await storage.getChunk(citation.chunkId);
                        if (chunk && chunk.workspaceId === trace.workspaceId) {
                            citationsWithValidChunk++;
                        }
                    }
                }
            }
        }

        const citationIntegrityRate = totalCitations > 0
            ? (citationsWithValidChunk / totalCitations) * 100
            : 0;

        const urlCoverageRate = totalCitations > 0
            ? (citationsWithUrl / totalCitations) * 100
            : 0;

        res.json({
            kpis: {
                totalCitations,
                citationIntegrityRate: Math.round(citationIntegrityRate * 100) / 100,
                urlCoverageRate: Math.round(urlCoverageRate * 100) / 100,
                avgCitationsPerChat: chatTraces.length > 0 ? Math.round((totalCitations / chatTraces.length) * 100) / 100 : 0,
            },
            timeseries: [],
        });
    } catch (error) {
        console.error("Get observability citations error:", error);
        res.status(500).json({ error: "Failed to get citation metrics" });
    }
}

export async function getObservabilitySync(req: Request, res: Response) {
    try {
        const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 24 * 60 * 60 * 1000);
        const to = req.query.to ? new Date(req.query.to as string) : new Date();
        const connector = req.query.connector as string | undefined;

        const syncEvents = await db
            .select()
            .from(auditEvents)
            .where(and(
                eq(auditEvents.kind, "sync"),
                gte(auditEvents.createdAt, from),
                lte(auditEvents.createdAt, to)
            ))
            .orderBy(desc(auditEvents.createdAt))
            .limit(1000);

        const totalSyncs = syncEvents.length;
        const successfulSyncs = syncEvents.filter((e: any) => e.success).length;
        const errorRate24h = totalSyncs > 0 ? ((totalSyncs - successfulSyncs) / totalSyncs) * 100 : 0;

        const sourcesByType: Record<string, number> = {};
        const allSources = await db.select().from(sources);

        for (const source of allSources) {
            sourcesByType[source.type] = (sourcesByType[source.type] || 0) + 1;
        }

        // Group by hour
        const byHour: Record<string, { syncs: number; errors: number }> = {};
        for (const event of syncEvents) {
            const hour = new Date(event.createdAt).toISOString().slice(0, 13);
            if (!byHour[hour]) {
                byHour[hour] = { syncs: 0, errors: 0 };
            }
            byHour[hour].syncs++;
            if (!event.success) {
                byHour[hour].errors++;
            }
        }

        res.json({
            kpis: {
                totalSyncs,
                successRate: totalSyncs > 0 ? (successfulSyncs / totalSyncs) * 100 : 0,
                errorRate24h,
                sourcesByType,
            },
            timeseries: Object.entries(byHour).map(([hour, data]) => ({
                hour,
                syncs: data.syncs,
                errors: data.errors,
            })).sort((a, b) => a.hour.localeCompare(b.hour)),
            topErrors: syncEvents
                .filter((e: any) => !e.success && e.responseJson)
                .slice(0, 10)
                .map((e: any) => ({ error: (e.responseJson as any)?.error || "Unknown", count: 1 })),
        });
    } catch (error) {
        console.error("Get observability sync error:", error);
        res.status(500).json({ error: "Failed to get sync metrics" });
    }
}
