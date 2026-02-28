import type { Chunk, Source } from "@shared/schema";
import { db as _db } from "../db";
const db = _db as any;
import { sources, sourceVersions, chunks } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { searchSimilar, ensureVectorStoreHydrated } from "./vectorstore";
import { storage } from "../storage";
import {
  RETRIEVAL_TOP_K,
  RETRIEVAL_PER_SOURCE_CAP,
  RETRIEVAL_MIN_UNIQUE_SOURCES_CROSS,
  getRetrievalMaxCandidates,
  isDemoAllowedTitle,
  filterChunkQuality,
} from "./retrievalConfig";

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

// Configuration (env overrides in retrievalConfig.ts)
const DEFAULT_TOP_K = RETRIEVAL_TOP_K;
const SCORE_THRESHOLD = 0.65;  // Below this, trigger fallback
const FALLBACK_BOOST_ALPHA = 0.7;  // Weight for primary score in hybrid
const MULTI_SOURCE_POOL_MULTIPLIER = 5;
const MULTI_SOURCE_MIN_POOL = 30;
const MULTI_SOURCE_TOTAL_SELECTED = RETRIEVAL_TOP_K;
const MULTI_SOURCE_MAX_PER_SOURCE = RETRIEVAL_PER_SOURCE_CAP;
const MULTI_SOURCE_MIN_UNIQUE = RETRIEVAL_MIN_UNIQUE_SOURCES_CROSS;
// Demo allowlist now uses robust normalized matching from retrievalConfig.ts

function isSQLite(): boolean {
  const url = process.env.DATABASE_URL || "";
  return process.env.DATABASE_DIALECT === "sqlite" || url.startsWith("file:");
}

// ---------------------------------------------------------------------------
// Source Router — narrows retrieval to the most relevant documents by
// title + keyword signals BEFORE chunk-level vector search.
// ---------------------------------------------------------------------------

interface SourceRouteCandidate {
  sourceId: string;
  title: string;
  sourceType: string;
  sourceTypeHint: string;
  score: number;
  titleScore: number;
  structureScore: number;
  typeHintScore: number;
}

export type RetrievalIntent =
  | "SMALLTALK"
  | "OWNER_DEADLINE_STATUS"
  | "BLOCKERS_RISK_MITIGATION"
  | "ROADMAP_TIMELINE"
  | "OKRS_METRICS_BUDGET"
  | "ARCHITECTURE_TECHNICAL"
  | "GENERAL_QA";

const INTENT_TERMS: Record<RetrievalIntent, string[]> = {
  SMALLTALK: [],
  OWNER_DEADLINE_STATUS: ["owner", "responsible", "deadline", "due", "eta", "status", "assignee", "priority"],
  BLOCKERS_RISK_MITIGATION: ["blocker", "risk", "mitigation", "issue", "incident", "impact", "escalation"],
  ROADMAP_TIMELINE: ["roadmap", "timeline", "milestone", "release", "schedule", "phase"],
  OKRS_METRICS_BUDGET: ["okr", "objective", "key result", "kpi", "metric", "budget", "spend", "cost", "target"],
  ARCHITECTURE_TECHNICAL: ["architecture", "design", "system", "component", "pipeline", "api", "vector", "embedding"],
  GENERAL_QA: ["overview", "summary", "context"],
};

const TYPE_HINT_WEIGHTS: Record<RetrievalIntent, Record<string, number>> = {
  SMALLTALK: {},
  OWNER_DEADLINE_STATUS: { jira_ticket: 6, meeting_notes: 3, team_directory: 2, architecture_doc: -4, roadmap_doc: -2, okr_doc: -1 },
  BLOCKERS_RISK_MITIGATION: { jira_ticket: 5, meeting_notes: 5, team_directory: 1, roadmap_doc: 1, architecture_doc: -4 },
  ROADMAP_TIMELINE: { roadmap_doc: 5, meeting_notes: 1, jira_ticket: 1, architecture_doc: -3 },
  OKRS_METRICS_BUDGET: { okr_doc: 5, team_directory: 1, meeting_notes: 1, architecture_doc: -2 },
  ARCHITECTURE_TECHNICAL: { architecture_doc: 5, team_directory: 1, roadmap_doc: 1, jira_ticket: -2, meeting_notes: -1 },
  GENERAL_QA: { meeting_notes: 1, team_directory: 1, roadmap_doc: 1, okr_doc: 1, architecture_doc: 1, jira_ticket: 1 },
};

export function inferRetrievalIntent(query: string): RetrievalIntent {
  const q = (query || "").trim().toLowerCase();
  if (!q) return "SMALLTALK";
  if (/^(hi|hello|hey|thanks|thank you|good morning|good afternoon|good evening)\b/.test(q)) return "SMALLTALK";
  if (/(owner|responsible|assignee|deadline|due|eta|when|status|priority|contact)/.test(q)) return "OWNER_DEADLINE_STATUS";
  if (/(blocker|risk|mitigation|issue|incident|impediment|escalation)/.test(q)) return "BLOCKERS_RISK_MITIGATION";
  if (/(roadmap|timeline|milestone|release|schedule|phase)/.test(q)) return "ROADMAP_TIMELINE";
  if (/(okr|objective|key result|kpi|metric|budget|spend|burn|cost)/.test(q)) return "OKRS_METRICS_BUDGET";
  if (/(architecture|design|system|component|pipeline|api|vector|embedding|retrieval)/.test(q)) return "ARCHITECTURE_TECHNICAL";
  if (/(chose|choose|chosen|vs|versus|compare|model|llm|claude|gpt|openai|anthropic)/.test(q)) return "ARCHITECTURE_TECHNICAL";
  return "GENERAL_QA";
}

