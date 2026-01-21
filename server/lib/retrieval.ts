import type { Chunk, Source } from "@shared/schema";
import { db as _db } from "../db";
const db = _db as any;
import { sources, sourceVersions, chunks } from "@shared/schema";
import { eq, and, or, inArray, like, sql } from "drizzle-orm";
import { searchSimilar, ensureVectorStoreHydrated } from "./vectorstore";
import { storage } from "../storage";

export interface RetrievalFilters {
    workspaceId: string;
    requesterUserId: string;
    connectorTypes?: string[];
    scopeId?: string;
}

export interface RetrievalDiagnostics {
    workspaceIdUsed: string;
    scopeIdUsed: string | null;
    primaryRetrieval: {
        retrievedCount: number;
        topK: number;
        topScore: number | null;
        chunks: Array<{ chunkId: string; sourceId: string; title: string; score: number; preview: string }>;
    };
    fallbackLexical: {
        retrievedCount: number;
        chunks: Array<{ chunkId: string; sourceId: string; title: string; score: number; preview: string }>;
    } | null;
    mergedReranked: {
        retrievedCount: number;
        chunks: Array<{ chunkId: string; sourceId: string; title: string; score: number; preview: string }>;
    };
    existenceChecks: {
        chunksTotalInScope: number;
        chunksWithKeywords: Record<string, number>;
    };
    decision: {
        usedFallback: boolean;
        reason: string;
    };
}

export interface RetrievalResult {
    chunks: Array<{ chunk: Chunk; score: number; source?: Source }>;
    diagnostics: RetrievalDiagnostics;
}

// Configuration
const DEFAULT_TOP_K = 8;
const SCORE_THRESHOLD = 0.65;  // Below this, trigger fallback
const FALLBACK_BOOST_ALPHA = 0.7;  // Weight for primary score in hybrid

// Query expansion for OKR-style queries
const QUERY_EXPANSIONS: Record<string, string[]> = {
    "okr": ["objectives and key results", "objective", "key result", "goal"],
    "q4": ["quarter 4", "fourth quarter", "q4 2024", "q4 2025", "q4 2026"],
    "q3": ["quarter 3", "third quarter"],
    "q2": ["quarter 2", "second quarter"],
    "q1": ["quarter 1", "first quarter"],
    "ai search": ["ai-search", "aisearch", "search ai", "search project"],
};

/**
 * Central retrieval function that enforces workspace and visibility boundaries.
 */
export async function searchRetrievalCorpus(
    filters: RetrievalFilters
): Promise<Chunk[]> {
    const { workspaceId, requesterUserId, connectorTypes } = filters;

    console.log(`[Retrieval] Searching corpus: workspaceId=${workspaceId}, userId=${requesterUserId}, connectorTypes=${connectorTypes?.join(',') || 'all'}`);

    // Get active source versions for this workspace
    const activeVersions = await db
        .select()
        .from(sourceVersions)
        .where(
            and(
                eq(sourceVersions.workspaceId, workspaceId),
                eq(sourceVersions.isActive, true)
            )
        );

    if (activeVersions.length === 0) {
        console.log(`[Retrieval] No active source versions in workspace ${workspaceId}`);
        return [];
    }

    const versionIds = activeVersions.map((v: any) => v.id);

    // Get sources for these versions with visibility filtering
    const candidateSources = await db
        .select()
        .from(sources)
        .where(eq(sources.workspaceId, workspaceId));

    console.log(`[Retrieval] Found ${candidateSources.length} total sources in workspace, filtering by visibility...`);

    const allowedSourceIds = new Set<string>();

    for (const source of candidateSources) {
        if (source.visibility === 'private' && source.createdByUserId !== requesterUserId) {
            continue;
        }

        if (source.type === 'slack' && source.visibility === 'workspace') {
            const metadata = source.metadataJson as Record<string, unknown> | null;
            const isPrivate = metadata?.is_private as boolean | undefined;
            if (isPrivate === true) continue;
        }

        if (connectorTypes && connectorTypes.length > 0) {
            if (!connectorTypes.includes(source.type)) continue;
        }

        allowedSourceIds.add(source.id);
    }

    if (allowedSourceIds.size === 0) {
        console.log(`[Retrieval] No sources passed visibility and connector filters`);
        return [];
    }

    const retrievedChunks = await db
        .select()
        .from(chunks)
        .where(
            and(
                eq(chunks.workspaceId, workspaceId),
                inArray(chunks.sourceId, Array.from(allowedSourceIds)),
                inArray(chunks.sourceVersionId, versionIds)
            )
        );

    console.log(`[Retrieval] Retrieved ${retrievedChunks.length} chunks from ${allowedSourceIds.size} sources`);

    return retrievedChunks;
}

