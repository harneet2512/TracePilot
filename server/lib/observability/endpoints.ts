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
        let retrievalDurationSum = 0;
        let generationDurationSum = 0;
        let otherDurationSum = 0;
        for (const span of chatSpans) {
            totalInputTokens += span.inputTokens || 0;
            totalOutputTokens += span.outputTokens || 0;
            const duration = span.durationMs || 0;
            if (span.kind === "retrieve") retrievalDurationSum += duration;
            else if (span.kind === "llm" || span.name?.toLowerCase().includes("generate")) generationDurationSum += duration;
            else otherDurationSum += duration;
        }
        const totalTokenUsage = totalInputTokens + totalOutputTokens;
        const avgTokensPerChat = totalChats > 0 ? Math.round(totalTokenUsage / totalChats) : 0;

        // Unique user count
        const uniqueUsers = new Set(chatTraces.map((t: any) => t.userId).filter(Boolean));

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
            metrics: {
                totalConversations: totalChats,
                activeUsers: uniqueUsers.size,
                avgResponseTime: avgDurationMs,
                tokenUsage: totalTokenUsage,
                successRate: totalChats > 0 ? (successfulChats / totalChats) * 100 : 0,
                p95DurationMs,
                avgTokensPerChat,
                requestCount: chatSpans.length,
                latencySplit: {
                    retrievalMs: totalChats > 0 ? Math.round(retrievalDurationSum / totalChats) : 0,
                    generationMs: totalChats > 0 ? Math.round(generationDurationSum / totalChats) : 0,
                    otherMs: totalChats > 0 ? Math.round(otherDurationSum / totalChats) : 0,
                },
            },
            timeseries: Object.entries(byHour).map(([hour, data]) => ({
                timestamp: hour,
                value: data.count,
                avgDuration: data.avgDuration,
                errors: data.errors,
            })).sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
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
            .filter((s: any) => s.similarityMax !== null && s.similarityMax !== undefined)
            .map((s: any) => s.similarityMax!);
        const avgTopSimilarity = similarities.length > 0
            ? similarities.reduce((a: any, b: any) => a + b, 0) / similarities.length
            : 0;

        // Estimate index size from chunks count
        const allChunks = await db.select({ id: chunks.id }).from(chunks).limit(1);
        const indexSizeEstimate = await db.select({ count: sql`count(*)` }).from(chunks);
        const indexSize = Number(indexSizeEstimate[0]?.count) || 0;

        // Group by hour
        const byHour: Record<string, { count: number; avgChunks: number }> = {};
        for (const span of retrievalSpans) {
            const hour = new Date(span.createdAt).toISOString().slice(0, 13);
            if (!byHour[hour]) {
                byHour[hour] = { count: 0, avgChunks: 0 };
            }
            byHour[hour].count++;
            byHour[hour].avgChunks += span.retrievalCount || 0;
        }

        for (const hour in byHour) {
            if (byHour[hour].count > 0) {
                byHour[hour].avgChunks = Math.round(byHour[hour].avgChunks / byHour[hour].count);
            }
        }

        res.json({
            metrics: {
                totalSearches: totalRetrievals,
                avgLatency: avgDurationMs,
                recallAt5: avgTopSimilarity,
                indexSize,
            },
            timeseries: Object.entries(byHour).map(([hour, data]) => ({
                timestamp: hour,
                value: data.count,
                avgChunks: data.avgChunks,
            })).sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
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

        const integrityRate = totalCitations > 0
            ? citationsWithValidChunk / totalCitations
            : 0;

        const avgCitationsPerChat = chatTraces.length > 0
            ? Math.round((totalCitations / chatTraces.length) * 100) / 100
            : 0;

        // Build timeseries from chat traces
        const byHour: Record<string, number> = {};
        for (const trace of chatTraces) {
            const hour = new Date(trace.createdAt).toISOString().slice(0, 13);
            const metadata = trace.metadataJson as any;
            const citationCount = metadata?.citations?.length || 0;
            byHour[hour] = (byHour[hour] || 0) + citationCount;
        }

        res.json({
            metrics: {
                totalCitations,
                integrityRate,
                avgCitationsPerChat,
                clickThroughRate: 0,
            },
            timeseries: Object.entries(byHour).map(([hour, count]) => ({
                timestamp: hour,
                value: count,
            })).sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
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
        const successRate = totalSyncs > 0 ? successfulSyncs / totalSyncs : 0;

        // Estimate avg duration from sync events (if latencyMs stored)
        const syncDurations = syncEvents
            .filter((e: any) => e.latencyMs)
            .map((e: any) => e.latencyMs);
        const avgDuration = syncDurations.length > 0
            ? Math.round(syncDurations.reduce((a: number, b: number) => a + b, 0) / syncDurations.length)
            : 0;

        // Count total docs processed
        const allSources = await db.select().from(sources);
        const docsProcessed = allSources.length;

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
            metrics: {
                totalSyncs,
                successRate,
                avgDuration,
                docsProcessed,
            },
            timeseries: Object.entries(byHour).map(([hour, data]) => ({
                timestamp: hour,
                value: data.syncs,
                errors: data.errors,
            })).sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
            channelStatus: [],
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