export function inferCanonicalSourceType(source: { title?: string; type?: string; name?: string }, sampleText?: string): string {
  const t = `${source.title || source.name || ""} ${sampleText || ""}`.toLowerCase().replace(/_/g, " ");
  const connectorType = (source.type || "").toLowerCase();
  if (connectorType === "jira" || /\b(?:[a-z]{2,}-\d+|ticket|issue|bug)\b/.test(t)) return "jira_ticket";
  if (/\b(all[- ]?hands|meeting notes|standup|retro|minutes)\b/.test(t)) return "meeting_notes";
  if (/\b(roadmap|timeline|milestone|release plan)\b/.test(t)) return "roadmap_doc";
  if (/\b(okrs?|objective|key result|kpi|budget)\b/.test(t)) return "okr_doc";
  if (/\b(architecture|design doc|system design|component)\b/.test(t)) return "architecture_doc";
  if (/\b(handbook|guide|reference|runbook|playbook)\b/.test(t)) return "team_directory";
  return "other";
}

export const INTENT_ALLOWED_SOURCE_TYPES: Record<string, string[] | null> = {
  OKRS_METRICS_BUDGET:       ["okr_doc", "meeting_notes"],
  ROADMAP_TIMELINE:          ["roadmap_doc"],
  ARCHITECTURE_TECHNICAL:    ["architecture_doc"],
  BLOCKERS_RISK_MITIGATION:  ["jira_ticket", "meeting_notes"],
  OWNER_DEADLINE_STATUS:     ["jira_ticket", "meeting_notes", "team_directory"],
  GENERAL_QA:                null,
  SMALLTALK:                 null,
};

function computeStructureScore(intent: RetrievalIntent, sampleText: string): number {
  const text = (sampleText || "").toLowerCase();
  if (!text) return 0;
  if (intent === "OWNER_DEADLINE_STATUS") {
    let score = 0;
    if (/\bowner\b/.test(text)) score += 1.5;
    if (/\b(deadline|due|eta)\b/.test(text)) score += 1.5;
    if (/\b(status|priority)\b/.test(text)) score += 1;
    return score;
  }
  if (intent === "BLOCKERS_RISK_MITIGATION") {
    let score = 0;
    if (/\b(blocker|risk)\b/.test(text)) score += 1.5;
    if (/\b(mitigation|action|next step)\b/.test(text)) score += 1;
    if (/\b(owner|deadline|eta)\b/.test(text)) score += 0.5;
    return score;
  }
  return 0;
}

/**
 * Score and filter sources by query-time signals (title + keyword match).
 * Returns a narrowed set of sourceIds ordered by relevance.
 * If the query has strong topical signals, only the top candidates survive.
 * If no strong signals, returns all sources (no narrowing).
 */