/**
 * Expand query with synonyms for better lexical matching
 */
function expandQuery(query: string): string[] {
    const lowerQuery = query.toLowerCase();
    const expansions = [query];

    for (const [key, synonyms] of Object.entries(QUERY_EXPANSIONS)) {
        if (lowerQuery.includes(key)) {
            expansions.push(...synonyms.map(s => query.replace(new RegExp(key, 'gi'), s)));
        }
    }

    // Extract key terms for individual matching
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    return [...new Set(expansions)];
}

/**
 * Fallback lexical search using ILIKE (works with any Postgres/SQLite)
 */
async function lexicalSearch(
    query: string,
    workspaceId: string,
    allowedSourceIds: Set<string>,
    limit: number = 20
): Promise<Array<{ chunk: Chunk; score: number }>> {
    const expandedQueries = expandQuery(query);
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    // Build LIKE conditions for each term
    const allChunks = await db
        .select()
        .from(chunks)
        .where(
            and(
                eq(chunks.workspaceId, workspaceId),
                inArray(chunks.sourceId, Array.from(allowedSourceIds))
            )
        );

    // Score each chunk by keyword match count
    const scored: Array<{ chunk: Chunk; score: number }> = [];

    for (const chunk of allChunks) {
        const textLower = chunk.text.toLowerCase();
        let matchScore = 0;

        // Check for expanded query matches
        for (const expansion of expandedQueries) {
            if (textLower.includes(expansion.toLowerCase())) {
                matchScore += 0.5;
            }
        }

        // Score individual terms
        for (const term of terms) {
            const occurrences = (textLower.match(new RegExp(term, 'g')) || []).length;
            matchScore += occurrences * 0.1;
        }

        if (matchScore > 0) {
            scored.push({ chunk, score: Math.min(matchScore, 1.0) });
        }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
}

/**
 * Main retrieval function with fallback and diagnostics
 */
export async function retrieveForAnswer(
    query: string,
    filters: RetrievalFilters,
    topK: number = DEFAULT_TOP_K
): Promise<RetrievalResult> {
    const { workspaceId, requesterUserId, scopeId } = filters;

    const diagnostics: RetrievalDiagnostics = {
        workspaceIdUsed: workspaceId,
        scopeIdUsed: scopeId || null,
        primaryRetrieval: { retrievedCount: 0, topK, topScore: null, chunks: [] },
        fallbackLexical: null,
        mergedReranked: { retrievedCount: 0, chunks: [] },
        existenceChecks: { chunksTotalInScope: 0, chunksWithKeywords: {} },
        decision: { usedFallback: false, reason: "" }
    };

    // Get all chunks in scope
    const allChunks = await searchRetrievalCorpus(filters);
    diagnostics.existenceChecks.chunksTotalInScope = allChunks.length;

    if (allChunks.length === 0) {
        diagnostics.decision.reason = "No chunks in scope/workspace";
        console.log(`[RAG] workspaceId=${workspaceId} scopeId=${scopeId || 'null'} query="${query.slice(0, 50)}" primaryRetrieved=0 topScore=null usedFallback=false finalRetrieved=0`);
        return { chunks: [], diagnostics };
    }

    // Check for specific keywords in corpus
    const keywordChecks = ["okr", "objectives", "q4", "biology", "ai search"];
    for (const kw of keywordChecks) {
        diagnostics.existenceChecks.chunksWithKeywords[kw] =
            allChunks.filter(c => c.text.toLowerCase().includes(kw)).length;
    }

    // Get allowed source IDs
    const allowedSourceIds = new Set(allChunks.map(c => c.sourceId));

    // Step 1: Primary vector retrieval
    await ensureVectorStoreHydrated();
    const primaryResults = await searchSimilar(query, allChunks, topK);

    diagnostics.primaryRetrieval.retrievedCount = primaryResults.length;
    diagnostics.primaryRetrieval.topScore = primaryResults.length > 0 ? primaryResults[0].score : null;
    diagnostics.primaryRetrieval.chunks = await Promise.all(primaryResults.slice(0, 5).map(async r => {
        const source = await storage.getSource(r.chunk.sourceId);
        return {
            chunkId: r.chunk.id,
            sourceId: r.chunk.sourceId,
            title: source?.title || "Unknown",
            score: r.score,
            preview: r.chunk.text.slice(0, 120)
        };
    }));

    // Step 2: Confidence gate - check if we need fallback
    const topScore = diagnostics.primaryRetrieval.topScore || 0;
    const needsFallback = primaryResults.length === 0 || topScore < SCORE_THRESHOLD;

    let finalResults = primaryResults;

    if (needsFallback) {
        diagnostics.decision.usedFallback = true;
        diagnostics.decision.reason = primaryResults.length === 0
            ? "Primary retrieval returned 0 results"
            : `Top score ${topScore.toFixed(3)} below threshold ${SCORE_THRESHOLD}`;

        // Step 3: Fallback lexical search
        const lexicalResults = await lexicalSearch(query, workspaceId, allowedSourceIds, topK * 2);

        diagnostics.fallbackLexical = {
            retrievedCount: lexicalResults.length,
            chunks: await Promise.all(lexicalResults.slice(0, 5).map(async r => {
                const source = await storage.getSource(r.chunk.sourceId);
                return {
                    chunkId: r.chunk.id,
                    sourceId: r.chunk.sourceId,
                    title: source?.title || "Unknown",
                    score: r.score,
                    preview: r.chunk.text.slice(0, 120)
                };
            }))
        };

        // Step 4: Merge and rerank
        const seenChunkIds = new Set<string>();
        const merged: Array<{ chunk: Chunk; score: number; primaryScore: number; lexScore: number }> = [];

        // Add primary results
        for (const r of primaryResults) {
            seenChunkIds.add(r.chunk.id);
            merged.push({ chunk: r.chunk, score: r.score, primaryScore: r.score, lexScore: 0 });
        }

        // Add lexical results (with boost)
        for (const r of lexicalResults) {
            if (seenChunkIds.has(r.chunk.id)) {
                // Update existing with lexical boost
                const existing = merged.find(m => m.chunk.id === r.chunk.id);
                if (existing) {
                    existing.lexScore = r.score;
                    existing.score = FALLBACK_BOOST_ALPHA * existing.primaryScore + (1 - FALLBACK_BOOST_ALPHA) * r.score;
                }
            } else {
                seenChunkIds.add(r.chunk.id);
                merged.push({ chunk: r.chunk, score: (1 - FALLBACK_BOOST_ALPHA) * r.score, primaryScore: 0, lexScore: r.score });
            }
        }

        // Sort by hybrid score
        merged.sort((a, b) => b.score - a.score);
        finalResults = merged.slice(0, topK).map(m => ({ chunk: m.chunk, score: m.score }));
    } else {
        diagnostics.decision.reason = `Primary retrieval sufficient (topScore=${topScore.toFixed(3)} >= ${SCORE_THRESHOLD})`;
    }

    // Ensure we return at least N=5 if ANY exist
    if (finalResults.length < 5 && allChunks.length > 0) {
        // Pad with top chunks by recency/random if needed
        const existingIds = new Set(finalResults.map(r => r.chunk.id));
        for (const chunk of allChunks) {
            if (!existingIds.has(chunk.id) && finalResults.length < 5) {
                finalResults.push({ chunk, score: 0.1 });
            }
        }
    }

    // Enrich with source info
    const enrichedResults = await Promise.all(finalResults.map(async r => {
        const source = await storage.getSource(r.chunk.sourceId);
        return { chunk: r.chunk, score: r.score, source };
    }));

    diagnostics.mergedReranked.retrievedCount = enrichedResults.length;
    diagnostics.mergedReranked.chunks = enrichedResults.slice(0, 5).map(r => ({
        chunkId: r.chunk.id,
        sourceId: r.chunk.sourceId,
        title: r.source?.title || "Unknown",
        score: r.score,
        preview: r.chunk.text.slice(0, 120)
    }));

    console.log(`[RAG] workspaceId=${workspaceId} scopeId=${scopeId || 'null'} query="${query.slice(0, 50)}" primaryRetrieved=${diagnostics.primaryRetrieval.retrievedCount} topScore=${topScore.toFixed(3)} usedFallback=${diagnostics.decision.usedFallback} finalRetrieved=${enrichedResults.length}`);

    return { chunks: enrichedResults, diagnostics };
}