export function routeSources(
  query: string,
  candidateSources: Array<{ id: string; title: string; type: string; sampleText?: string }>,
  maxSources: number = 6,
): { routedSourceIds: Set<string>; routeDecisions: SourceRouteCandidate[] } {
  const intent = inferRetrievalIntent(query);
  if (candidateSources.length <= maxSources) {
    const allowedTypesEarly = INTENT_ALLOWED_SOURCE_TYPES[intent];
    let filteredCandidates = candidateSources;
    if (allowedTypesEarly) {
      const typeFiltered = candidateSources.filter(s =>
        allowedTypesEarly.includes(inferCanonicalSourceType(s, s.sampleText || ""))
      );
      if (typeFiltered.length > 0) filteredCandidates = typeFiltered;
    }
    return {
      routedSourceIds: new Set(filteredCandidates.map(s => s.id)),
      routeDecisions: filteredCandidates.map(s => ({
        sourceId: s.id,
        title: s.title,
        sourceType: s.type,
        sourceTypeHint: inferCanonicalSourceType(s, s.sampleText || ""),
        score: 1,
        titleScore: 0,
        structureScore: 0,
        typeHintScore: 0,
      })),
    };
  }

  const scored: SourceRouteCandidate[] = candidateSources.map(source => {
    let titleScore = 0;
    const titleLower = (source.title || "").toLowerCase();
    const queryLower = query.toLowerCase();
    const sampleText = source.sampleText || "";
    const typeHint = inferCanonicalSourceType(source, sampleText);

    const intentTerms = INTENT_TERMS[intent];
    for (const term of intentTerms) {
      if (!term) continue;
      if (titleLower.includes(term)) titleScore += 1.2;
    }

    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 3);
    for (const term of queryTerms) {
      if (titleLower.includes(term)) titleScore += 0.6;
    }

    const structureScore = computeStructureScore(intent, sampleText);
    const typeHintScore = TYPE_HINT_WEIGHTS[intent][typeHint] || 0;
    const score = 0.2 + titleScore + structureScore + typeHintScore;

    return {
      sourceId: source.id,
      title: source.title,
      sourceType: source.type,
      sourceTypeHint: typeHint,
      score,
      titleScore,
      structureScore,
      typeHintScore,
    };
  });

  // Contact-signal boost: when query has contact keywords, boost team_directory sources
  const contactSignal = /\b(contact|reach|email|slack|call|phone)\b/i.test(query);
  if (contactSignal) {
    for (const c of scored) {
      if (c.sourceTypeHint === "team_directory") c.score += 5;
    }
  }

  scored.sort((a, b) => b.score - a.score);

  // Source-type enforcement: for typed intents, filter to allowed types only
  const allowedTypes = INTENT_ALLOWED_SOURCE_TYPES[intent];
  if (allowedTypes) {
    const typeFiltered = scored.filter(c => allowedTypes.includes(c.sourceTypeHint));
    if (typeFiltered.length > 0) {
      scored.length = 0;
      scored.push(...typeFiltered);
    } else {
      console.warn(`[SourceRouter] Type filter removed all sources for intent=${intent}, allowed=${allowedTypes.join(",")}`);
    }
  }

  // Always narrow to top-N sources by score. Only pass through all sources
  // if there is no signal at all (all scores at baseline 0.2).
  const topScore = scored[0]?.score ?? 0;
  if (topScore <= 0.3) {
    return {
      routedSourceIds: new Set(candidateSources.map(s => s.id)),
      routeDecisions: scored,
    };
  }

  // Take top N by weighted score
  const selected = new Set<string>();
  const decisions: SourceRouteCandidate[] = [];
  for (const c of scored) {
    if (selected.size >= maxSources) break;
    if (!selected.has(c.sourceId)) {
      selected.add(c.sourceId);
      decisions.push(c);
    }
  }

  if (process.env.DEBUG_RETRIEVAL === "1" || process.env.DEBUG_CITATION_INTEGRITY === "1") {
    console.log(
      `[SourceRouter] query="${query.slice(0, 60)}" topScore=${topScore} ` +
      `routed=${selected.size}/${candidateSources.length} ` +
      `intent=${intent} ` +
      `sources=[${decisions.map(d => `${d.title}(${d.score.toFixed(2)}|hint=${d.sourceTypeHint})`).join(", ")}]`
    );
  }

  return { routedSourceIds: selected, routeDecisions: decisions };
}

// Query expansion for OKR-style queries
const QUERY_EXPANSIONS: Record<string, string[]> = {
    "okr": ["objectives and key results", "objective", "key result", "goal", "kpi"],
    "timeline": ["schedule", "milestone", "roadmap", "release plan"],
    "blocker": ["blockers", "critical path", "dependency", "issue"],
    "risk": ["risks", "mitigation", "critical path", "dependency", "impact"],
    "owner": ["responsible", "assignee", "point of contact"],
    "deadline": ["due date", "eta", "target date"],
};

/**
 * Queries that generally require cross-source synthesis.
 */
export function requiresMultiSource(query: string, intent?: string): boolean {
    const lower = (query || "").toLowerCase();
    if (!lower) return false;
    const retrievalIntent = inferRetrievalIntent(query);

    // Roadmap queries are typically answered by a single roadmap doc
    if (retrievalIntent === "ROADMAP_TIMELINE") {
        return false;
    }

    if (retrievalIntent === "BLOCKERS_RISK_MITIGATION") {
        return true;
    }

    if (intent && ["BLOCKER"].includes(intent.toUpperCase())) return true;

    const patterns = [
        /blocker|blockers/,
        /risk|risks|mitigation|mitigate/,
        /what are we doing about|what are we doing/,
        /across|compare|between|cross[-\s]?source|multi[-\s]?source/,
    ];

    return patterns.some((p) => p.test(lower));
}

function extractMultiSourceEntities(query: string): string[] {
    const terms: string[] = [];
    const add = (value: string | undefined) => {
        if (!value) return;
        const clean = value.trim();
        if (clean.length < 3) return;
        if (!terms.includes(clean)) terms.push(clean);
    };

    const genericKeywords = [
      "owner", "deadline", "eta", "status", "priority",
      "blocker", "risk", "mitigation", "launch",
      "roadmap", "timeline", "okr", "budget",
      "architecture", "design", "system",
    ];
    for (const key of genericKeywords) {
      if (new RegExp(`\\b${key}\\b`, "i").test(query)) add(key);
    }

    const jiraMatches = query.match(/\b[A-Z]{2,}-\d+\b/g) || [];
    for (const issue of jiraMatches) add(issue);

    return terms;
}

function getUniqueSourceCount(results: Array<{ chunk: Chunk; score: number }>): number {
    return new Set(results.map((r) => r.chunk.sourceId)).size;
}

export interface SearchRetrievalCorpusResult {
  candidates: Chunk[];
  totalCount: number;
  allowedSourceIds: Set<string>;
  versionIds: string[];
}

/**
 * Central retrieval function - returns BOUNDED candidate set only.
 * Never loads more than RETRIEVAL_MAX_CANDIDATES chunks to prevent OOM.
 */
export async function searchRetrievalCorpus(
    filters: RetrievalFilters,
    query?: string,
    maxCandidates?: number
): Promise<SearchRetrievalCorpusResult> {
    const { workspaceId, requesterUserId, connectorTypes, scopeId } = filters;
    const sqlite = isSQLite();
    const limit = maxCandidates ?? getRetrievalMaxCandidates(sqlite);
    const demoMode = process.env.DEMO_MODE === "1";
    const enforceDemoAllowlist = demoMode || scopeId === "demo-golden-scope";

    console.log(
        `[Retrieval] Searching corpus: workspaceId=${workspaceId}, userId=${requesterUserId}, ` +
        `scopeId=${scopeId || "none"}, demoMode=${demoMode ? "1" : "0"}, demoAllowlist=${enforceDemoAllowlist ? "1" : "0"}, maxCandidates=${limit}`
    );

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
        return { candidates: [], totalCount: 0, allowedSourceIds: new Set(), versionIds: [] };
    }

    const versionIds = activeVersions.map((v: any) => v.id);

    const candidateSources = await db
        .select()
        .from(sources)
        .where(eq(sources.workspaceId, workspaceId));

    console.log(`[Retrieval] Found ${candidateSources.length} total sources in workspace, filtering by visibility...`);

    const allowedSourceIds = new Set<string>();

    for (const source of candidateSources) {
        const metadata = source.metadataJson as Record<string, unknown> | null;

        // Demo guard: only allow the golden demo docs in demo mode (robust normalized matching).
        if (enforceDemoAllowlist && !isDemoAllowedTitle(source.title)) {
            continue;
        }

        // Scope guard: when scopeId is provided, only include sources in that scope.
        const sourceScopeId = typeof metadata?.scopeId === "string" ? metadata.scopeId : undefined;
        if (scopeId && sourceScopeId !== scopeId) {
            continue;
        }

        if (source.visibility === 'private' && source.createdByUserId !== requesterUserId) {
            continue;
        }

        if (source.type === 'slack' && source.visibility === 'workspace') {
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
        return { candidates: [], totalCount: 0, allowedSourceIds: new Set(), versionIds: [] };
    }

    const totalCount = await storage.getChunkCountForWorkspace(workspaceId, Array.from(allowedSourceIds));
    const queryTerms = query ? query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2) : undefined;
    const candidates = await storage.getBoundedLexicalCandidates(
        workspaceId,
        Array.from(allowedSourceIds),
        versionIds,
        limit,
        queryTerms
    );

    console.log(
        `[Retrieval] Candidate stats: lexicalCandidates=${candidates.length} ` +
        `maxCandidates=${limit} totalInScope=${totalCount} allowedSources=${allowedSourceIds.size}`
    );

    return { candidates, totalCount, allowedSourceIds, versionIds };
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

    return Array.from(new Set(expansions));
}

/**
 * Fallback lexical search - uses BOUNDED candidate set only.
 */
async function lexicalSearch(
    query: string,
    workspaceId: string,
    allowedSourceIds: Set<string>,
    versionIds: string[],
    limit: number = 20
): Promise<Array<{ chunk: Chunk; score: number }>> {
    const expandedQueries = expandQuery(query);
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const maxCandidates = getRetrievalMaxCandidates(isSQLite());

    const candidateChunks = await storage.getBoundedLexicalCandidates(
        workspaceId,
        Array.from(allowedSourceIds),
        versionIds,
        maxCandidates,
        terms.length > 0 ? terms : undefined
    );

    const scored: Array<{ chunk: Chunk; score: number }> = [];

    for (const chunk of candidateChunks) {
        const textLower = chunk.text.toLowerCase();
        let matchScore = 0;

        for (const expansion of expandedQueries) {
            if (textLower.includes(expansion.toLowerCase())) {
                matchScore += 0.5;
            }
        }

        for (const term of terms) {
            const occurrences = (textLower.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
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
 * Diversify sources to ensure results include chunks from multiple distinct sources.
 * Prevents any single source from dominating results (max 60% from one source).
 * Boosts non-primary sources (architecture, blockers, roadmap) for better coverage.
 */
async function diversifySources(
    results: Array<{ chunk: Chunk; score: number }>,
    allChunks: Chunk[],
    targetCount: number,
    query: string = ""
): Promise<Array<{ chunk: Chunk; score: number }>> {
    if (results.length === 0) return results;

    // Count chunks per source
    const sourceCount = new Map<string, number>();
    for (const r of results) {
        sourceCount.set(r.chunk.sourceId, (sourceCount.get(r.chunk.sourceId) || 0) + 1);
    }

    // Check if any source dominates (> 60%)
    const maxAllowed = Math.ceil(targetCount * 0.6);
    const uniqueSources = sourceCount.size;

    // If we have >= 3 distinct sources or no source dominates, keep as-is
    if (uniqueSources >= 3) {
        let needsDiversification = false;
        for (const count of sourceCount.values()) {
            if (count > maxAllowed) {
                needsDiversification = true;
                break;
            }
        }
        if (!needsDiversification) return results;
    }

    // Find the dominant source
    let dominantSourceId = '';
    let dominantCount = 0;
    for (const [sourceId, count] of sourceCount) {
        if (count > dominantCount) {
            dominantCount = count;
            dominantSourceId = sourceId;
        }
    }

    // If dominant source doesn't exceed 60%, no action needed
    if (dominantCount <= maxAllowed && uniqueSources >= 2) {
        return results;
    }

    console.log(`[Retrieval] Diversifying sources: ${dominantSourceId} has ${dominantCount}/${results.length} chunks (max ${maxAllowed})`);

    // Find additional chunks from other sources
    const existingChunkIds = new Set(results.map(r => r.chunk.id));
    const otherSourceChunks = allChunks
        .filter(c => c.sourceId !== dominantSourceId && !existingChunkIds.has(c.id))
        .slice(0, targetCount); // Get potential candidates

    // Score other source chunks using simple lexical matching (already in allChunks from corpus)
    const diverseResults: Array<{ chunk: Chunk; score: number }> = [];

    // Keep top chunks from dominant source up to maxAllowed
    const dominantChunks = results
        .filter(r => r.chunk.sourceId === dominantSourceId)
        .slice(0, maxAllowed);
    diverseResults.push(...dominantChunks);

    // Keep all non-dominant chunks
    const otherChunks = results.filter(r => r.chunk.sourceId !== dominantSourceId);
    diverseResults.push(...otherChunks);

    // Add chunks from other sources to fill up to targetCount
    // Only add chunks that have lexical relevance to the query
    const remaining = targetCount - diverseResults.length;
    if (remaining > 0 && otherSourceChunks.length > 0) {
        const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 3);
        if (queryTerms.length > 0) {
            const scoredOther = otherSourceChunks.map(c => {
                const text = c.text.toLowerCase();
                const matches = queryTerms.filter(t => text.includes(t)).length;
                return { chunk: c, score: matches > 0 ? Math.min(0.3 + matches * 0.05, 0.5) : 0 };
            }).filter(r => r.score > 0).sort((a, b) => b.score - a.score);
            for (let i = 0; i < Math.min(remaining, scoredOther.length); i++) {
                diverseResults.push(scoredOther[i]);
            }
        } else {
            // No meaningful query terms, assign a lower score (fallback)
            for (let i = 0; i < Math.min(remaining, otherSourceChunks.length); i++) {
                diverseResults.push({ chunk: otherSourceChunks[i], score: 0.3 });
            }
        }
    }

    // Sort by score descending
    diverseResults.sort((a, b) => b.score - a.score);

    console.log(`[Retrieval] After diversification: ${diverseResults.length} chunks from ${new Set(diverseResults.map(r => r.chunk.sourceId)).size} sources`);

    return diverseResults.slice(0, targetCount);
}

function diversifyRoundRobin(
    pool: Array<{ chunk: Chunk; score: number }>,
    totalSelected: number,
    maxPerSource: number,
): Array<{ chunk: Chunk; score: number }> {
    if (pool.length === 0) return [];

    const sortedPool = [...pool].sort((a, b) => b.score - a.score);
    const bySource = new Map<string, Array<{ chunk: Chunk; score: number }>>();
    for (const item of sortedPool) {
        const list = bySource.get(item.chunk.sourceId) || [];
        list.push(item);
        bySource.set(item.chunk.sourceId, list);
    }

    const sourceOrder = Array.from(bySource.entries())
        .sort((a, b) => (b[1][0]?.score || 0) - (a[1][0]?.score || 0))
        .map(([sid]) => sid);

    const selected: Array<{ chunk: Chunk; score: number }> = [];
    const selectedChunkIds = new Set<string>();
    const perSourceCounts = new Map<string, number>();

    // Pass 1: at most one chunk per source to maximize source diversity.
    for (const sid of sourceOrder) {
        if (selected.length >= totalSelected) break;
        const bucket = bySource.get(sid) || [];
        const first = bucket.shift();
        if (!first) continue;
        selected.push(first);
        selectedChunkIds.add(first.chunk.id);
        perSourceCounts.set(sid, 1);
        bySource.set(sid, bucket);
    }

    // Pass 2: round-robin fill with per-source cap.
    let madeProgress = true;
    while (selected.length < totalSelected && madeProgress) {
        madeProgress = false;
        for (const sid of sourceOrder) {
            if (selected.length >= totalSelected) break;
            const used = perSourceCounts.get(sid) || 0;
            if (used >= maxPerSource) continue;

            const bucket = bySource.get(sid) || [];
            while (bucket.length > 0 && selectedChunkIds.has(bucket[0].chunk.id)) {
                bucket.shift();
            }
            const next = bucket.shift();
            bySource.set(sid, bucket);
            if (!next) continue;

            selected.push(next);
            selectedChunkIds.add(next.chunk.id);
            perSourceCounts.set(sid, used + 1);
            madeProgress = true;
        }
    }

    return selected;
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

    const multiSourceRequired = requiresMultiSource(query);
    const retrievalPoolTopK = multiSourceRequired
        ? Math.max(topK * MULTI_SOURCE_POOL_MULTIPLIER, MULTI_SOURCE_MIN_POOL)
        : topK;

    const diagnostics: RetrievalDiagnostics = {
        workspaceIdUsed: workspaceId,
        scopeIdUsed: scopeId || null,
        primaryRetrieval: { retrievedCount: 0, topK: retrievalPoolTopK, topScore: null, chunks: [] },
        fallbackLexical: null,
        mergedReranked: { retrievedCount: 0, chunks: [] },
        existenceChecks: { chunksTotalInScope: 0, chunksWithKeywords: {} },
        decision: { usedFallback: false, reason: "" }
    };

    const { candidates: allChunksRaw, totalCount, allowedSourceIds, versionIds } = await searchRetrievalCorpus(
        filters,
        query,
        getRetrievalMaxCandidates(isSQLite())
    );
    diagnostics.existenceChecks.chunksTotalInScope = totalCount;
    const sourceRows = await db
        .select({ id: sources.id, type: sources.type, title: sources.title })
        .from(sources)
        .where(eq(sources.workspaceId, workspaceId));
    const sourceMetaById = new Map<string, { id: string; type: string; title: string }>(
        sourceRows.map((row: { id: string; type: string; title: string }) => [row.id, row])
    );

    // Source Router: narrow candidates to the most relevant documents
    // by title + keyword signals BEFORE expensive vector search.
    const sampleTextBySourceId = new Map<string, string>();
    for (const chunk of allChunksRaw) {
        if (!sampleTextBySourceId.has(chunk.sourceId)) {
            sampleTextBySourceId.set(chunk.sourceId, chunk.text.slice(0, 800));
        }
    }

    const allowedSourceMeta = Array.from(allowedSourceIds)
        .map(sid => sourceMetaById.get(sid))
        .filter((s): s is { id: string; type: string; title: string } => !!s);

    const enrichedRouteCandidates = allowedSourceMeta.map((source) => ({
        ...source,
        sampleText: sampleTextBySourceId.get(source.id) || "",
    }));

    const { routedSourceIds, routeDecisions } = routeSources(query, enrichedRouteCandidates);
    let allChunks = allChunksRaw.filter(c => routedSourceIds.has(c.sourceId));

    // Source-diversity backfill: if routed sources have 0 chunks in the
    // lexical pre-filter, fetch their chunks directly (covers the case where
    // the pre-filter limit excluded chunks from relevant source types).
    if (allChunks.length === 0 && routedSourceIds.size > 0 && totalCount > 0) {
        console.log(`[Retrieval] Source-diversity backfill: routed ${routedSourceIds.size} sources have 0 lexical hits, fetching directly`);
        const backfillChunks = await storage.getBoundedLexicalCandidates(
            workspaceId,
            Array.from(routedSourceIds),
            versionIds,
            200
        );
        if (backfillChunks.length > 0) {
            console.log(`[Retrieval] Source-diversity backfill: found ${backfillChunks.length} chunks from routed sources`);
            allChunks = backfillChunks;
        }
    }

    // Retrieval coverage: log source type hints present vs. routed
    const retrievalIntent = inferRetrievalIntent(query);
    const candidateTypeHints = new Set(
        enrichedRouteCandidates.map(s => inferCanonicalSourceType(s, s.sampleText))
    );
    const routedTypeHints = new Set(
        routeDecisions.filter(d => routedSourceIds.has(d.sourceId)).map(d => d.sourceTypeHint)
    );
    console.log(
        `[RetrievalCoverage] intent=${retrievalIntent} ` +
        `candidateTypes=[${Array.from(candidateTypeHints).join(",")}] ` +
        `routedTypes=[${Array.from(routedTypeHints).join(",")}] ` +
        `routedSources=${routedSourceIds.size}/${allowedSourceIds.size}`
    );
    if (retrievalIntent === "BLOCKERS_RISK_MITIGATION") {
        if (!routedTypeHints.has("ticket_issue") && candidateTypeHints.has("ticket_issue")) {
            console.warn(`[RetrievalCoverage] WARNING: ticket_issue source available but NOT routed for blocker/risk query`);
        }
        if (!routedTypeHints.has("meeting_notes") && candidateTypeHints.has("meeting_notes")) {
            console.warn(`[RetrievalCoverage] WARNING: meeting_notes source available but NOT routed for blocker/risk query`);
        }
    }

    if (process.env.DEBUG_RETRIEVAL === "1") {
        console.log(
            `[SourceRouter] routing: ${allChunksRaw.length} → ${allChunks.length} chunks ` +
            `(${routedSourceIds.size}/${allowedSourceIds.size} sources) ` +
            `decisions=[${routeDecisions.map(d => `${d.title}(${d.score})`).join(", ")}]`
        );
    }

    // Hard OOM guard: refuse retrieval warm scan for SQLite with very large workspaces
    if (isSQLite() && totalCount > 5000) {
        console.warn(
            `[Retrieval] OOM guard: totalCount=${totalCount} > 5000 on SQLite. Refusing full retrieval. ` +
            `Use Postgres+pgvector or reduce scope.`
        );
        diagnostics.decision.reason = "SQLite workspace too large (>5000 chunks); retrieval refused to prevent OOM";
        return { chunks: [], diagnostics };
    }

    if (allChunks.length === 0 && totalCount === 0) {
        diagnostics.decision.reason = "No chunks in scope/workspace";
        console.log(`[RAG] workspaceId=${workspaceId} scopeId=${scopeId || 'null'} query="${query.slice(0, 50)}" primaryRetrieved=0 topScore=null usedFallback=false finalRetrieved=0`);
        return { chunks: [], diagnostics };
    }

    if (totalCount > 0 && allChunks.length === 0) {
        diagnostics.decision.reason = "Lexical pre-filter returned 0 candidates (query may not match any chunk)";
        console.log(`[RAG] workspaceId=${workspaceId} scopeId=${scopeId || 'null'} query="${query.slice(0, 50)}" candidates=0 totalInScope=${totalCount}`);
        return { chunks: [], diagnostics };
    }

    // Log memory + candidate counts for observability
    if (process.env.NODE_ENV === "development") {
        const mem = process.memoryUsage();
        console.log(`[Retrieval] Memory: heapUsed=${Math.round(mem.heapUsed / 1024 / 1024)}MB candidates=${allChunks.length} totalInScope=${totalCount}`);
    }

    for (const kw of ["okr", "objectives", "q4", "biology", "ai search"]) {
        diagnostics.existenceChecks.chunksWithKeywords[kw] =
            allChunks.filter(c => c.text.toLowerCase().includes(kw)).length;
    }

    await ensureVectorStoreHydrated();
    const primaryResults = await searchSimilar(query, allChunks, retrievalPoolTopK);

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

        const lexicalResults = await lexicalSearch(query, workspaceId, allowedSourceIds, versionIds, retrievalPoolTopK * 2);

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
        finalResults = merged.slice(0, retrievalPoolTopK).map(m => ({ chunk: m.chunk, score: m.score }));
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

    // Step 5: Source diversification.
    if (multiSourceRequired) {
        finalResults = diversifyRoundRobin(
            finalResults,
            MULTI_SOURCE_TOTAL_SELECTED,
            MULTI_SOURCE_MAX_PER_SOURCE
        );

        // If diversity still collapses to one source, retry once with lightweight entity expansion.
        if (getUniqueSourceCount(finalResults) < MULTI_SOURCE_MIN_UNIQUE) {
            const entityTerms = extractMultiSourceEntities(query);
            if (entityTerms.length > 0) {
                const expandedQuery = `${query} ${entityTerms.join(" ")}`;
                const expandedLexical = await lexicalSearch(
                    expandedQuery,
                    workspaceId,
                    allowedSourceIds,
                    versionIds,
                    retrievalPoolTopK
                );
                const mergedByChunkId = new Map<string, { chunk: Chunk; score: number }>();
                for (const item of [...finalResults, ...expandedLexical]) {
                    const existing = mergedByChunkId.get(item.chunk.id);
                    if (!existing || item.score > existing.score) {
                        mergedByChunkId.set(item.chunk.id, item);
                    }
                }
                finalResults = diversifyRoundRobin(
                    Array.from(mergedByChunkId.values()),
                    MULTI_SOURCE_TOTAL_SELECTED,
                    MULTI_SOURCE_MAX_PER_SOURCE
                );
            }
        }

        // Last-resort diversity guard: add one top lexical chunk from a different source.
        if (getUniqueSourceCount(finalResults) < MULTI_SOURCE_MIN_UNIQUE) {
            const currentSourceIds = new Set(finalResults.map((r) => r.chunk.sourceId));
            const searchTerms = [
                ...extractMultiSourceEntities(query),
                ...query.toLowerCase().split(/\s+/).filter((t) => t.length > 3),
            ];
            const scored = allChunks
                .filter((c) => !currentSourceIds.has(c.sourceId))
                .map((chunk) => {
                    const text = chunk.text.toLowerCase();
                    const score = searchTerms.reduce((acc, term) => acc + (text.includes(term.toLowerCase()) ? 1 : 0), 0);
                    return { chunk, score };
                })
                .filter((r) => r.score > 0)
                .sort((a, b) => b.score - a.score);

            if (scored.length > 0) {
                finalResults = [
                    ...finalResults,
                    { chunk: scored[0].chunk, score: Math.max(0.2, Math.min(0.4, scored[0].score * 0.05)) },
                ];
            }
        }

        // Prefer a Jira blocker source for blocker/risk synthesis when available.
        if (/blocker|risk|launch/i.test(query)) {
            const hasJiraSource = finalResults.some((r) => {
                const sourceMeta = sourceMetaById.get(r.chunk.sourceId);
                if (!sourceMeta) return false;
                return sourceMeta.type === "jira" || /jira|infra-\d+/i.test(sourceMeta.title || "");
            });
            if (!hasJiraSource) {
                const jiraCandidates = allChunks.filter((chunk) => {
                    const sourceMeta = sourceMetaById.get(chunk.sourceId);
                    if (!sourceMeta) return false;
                    return sourceMeta.type === "jira" || /jira|infra-\d+/i.test(sourceMeta.title || "");
                });
                if (jiraCandidates.length > 0) {
                    const scoringTerms = [
                        ...extractMultiSourceEntities(query).map((t) => t.toLowerCase()),
                        ...query.toLowerCase().split(/\s+/).filter((t) => t.length > 3),
                    ];
                    const bestJira = jiraCandidates
                        .map((chunk) => {
                            const text = chunk.text.toLowerCase();
                            const score = scoringTerms.reduce((acc, term) => acc + (text.includes(term) ? 1 : 0), 0);
                            return { chunk, score };
                        })
                        .sort((a, b) => b.score - a.score)[0];
                    if (bestJira && !finalResults.some((r) => r.chunk.id === bestJira.chunk.id)) {
                        finalResults = [...finalResults, { chunk: bestJira.chunk, score: 0.35 }];
                    }
                }
            }
        }
    } else {
        finalResults = await diversifySources(finalResults, allChunks, topK, query);
    }

    // Step 6: Neighbor Expansion
    // Group by sourceId to optimize fetching
    const chunksBySource: Record<string, number[]> = {};
    const chunkMap = new Map<string, { chunk: Chunk; score: number }>();

    // Initial population
    for (const r of finalResults) {
        if (!chunksBySource[r.chunk.sourceId]) {
            chunksBySource[r.chunk.sourceId] = [];
        }
        chunksBySource[r.chunk.sourceId].push(r.chunk.chunkIndex);
        chunkMap.set(r.chunk.id, r);
    }

    // For each unique source in top K, fetch neighbors
    const sourceIds = Object.keys(chunksBySource);
    // Limit expansion to top 3 sources to save tokens? Or just do all topK?
    // Let's do top 5 sources max to be safe.
    const topSources = sourceIds.slice(0, 5);

    // Better approach: Calculate target indices per source
    for (const sourceId of topSources) {
        const hitIndices = chunksBySource[sourceId];
        const targetIndices = new Set<number>();
        hitIndices.forEach(idx => {
            targetIndices.add(idx);
            targetIndices.add(idx - 1);
            targetIndices.add(idx + 1);
        });

        // Filter out negative indices? DB handles it (won't match).
        const indices = Array.from(targetIndices).filter(i => i >= 0);

        if (indices.length === 0) continue;

        const sourceNeighbors = await db
            .select()
            .from(chunks)
            .where(
                and(
                    eq(chunks.sourceId, sourceId),
                    inArray(chunks.chunkIndex, indices)
                )
            );

        for (const c of sourceNeighbors) {
            // Assign score: if it was a hit, keep score. If neighbor, give lower score (0.01?) or inherit?
            // Usually neighbors are context, so score doesn't matter much for ranking, but matters for cut-off.
            // We'll append them.
            if (!chunkMap.has(c.id)) {
                // Determine score based on parent? 
                // Find closest hit index
                const parentIndex = hitIndices.reduce((prev, curr) =>
                    Math.abs(curr - c.chunkIndex) < Math.abs(prev - c.chunkIndex) ? curr : prev
                );
                const parent = finalResults.find(r => r.chunk.sourceId === sourceId && r.chunk.chunkIndex === parentIndex);
                const score = parent ? parent.score * 0.9 : 0.1; // Slightly degrade

                chunkMap.set(c.id, { chunk: c, score });
            }
        }
    }

    // Enrich with source info
    const allEnriched = await Promise.all(Array.from(chunkMap.values()).map(async r => {
        const source = await storage.getSource(r.chunk.sourceId);
        return { chunk: r.chunk, score: r.score, source };
    }));

    // Sort by sourceId then chunkIndex to preserve flow
    allEnriched.sort((a, b) => {
        if (a.chunk.sourceId !== b.chunk.sourceId) return b.score - a.score; // Group by score (implicit source grouping)
        return a.chunk.chunkIndex - b.chunk.chunkIndex; // Then linear order
    });

    // Re-verify sorting: We often want high score first.
    // But for "Context Assembly" in agentCore, we want coherent text.
    // agentCore usually just joins them. 
    // If we sort by Score, we break flow. 
    // If we sort by Index, we get flow but mix sources.
    // Compromise: Sort by top-score-of-source, then Index?
    // Let's sort simply by Scoredesc for now, agentCore will re-sort or we fix agentCore to respect document order?
    // User req: "Implement neighbor chunk expansion... Merge, dedupe... preserve order by (sourceVersionId, chunkIndex)".

    allEnriched.sort((a, b) => {
        if (a.chunk.sourceId === b.chunk.sourceId) {
            return a.chunk.chunkIndex - b.chunk.chunkIndex;
        }
        return b.score - a.score;
    });

    diagnostics.mergedReranked.retrievedCount = allEnriched.length;
    diagnostics.mergedReranked.chunks = allEnriched.slice(0, 10).map(r => ({
        chunkId: r.chunk.id,
        sourceId: r.chunk.sourceId,
        title: r.source?.title || "Unknown",
        score: r.score,
        preview: r.chunk.text.slice(0, 120)
    }));

    console.log(
        `[RAG] workspaceId=${workspaceId} scopeId=${scopeId || "null"} query="${query.slice(0, 50)}" ` +
        `primaryRetrieved=${diagnostics.primaryRetrieval.retrievedCount} topScore=${topScore.toFixed(3)} ` +
        `usedFallback=${diagnostics.decision.usedFallback} finalRetrieved=${allEnriched.length} ` +
        `finalTopK=${topK} uniqueSources=${new Set(allEnriched.map((c) => c.chunk.sourceId)).size}`
    );

    return { chunks: allEnriched, diagnostics };
}

