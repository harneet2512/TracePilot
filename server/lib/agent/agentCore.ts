/**
 * Agent Core - Shared agent logic for HTTP, Voice, and MCP pathways
 * 
 * This module extracts the core agent functionality (retrieval, LLM, validation, policy)
 * so it can be reused across different transport layers (HTTP, WebSocket, MCP).
 */

import { storage } from "../../storage";
import { searchSimilar } from "../vectorstore";
import { chatCompletion, streamChatCompletion, OPENAI_CHAT_MODEL, type ChatMessage } from "../openai";
import { validateWithRepair } from "../validation/jsonRepair";
import { checkPolicy } from "../policy/checker";
import { sanitizeContent, getUntrustedContextInstruction } from "../safety/sanitize";
import { detectInjection } from "../safety/detector";
import { redactPIIFromObject } from "../safety/redactPII";
import { tracer } from "../observability/tracer";
import { parse as parseYaml } from "yaml";
import type { PolicyYaml, ChatResponse, Citation, Chunk, Section } from "@shared/schema";
import { chatResponseSchema } from "@shared/schema";
import type { Chunk as ChunkType } from "@shared/schema";
import { detectIntent, runStructuredExtractor } from "../rag/structuredExtractor";
import { renderExtractedData } from "../rag/standardRenderer";
import { validateAndAttribute, repairCitations, extractDeterministicAttributes } from "../rag/grounding";
import { normalizeForGrounding } from "../rag/textNormalizer";
import { composeEnterpriseAnswer, enforceEnterpriseAnswerFormat, type RetrievedChunkForRewrite } from "../rag/responseComposer";
import { buildOkrAnswerViewModel } from "../rag/okrViewModelBuilder";
import type { OkrAnswerViewModel } from "@shared/schema";
import { buildCitationIndexMap, citationIndexRecord } from "../rag/citationIndex";

/**
 * Sanitize answer text to enforce enterprise formatting constraints:
 * - no em dashes
 * - no markdown emphasis/headers/tables in visible text
 * - normalized "-" bullet formatting
 */
function sanitizeAnswerText(text: string): string {
  if (!text) return text;

  let result = text;

  // Remove markdown emphasis markers while preserving content.
  result = result.replace(/\*\*(.*?)\*\*/g, "$1");
  result = result.replace(/\*(.*?)\*/g, "$1");

  // Remove markdown heading prefixes.
  result = result.replace(/^\s{0,3}#{1,6}\s+/gm, "");

  // Remove markdown-style table separator lines.
  result = result.replace(/^\s*\|?[-:\s|]{3,}\|?\s*$/gm, "");

  // Replace " — " or " – " (surrounded by spaces) with ", "
  result = result.replace(/\s[—–]\s/g, ", ");
  // Replace remaining em/en dashes with ". "
  result = result.replace(/[—–]/g, ". ");

  const lines = result.split(/\r?\n/);
  const normalized: string[] = [];
  let inBulletBlock = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, "");
    const trimmed = line.trim();

    if (!trimmed) {
      if (normalized.length > 0 && normalized[normalized.length - 1] !== "") {
        normalized.push("");
      }
      inBulletBlock = false;
      continue;
    }

    // Normalize bullet variants into "- " only.
    const bulletMatch = trimmed.match(/^(?:[-*•●▪]|(?:\d+\.))\s+(.*)$/);
    if (bulletMatch) {
      if (!inBulletBlock && normalized.length > 0 && normalized[normalized.length - 1] !== "") {
        normalized.push("");
      }
      normalized.push(`- ${bulletMatch[1].trim()}`);
      inBulletBlock = true;
      continue;
    }

    // Normalize inline bullet chains like "A • B • C".
    const cleaned = trimmed.replace(/\s*[•●▪]+\s*/g, ", ");
    normalized.push(cleaned);
    inBulletBlock = false;
  }

  result = normalized.join("\n");

  // Collapse excessive blank lines and clean punctuation artifacts.
  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.replace(/\.\.\s/g, ". ");
  result = result.replace(/,\s*,/g, ", ");

  return result.trim();
}

function normalizeSnippet(text: string): string {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f]+/g, " ")
    .trim();
  if (!cleaned) return "";
  // Find the first complete sentence (one that starts with uppercase)
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    const trimmed = s.trim();
    if (trimmed.length >= 24 && /^[A-Z]/.test(trimmed)) {
      return trimmed.slice(0, 220).trim();
    }
  }
  // Fallback: use first sentence even if short
  const sentence = sentences[0]?.trim() || cleaned;
  return sentence.slice(0, 220).trim();
}

function isCleanSnippet(text: string): boolean {
  if (!text || text.length < 30) return false;
  // Reject ASCII art, box-drawing chars, long dashes/pipes
  if (/[─│┌┐└┘├┤┬┴┼╔╗╚╝║═]{3,}/.test(text)) return false;
  if (/[┌└┐┘│]{2,}/.test(text)) return false;
  if (/[-|]{10,}/.test(text)) return false;
  if (/[─═]{5,}/.test(text)) return false;
  // Reject if majority is special chars
  const alpha = (text.match(/[a-zA-Z]/g) || []).length;
  if (alpha < text.length * 0.4) return false;
  // Reject raw code/JSON/API specs
  if (/^\s*[{[\]}<>]/.test(text)) return false;
  if (/^\s*(POST|GET|PUT|DELETE)\s+\//.test(text)) return false;
  // Reject fragments that start mid-word (lowercase + abbreviated start)
  if (/^[a-z]{1,3}[\s:,]/.test(text.trim())) return false;
  // Reject text with excessive special formatting chars
  const specialRatio = (text.match(/[:\|>]/g) || []).length / text.length;
  if (specialRatio > 0.12) return false;
  // Reject if contains typical API/code patterns
  if (/\b(Request|Response|Encryption|TLS|AES|API\s+Specification)\b/.test(text) && !/\b(blocker|risk|issue|delay|problem)\b/i.test(text)) return false;
  return true;
}

function buildPartialGroundedFallback(
  relevantChunks: Array<{ chunk: ChunkType; score: number }>,
  userMessage: string,
): {
  answer: string;
  bullets: Array<{ claim: string; citations: Citation[] }>;
  clarifyingQuestion: string;
  citedSourceIds: Set<string>;
} | null {
  const sorted = [...relevantChunks]
    .filter((entry) => typeof entry.chunk?.text === "string" && entry.chunk.text.trim().length > 0)
    .sort((a, b) => b.score - a.score);

  if (sorted.length === 0) return null;

  const picked: Array<{ claim: string; citations: Citation[] }> = [];
  const seenChunkIds = new Set<string>();
  const pickedSourceIds = new Set<string>();

  // First pass: pick top clean snippet
  for (const entry of sorted) {
    if (picked.length >= 1) break;
    if (!entry.chunk?.id || seenChunkIds.has(entry.chunk.id)) continue;
    const claim = normalizeSnippet(entry.chunk.text);
    if (!claim || claim.length < 24) continue;
    if (!isCleanSnippet(claim)) continue;
    picked.push({
      claim,
      citations: [{
        sourceId: entry.chunk.sourceId,
        chunkId: entry.chunk.id,
        sourceVersionId: entry.chunk.sourceVersionId || undefined,
        charStart: entry.chunk.charStart ?? undefined,
        charEnd: entry.chunk.charEnd ?? undefined,
      }],
    });
    seenChunkIds.add(entry.chunk.id);
    pickedSourceIds.add(entry.chunk.sourceId);
  }

  // Second pass: prefer a different source for diversity
  for (const entry of sorted) {
    if (picked.length >= 2) break;
    if (!entry.chunk?.id || seenChunkIds.has(entry.chunk.id)) continue;
    const claim = normalizeSnippet(entry.chunk.text);
    if (!claim || claim.length < 24) continue;
    if (!isCleanSnippet(claim)) continue;
    // Prefer a different source for multi-source coverage
    if (pickedSourceIds.size > 0 && pickedSourceIds.has(entry.chunk.sourceId)) continue;
    picked.push({
      claim,
      citations: [{
        sourceId: entry.chunk.sourceId,
        chunkId: entry.chunk.id,
        sourceVersionId: entry.chunk.sourceVersionId || undefined,
        charStart: entry.chunk.charStart ?? undefined,
        charEnd: entry.chunk.charEnd ?? undefined,
      }],
    });
    seenChunkIds.add(entry.chunk.id);
    pickedSourceIds.add(entry.chunk.sourceId);
  }

  // If still under 2, allow same source
  for (const entry of sorted) {
    if (picked.length >= 2) break;
    if (!entry.chunk?.id || seenChunkIds.has(entry.chunk.id)) continue;
    const claim = normalizeSnippet(entry.chunk.text);
    if (!claim || claim.length < 24) continue;
    if (!isCleanSnippet(claim)) continue;
    picked.push({
      claim,
      citations: [{
        sourceId: entry.chunk.sourceId,
        chunkId: entry.chunk.id,
        sourceVersionId: entry.chunk.sourceVersionId || undefined,
        charStart: entry.chunk.charStart ?? undefined,
        charEnd: entry.chunk.charEnd ?? undefined,
      }],
    });
    seenChunkIds.add(entry.chunk.id);
    pickedSourceIds.add(entry.chunk.sourceId);
  }

  if (picked.length === 0) return null;

  const citedSourceIds = new Set<string>();
  picked.forEach((bullet) => bullet.citations.forEach((c) => citedSourceIds.add(c.sourceId)));

  const clarifyingQuestion = /\b(roadmap|timeline|milestone|release)\b/i.test(userMessage)
    ? "Do you want the roadmap broken down by quarter or by workstream?"
    : /\b(blocker|risk|launch)\b/i.test(userMessage)
      ? "Should I focus on technical blockers, operational blockers, or launch readiness blockers first?"
      : "Can you narrow this to one dimension (timeline, owners, or blockers) so I can synthesize it precisely?";

  const answer = [
    "I found some relevant information in the available sources.",
    ...picked.map((b) => `- ${b.claim}`),
    "",
    clarifyingQuestion,
  ].join("\n");

  return { answer, bullets: picked, clarifyingQuestion, citedSourceIds };
}

// ─── Shared prompt constants (ROOT CAUSE 1 fix: single source of truth) ───

const RESPONSE_STYLE_RULES = `
IDENTITY:
You are TracePilot, an enterprise execution intelligence assistant. You think like a senior colleague who has read all the documents, not a database returning records.

RESPONSE PRINCIPLES:
- Lead with the single most important insight in one confident sentence. Never open with phrases like "based on the documents", "according to", or "I found".
- Frame every deadline with urgency context. Never state a date in isolation. Always interpret what the date means in terms of time remaining and what is at risk.
- Surface downstream risk whenever ownership or deadlines are involved. Always answer the implicit question of what happens if this slips.
- End every response with a specific actionable follow-up referencing something concrete from the answer. Never end with a generic offer to provide more details.
- The prose paragraph carries intelligence and interpretation. The structured cards and tables carry reference data. Never repeat the same information in both. Prose interprets, tables reference.
- Write as a trusted colleague briefing a VP, not as a tool returning a query result.

STRUCTURE (always in this exact order):
1. Insight paragraph: 2 to 4 sentences, urgent and interpretive, never passive voice.
2. Suggested next action: one italic line, specific.
3. Ownership card: only when ownership is relevant.
4. Summary table: Priority and Impact columns must always be populated with interpreted values, never left blank.
5. Evidence cards: horizontal layout, compact, at the bottom.

NEVER:
- Use passive voice for ownership or assignment.
- Restate the user question before answering.
- Leave Priority or Impact columns empty.
- Repeat prose content in the table.
- Start the response with the word "I".
- End with a non-specific offer for more details.

CITATION RULES:
- Every factual bullet needs at least one [N] citation. If a fact draws from 2 sources write [1][2]. [1] = citations[0], [2] = citations[1]. Never skip or reorder.
- No raw JSON, chunk IDs, or metadata in answer text.

SMALLTALK ("Hi", "Thanks", "Hello"):
- 1-2 natural sentences only. No bullets. No citations.
`;

const STRUCTURED_CONTEXT_INSTRUCTION =
  "The context below is structured by source. Each source lists its " +
  "KEY FIELDS PRESENT. Your answer MUST address every key field type " +
  "that is relevant to the user's query. If the query asks about a " +
  "blocker or risk, address: owner, deadline, escalation-status, " +
  "financial-impact, and risk if any of those fields are present. " +
  "If the query asks about architecture or technology decisions, " +
  "address: vector-database (name it explicitly), llm-model (name it), " +
  "similarity-metric, and tech-stack choices with rationale if present. " +
  "If the query asks about budget or costs, preserve exact dollar amounts " +
  "with comma notation (e.g. $2,565,000 not '$2.565 million'). " +
  "If the query asks about roadmap or milestones, name all technology " +
  "partners and integration targets mentioned in the source." +
  "in the context. Do not omit fields that are present and relevant.";

/**
 * Detect which field types are present in a chunk of text.
 * Used to annotate context with KEY FIELDS PRESENT metadata.
 */
export function detectFieldTypes(text: string): string[] {
  const fields: string[] = [];
  if (/\$[\d,]+[KMB]?|\d+[KMB]\s*ARR|revenue|cost|budget|allocated/i.test(text))
    fields.push("financial-impact");
  if (/deadline|due date|by [A-Z][a-z]+ \d+|ETA|Nov|Dec/i.test(text))
    fields.push("deadline");
  if (/owner|responsible|assigned to|lead/i.test(text))
    fields.push("owner");
  if (/escalat|exec|TAM|VP|CTO/i.test(text))
    fields.push("escalation-status");
  if (/risk|blocker|impact|critical|high priority/i.test(text))
    fields.push("risk");
  if (/status|in progress|complete|pending/i.test(text))
    fields.push("status");
  // Architecture / technology stack fields
  if (/pinecone|weaviate|milvus|qdrant|chroma|vector.?(?:db|database|store|index)/i.test(text))
    fields.push("vector-database");
  if (/claude|gpt|openai|anthropic|llm|language model|embedding model|text-embedding/i.test(text))
    fields.push("llm-model");
  if (/cosine|similarity|distance metric|nearest neighbor/i.test(text))
    fields.push("similarity-metric");
  if (/fastapi|express|api gateway|rate limit|endpoint|framework|library|tech stack/i.test(text))
    fields.push("tech-stack");
  return fields;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Post-process answer text to ensure citation markers in the answer body
 * match the citation counts in the structured bullets array.
 */
function repairAnswerCitations(
  answerText: string,
  bullets: Array<{ claim: string; citations: Array<{ sourceId: string; chunkId: string }> }>,
  citationIndexMap: Map<string, number>,
): string {
  let repaired = answerText;
  for (const bullet of bullets) {
    if (!bullet.citations || bullet.citations.length < 2) continue;
    const indices = bullet.citations
      .map((c) => citationIndexMap.get(c.chunkId))
      .filter((v): v is number => v !== undefined)
      .sort((a, b) => a - b);
    const uniqueIndices = [...new Set(indices)];
    if (uniqueIndices.length < 2) continue;

    const fullCitationStr = uniqueIndices.map((i) => `[${i}]`).join("");
    const claimPrefix = escapeRegex(bullet.claim.slice(0, 30));
    if (!claimPrefix) continue;
    const partialPattern = new RegExp(
      claimPrefix + "[^\\[]*?(\\[\\d+\\])(?!\\[\\d+\\])",
    );
    repaired = repaired.replace(partialPattern, (match) => {
      if (!match.includes(fullCitationStr)) {
        return match.replace(/(\[\d+\])+$/, fullCitationStr);
      }
      return match;
    });
  }
  return repaired;
}

function remapAnswerChunkMarkersToSourceMarkers(
  answerText: string,
  relevantChunks: Array<{ chunk: { sourceId: string } }>,
  sourceIndexBySourceId: Map<string, number>,
): { text: string; repaired: boolean; invalidMarkers: number[] } {
  const maxSourceIdx = sourceIndexBySourceId.size;
  const markers = [...answerText.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  const hasOutOfRangeMarker = markers.some((n) => n > maxSourceIdx);
  if (!hasOutOfRangeMarker) {
    return { text: answerText, repaired: false, invalidMarkers: [] };
  }

  const invalidMarkers: number[] = [];
  const remapped = answerText.replace(/\[(\d+)\]/g, (full, raw) => {
    const n = Number(raw);
    if (Number.isNaN(n) || n < 1) {
      invalidMarkers.push(n);
      return "";
    }

    if (n <= relevantChunks.length) {
      const sid = relevantChunks[n - 1]?.chunk?.sourceId;
      const mapped = sid ? sourceIndexBySourceId.get(sid) : undefined;
      if (mapped !== undefined) return `[${mapped}]`;
      invalidMarkers.push(n);
      return "";
    }

    if (n <= maxSourceIdx) {
      return `[${n}]`;
    }

    invalidMarkers.push(n);
    return "";
  });

  const dedupedGroups = remapped.replace(/(?:\[\d+\]){2,}/g, (group) => {
    const nums = [...group.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
    const uniqSorted = [...new Set(nums)].sort((a, b) => a - b);
    return uniqSorted.map((n) => `[${n}]`).join("");
  });

  const cleaned = dedupedGroups
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+\./g, ".")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    text: cleaned,
    repaired: cleaned !== answerText,
    invalidMarkers,
  };
}

// Re-export detectIntent so streaming route can use it without double-importing structuredExtractor
export { detectIntent };

/**
 * Determine a max-output-token budget based on query complexity.
 * Faster for simple queries (status, owner lookups), larger for summaries/comparisons.
 */
export function getResponseBudget(message: string, intent: string): number {
  const lower = message.toLowerCase();
  const len = message.length;
  const isDocIntent = ["OKR", "ROADMAP", "BLOCKER", "OWNER", "DEADLINE", "BUDGET", "ARCHITECTURE"].includes(intent);

  // Doc-intent answers need room for paragraph + cited bullets + follow-up.
  if (isDocIntent) {
    return 1000;
  }

  // Large budget: summarization, comparison, roadmap, architecture, or long queries
  if (
    lower.includes("summarize") ||
    lower.includes("compare") ||
    lower.includes("roadmap") ||
    lower.includes("what should i know") ||
    lower.includes("explain") ||
    lower.includes("architecture") ||
    lower.includes("overview") ||
    lower.includes("comprehensive") ||
    len > 200
  ) {
    return 1000;
  }

  // Medium budget: short owner/status lookups still need room for owner + deadline + impact
  if (
    len < 60 ||
    lower.includes("who owns") ||
    lower.includes("what is the status") ||
    lower.includes("what is the owner")
  ) {
    return 600;
  }

  return 550;
}

/**
 * Build a plain-prose system prompt for the streaming (text-mode) path.
 * Does NOT ask for JSON — output goes directly to the user as tokens.
 */
export function buildStreamingSystemPrompt(contextParts: string[], policyCtx: string): string {
  const context = contextParts.length > 0
    ? contextParts.join("\n\n---\n\n")
    : "No relevant documents found.";

  return `You are TracePilot, an enterprise execution intelligence assistant. You think like a senior colleague who has read all the documents, not a database returning records.

IMPORTANT: Do not output JSON. Write plain prose for the user — not code, not structured data, not metadata.

When answering: ONLY use information from the provided context below. If the context does not contain enough information, say so explicitly — do NOT guess or fabricate. Do not leak chunk IDs, source IDs, internal metadata, or raw document excerpts. If the query is ambiguous or vague, ask 1-2 clarifying questions before answering.

CRITICAL — NO-MATCH RULE: If the user's query is completely unrecognizable, nonsensical, or clearly unrelated to all provided context documents, respond with EXACTLY this text and nothing else: "No matching documents were found in your connected sources for this question. Try narrowing by project name, owner, or time period." Then on a new line add two clarifying questions: "Which project or initiative should I focus on?" and "Do you have a specific owner or time period in mind?"

${STRUCTURED_CONTEXT_INSTRUCTION}

Context from knowledge base:
${context}
${policyCtx}
${RESPONSE_STYLE_RULES}`;
}

export type AgentChannel = "http" | "voice" | "mcp";

export interface AgentTurnInput {
  message: string;
  userId: string;
  userRole: "admin" | "member";
  channel: AgentChannel;
  requestId?: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  topK?: number;
  workspaceId?: string;
  scopeId?: string;
}

export interface AgentTurnOutput {
  answerText: string;
  bullets: Array<{
    claim: string;
    citations: Array<{
      sourceId: string;
      sourceVersionId?: string;
      chunkId: string;
      charStart?: number;
      charEnd?: number;
      url?: string;
      label?: string;
    }>;
  }>;
  citations: Array<{
    sourceId: string;
    sourceVersionId?: string;
    chunkId: string;
    charStart?: number;
    charEnd?: number;
    url?: string;
    label?: string;
    title?: string;
    snippet?: string;
    score?: number;
  }>;
  actionDraft?: {
    type: string;
    draft: Record<string, unknown>;
    rationale: string;
    requiresApproval: boolean;
    denialReason?: string;
  };
  playbook?: unknown; // For future playbook generation
  sections?: Section[];
  framingContext?: string;
  summary?: string;
  sources?: Array<{
    id: string;
    sourceId: string;
    title: string;
    url?: string;
    locationUrl?: string;
    sourceType: string;
    sourceTypeLabel: string;
  }>;
  evidence?: Array<{
    id: string;
    title: string;
    url?: string;
    locationUrl?: string;
    connectorType: string;
    connectorLabel: string;
    whyUsed?: string;
  }>;
  relatedSources?: Array<{
    id: string;
    sourceId: string;
    title: string;
    url?: string;
    locationUrl?: string;
    sourceType: string;
    sourceTypeLabel: string;
  }>;
  keyFacts?: Array<{
    text: string;
    citations: Array<{ sourceId: string; chunkId: string; score?: number; snippet?: string }>;
  }>;
  kind?: "doc_intent" | "general";
  intentType?: "okr" | "blocker" | "roadmap" | "budget" | "generic";
  okrViewModel?: OkrAnswerViewModel;  // Enterprise-grade OKR view model with stable citations
  needsClarification?: boolean;
  clarifyingQuestions?: string[];
  detailsBlocks?: Array<{ type: string; title?: string; data: unknown }>;
  retrievedChunks?: Array<{ chunkId: string; sourceId: string; score: number; snippet: string }>;
  sourcesUsed?: Array<{
    sourceId: string;
    title?: string;
    url?: string;
    sourceType?: string;
    sourceTypeLabel?: string;
    locationUrl?: string;
  }>;
  citationIndexMap?: Record<string, number>;
  meta: {
    channel: AgentChannel;
    latencyMs: Record<string, number>;
    tokensEstimate: number;
    retrievalTopK: number;
    injectionScore: number;
    safetyActionsApplied: string[];
    traceId: string;
    intent?: string;
  };
}

/**
 * Build deduplicated sources array with locationUrl for Drive folders
 */
async function buildSourcesFromCitations(
  citations: Array<{
    sourceId: string;
    sourceVersionId?: string;
    url?: string;
    label?: string;
    title?: string;
    sourceType?: string;
  }>
): Promise<Array<{
  id: string;
  sourceId: string;
  title: string;
  url?: string;
  locationUrl?: string;
  sourceType: string;
  sourceTypeLabel: string;
}>> {
  const seenKeys = new Set<string>();
  const seenSourceIds = new Set<string>();
  const dedupedSources: any[] = [];

  for (const citation of citations) {
    // Dedup by sourceVersionId (primary) or sourceId (fallback)
    const dedupKey = citation.sourceVersionId || citation.sourceId;
    if (seenKeys.has(dedupKey)) continue;
    seenKeys.add(dedupKey);
    if (seenSourceIds.has(citation.sourceId)) continue;
    seenSourceIds.add(citation.sourceId);

    // Fetch source record
    const source = await storage.getSource(citation.sourceId);
    if (!source) continue;

    const metadata = source.metadataJson as Record<string, unknown> | null;
    let locationUrl: string | undefined;

    // Get Drive folder locationUrl from metadata (set during sync)
    if (source.type === "drive" && metadata?.parentWebViewLink) {
      locationUrl = metadata.parentWebViewLink as string;
    } else if (source.type === "drive" && metadata?.parents) {
      // Fallback: construct from parentId if parentWebViewLink not available
      const parents = metadata.parents as string[];
      if (parents.length > 0) {
        locationUrl = `https://drive.google.com/drive/folders/${parents[0]}`;
      }
    }

    // Get source type label
    const sourceTypeLabel =
      source.type === "drive" ? "Drive" :
      source.type === "slack" ? "Slack" :
      source.type === "jira" ? "Jira" :
      source.type === "confluence" ? "Confluence" :
      source.type.charAt(0).toUpperCase() + source.type.slice(1);

    dedupedSources.push({
      id: citation.sourceId,
      sourceId: citation.sourceId,
      title: citation.title || citation.label || source.title || "Untitled",
      url: citation.url,
      locationUrl,
      sourceType: source.type,
      sourceTypeLabel
    });
  }

  return dedupedSources;
}

/**
 * Build evidence array for doc_intent responses with usage tracking.
 * Returns evidence in stable order based on first citation appearance.
 */
async function buildEvidence(
  sections: any[],
  relevantChunks: any[]
): Promise<Array<{
  id: string;
  title: string;
  url?: string;
  locationUrl?: string;
  connectorType: string;
  connectorLabel: string;
  whyUsed?: string;
}>> {
  // Track which sources are used and what kind of info they provide
  // Use an array to maintain insertion order (first appearance)
  const orderedSourceIds: string[] = [];
  const sourceUsageMap = new Map<string, {
    hasTargets: boolean;
    hasOwners: boolean;
    hasStatus: boolean;
    hasDates: boolean;
    hasBudget: boolean;
    itemCount: number;
  }>();

  // Walk sections in order to track first appearance of each source
  sections.forEach((section) => {
    section.items.forEach((item: any) => {
      item.citations?.forEach((c: any) => {
        const sid = c.sourceId;
        
        // Track first appearance order
        if (!orderedSourceIds.includes(sid)) {
          orderedSourceIds.push(sid);
        }
        
        // Track what kind of info this source provides
        if (!sourceUsageMap.has(sid)) {
          sourceUsageMap.set(sid, {
            hasTargets: false,
            hasOwners: false,
            hasStatus: false,
            hasDates: false,
            hasBudget: false,
            itemCount: 0
          });
        }
        
        const usage = sourceUsageMap.get(sid)!;
        usage.itemCount++;
        if (item.target) usage.hasTargets = true;
        if (item.owner) usage.hasOwners = true;
        if (item.status) usage.hasStatus = true;
        if (item.due) usage.hasDates = true;
        if (item.current?.toLowerCase().includes('budget') || 
            section.title?.toLowerCase().includes('budget')) {
          usage.hasBudget = true;
        }
      });
    });
  });

  // If no citation-based sources found in sections (grounding failed),
  // fall back to the retrieved chunks so the evidence panel is never empty.
  if (orderedSourceIds.length === 0) {
    for (const r of relevantChunks) {
      const sid = r.chunk.sourceId;
      if (!orderedSourceIds.includes(sid)) {
        orderedSourceIds.push(sid);
      }
    }
  }

  // Build evidence in stable order (first citation appearance)
  const evidence: any[] = [];
  const seenKeys = new Set<string>();

  for (const sourceId of orderedSourceIds) {
    if (seenKeys.has(sourceId)) continue;
    seenKeys.add(sourceId);

    const source = await storage.getSource(sourceId);
    if (!source) continue;

    const metadata = source.metadataJson as Record<string, unknown> | null;

    // Extract locationUrl from metadata (Drive: parentWebViewLink)
    let locationUrl: string | undefined;
    if (source.type === "drive" && metadata?.parentWebViewLink) {
      locationUrl = metadata.parentWebViewLink as string;
    } else if (source.type === "drive" && metadata?.parents) {
      const parents = metadata.parents as string[];
      if (parents.length > 0) {
        locationUrl = `https://drive.google.com/drive/folders/${parents[0]}`;
      }
    }

    // Get connector type and label
    const connectorType = source.type === "drive" ? "drive" : source.type;
    const connectorLabel =
      source.type === "drive" ? "Drive" :
      source.type === "slack" ? "Slack" :
      source.type === "jira" ? "Jira" :
      source.type === "confluence" ? "Confluence" :
      source.type.charAt(0).toUpperCase() + source.type.slice(1);

    // Generate descriptive whyUsed based on what info was extracted
    const usage = sourceUsageMap.get(sourceId);
    let whyUsed = '';
    if (usage) {
      const parts: string[] = [];
      if (usage.hasTargets) parts.push('targets');
      if (usage.hasOwners) parts.push('owners');
      if (usage.hasStatus) parts.push('status');
      if (usage.hasDates) parts.push('dates');
      if (usage.hasBudget) parts.push('budget');
      
      if (parts.length > 0) {
        whyUsed = parts.join(', ');
      } else {
        // Fallback to item count
        whyUsed = `${usage.itemCount} item${usage.itemCount > 1 ? 's' : ''} cited`;
      }
    }

    evidence.push({
      id: sourceId,
      title: source.title,
      url: source.url || undefined,
      locationUrl,
      connectorType,
      connectorLabel,
      whyUsed
    });
  }

  return evidence;
}

/**
 * Main agent turn function - processes a user message and returns structured output
 */
export async function runAgentTurn(input: AgentTurnInput): Promise<AgentTurnOutput> {
  const startTime = Date.now();
  const latencyMs: Record<string, number> = {};
  const safetyActionsApplied: string[] = [];

  // Start trace
  const traceCtx = await tracer.startTrace("chat", input.userId, input.requestId);

  try {
    // 1. Sanitize and detect injection in user message
    const userMessageDetection = detectInjection(input.message);
    const sanitizedUserMessage = sanitizeContent(input.message, {
      maxLength: 2000,
      sourceType: "upload",
      stripMarkers: true,
    }).sanitized;

    // Detect if this is a doc-intent query (OKR, Roadmap, etc.)
    const queryIntent = detectIntent(sanitizedUserMessage);
    const isDocIntentQuery = ["OKR", "ROADMAP", "BLOCKER", "OWNER", "DEADLINE", "BUDGET", "ARCHITECTURE"].includes(queryIntent);
    console.log(`[AgentCore] Detected intent: ${queryIntent}, doc-intent: ${isDocIntentQuery}`);

    if (userMessageDetection.isSuspicious) {
      safetyActionsApplied.push("injection_detection");
      // Injection detection is synchronous, use minimal duration
      await tracer.recordSpan(traceCtx.traceId, {
        name: "injection_detection",
        kind: "validate",
        durationMs: 0,
        metadata: {
          detected: true,
          score: userMessageDetection.score,
          reasons: userMessageDetection.reasons,
          channel: input.channel,
        },
      });
    }

    // 2. Retrieve relevant chunks with workspace and visibility enforcement + FALLBACK
    const retrievalStart = Date.now();

    // Get user's workspace
    const user = await storage.getUser(input.userId);
    if (!user) {
      throw new Error(`User ${input.userId} not found`);
    }

    // CRITICAL: Use same default as orchestrator.ts:256 ('default-workspace') to ensure alignment
    const retrievalWorkspaceId = user.workspaceId || "default-workspace";

    // Use new retrieval pipeline with fallback
    const { retrieveForAnswer, requiresMultiSource, inferRetrievalIntent } = await import("../retrieval");
    const needsMultiSourceAnswer = requiresMultiSource(sanitizedUserMessage, queryIntent);
    const retrievalIntent = inferRetrievalIntent(sanitizedUserMessage);
    // ROADMAP and OKR queries need more chunks to cover all quarters/objectives
    const defaultTopK = (queryIntent === "ROADMAP" || queryIntent === "OKR") ? 15 : 8;
    const retrievalResult = await retrieveForAnswer(sanitizedUserMessage, {
      workspaceId: retrievalWorkspaceId,
      requesterUserId: input.userId,
      scopeId: input.scopeId,
    }, input.topK || defaultTopK);

    // Jira backfill now handled entirely inside retrieval.ts (no unscoped getSources escape hatch).
    const relevantChunksRaw = retrievalResult.chunks;
    latencyMs.retrievalMs = Date.now() - retrievalStart;

    // Chunk quality filter: drop numeric/XML/boilerplate garbage BEFORE prompt construction
    const { filterChunkQuality } = await import("../retrievalConfig");
    const { kept: qualityFiltered } = filterChunkQuality(relevantChunksRaw);

    // Score-based context filtering: hard floor only.
    // ROADMAP/OKR need lower threshold to capture later-quarter chunks that score lower
    const CONTEXT_SCORE_THRESHOLD = (needsMultiSourceAnswer || queryIntent === "ROADMAP" || queryIntent === "OKR") ? 0.1 : 0.25;
    const scoreFilteredChunks = qualityFiltered.filter(r => r.score >= CONTEXT_SCORE_THRESHOLD);
    const topScore = scoreFilteredChunks.length > 0 ? Math.max(...scoreFilteredChunks.map(r => r.score)) : 0;
    console.log(`[AgentCore] Score filter (floor=${CONTEXT_SCORE_THRESHOLD}): before=${qualityFiltered.length} after=${scoreFilteredChunks.length} topScore=${topScore.toFixed(3)}`);

    // Doc-level top-K selection: group by sourceId and keep only relevant docs
    const docGroups = new Map<string, { chunks: typeof scoreFilteredChunks; maxScore: number }>();
    for (const r of scoreFilteredChunks) {
      const sid = r.chunk.sourceId;
      const group = docGroups.get(sid);
      if (group) {
        group.chunks.push(r);
        group.maxScore = Math.max(group.maxScore, r.score);
      } else {
        docGroups.set(sid, { chunks: [r], maxScore: r.score });
      }
    }

    // Sort docs by max chunk score descending
    const sortedDocs = Array.from(docGroups.entries())
      .sort((a, b) => b[1].maxScore - a[1].maxScore);

    // Per-source cap: keep top-4 sources, at most 4 chunks each.
    // REMOVED the all-or-nothing isSingleDocIntent heuristic — it collapsed multi-source
    // evidence for cross-doc queries like Q8 (risk/launch) and Q2 (blockers) because
    // "risk" alone didn't match "risks across", causing single-doc collapse.
    const PER_SOURCE_CHUNK_CAP = 4;
    const MAX_SOURCES = 4;

    const keepDocIds = new Set(sortedDocs.slice(0, MAX_SOURCES).map(d => d[0]));
    const sourceChunkCount = new Map<string, number>();
    let relevantChunks = scoreFilteredChunks.filter(r => {
      const sid = r.chunk.sourceId;
      if (!keepDocIds.has(sid)) return false;
      const count = sourceChunkCount.get(sid) || 0;
      if (count >= PER_SOURCE_CHUNK_CAP) return false;
      sourceChunkCount.set(sid, count + 1);
      return true;
    });

    // Multi-source guard: ensure at least two source documents survive selection.
    if (needsMultiSourceAnswer) {
      const currentSourceIds = new Set(relevantChunks.map((r) => r.chunk.sourceId));
      if (currentSourceIds.size < 2) {
        // Prefer backup from a type-relevant source rather than any uncited source
        const backupCandidates = scoreFilteredChunks
          .filter((r) => !currentSourceIds.has(r.chunk.sourceId))
          .sort((a, b) => {
            const aTitle = (a.source?.title || "").toLowerCase();
            const bTitle = (b.source?.title || "").toLowerCase();
            const aType = (a.source?.type || "").toLowerCase();
            const bType = (b.source?.type || "").toLowerCase();
            const intentRelevant = (title: string, type: string) => {
              if (retrievalIntent === "BLOCKERS_RISK_MITIGATION") {
                return /jira|ticket|issue|blocker|meeting|allhands/.test(title) || type === "jira" ? 1 : 0;
              }
              if (retrievalIntent === "OWNER_DEADLINE_STATUS") {
                return /jira|ticket|issue|guide|reference/.test(title) || type === "jira" ? 1 : 0;
              }
              return 0;
            };
            return intentRelevant(bTitle, bType) - intentRelevant(aTitle, aType) || b.score - a.score;
          });
        const backup = backupCandidates[0];
        if (backup) {
          relevantChunks = [...relevantChunks, backup];
        }
      }

      // For blocker/risk mitigation intents, prefer including at least one ticket/issue source.
      if (retrievalIntent === "BLOCKERS_RISK_MITIGATION") {
        const hasJiraLike = relevantChunks.some((r) => {
          const type = (r.source?.type || "").toLowerCase();
          const title = (r.source?.title || "").toLowerCase();
          return type === "jira" || /\b(issue|ticket|bug)\b/.test(title);
        });
        if (!hasJiraLike) {
          const jiraCandidate = relevantChunksRaw
            .filter((r) => {
              const type = (r.source?.type || "").toLowerCase();
              const title = (r.source?.title || "").toLowerCase();
              return type === "jira" || /\b(issue|ticket|bug)\b/.test(title);
            })
            .sort((a, b) => b.score - a.score)[0];
          if (jiraCandidate && !relevantChunks.some((r) => r.chunk.id === jiraCandidate.chunk.id)) {
            relevantChunks = [...relevantChunks, jiraCandidate];
          }
        }
      }
    }

    const uniqueSourcesKept = new Set(relevantChunks.map(r => r.chunk.sourceId));
    console.log(`[AgentCore] Source selection: ${uniqueSourcesKept.size} sources, ${relevantChunks.length} chunks (cap=${PER_SOURCE_CHUNK_CAP}/src, maxSrc=${MAX_SOURCES})`);

    if (process.env.DEBUG_RETRIEVAL === "1") {
      const sourceDetails = Array.from(uniqueSourcesKept).map(sid => {
        const source = relevantChunks.find(r => r.chunk.sourceId === sid)?.source;
        const chunkCount = relevantChunks.filter(r => r.chunk.sourceId === sid).length;
        const topChunkScore = Math.max(...relevantChunks.filter(r => r.chunk.sourceId === sid).map(r => r.score));
        return `${source?.title || sid}(chunks=${chunkCount},top=${topChunkScore.toFixed(3)})`;
      });
      console.log(`[DEBUG_RETRIEVAL] query="${sanitizedUserMessage.slice(0, 80)}" intent=${queryIntent} sources=[${sourceDetails.join(", ")}]`);
    }

    // Diagnostic: Log retrieval results with fallback info
    console.log(`[AgentCore:${input.channel}] Retrieval - workspaceId=${retrievalWorkspaceId} allChunks=${retrievalResult.diagnostics.existenceChecks.chunksTotalInScope} retrieved=${relevantChunks.length} usedFallback=${retrievalResult.diagnostics.decision.usedFallback}`);

    // Record retrieval span with workspace context
    await tracer.recordSpan(traceCtx.traceId, {
      name: "retrieval",
      kind: "retrieve",
      durationMs: latencyMs.retrievalMs,
      retrievalCount: relevantChunks.length,
      similarityMin: relevantChunks.length > 0 ? Math.min(...relevantChunks.map(r => r.score)) : undefined,
      similarityMax: relevantChunks.length > 0 ? Math.max(...relevantChunks.map(r => r.score)) : undefined,
      similarityAvg: relevantChunks.length > 0 ? relevantChunks.reduce((a, r) => a + r.score, 0) / relevantChunks.length : undefined,
      metadata: {
        channel: input.channel,
        topK: input.topK || 8,
        usedFallback: retrievalResult.diagnostics.decision.usedFallback,
      },
    });

    // Zero-chunk guard: do not call LLM when no relevant chunks (or all below threshold)
    if (relevantChunks.length === 0) {
      const workContextTerms = /\b(project|owner|deadline|okr|roadmap|blocker|budget|team|launch|quarter|q[1-4]|timeline|status|assignee|responsible|risk|mitigation|architecture|document|source|sync|connector)\b/i;
      const hasWorkContext = workContextTerms.test(sanitizedUserMessage);
      const abstentionMessage = hasWorkContext
        ? "No matching documents were found in your connected sources for this question. Try narrowing by project name, owner, or time period."
        : "TracePilot answers only from your internal connected sources (documents, Jira, Confluence, Slack). This question doesn't appear to be about your connected workspace.";
      const clarifyingQuestions = hasWorkContext
        ? ["Which project or initiative should I focus on?", "Do you have a specific owner or time period in mind?"]
        : ["Would you like to search your connected documents for something specific?", "You can ask about OKRs, blockers, owners, or deadlines from your sources."];

      await tracer.endTrace(traceCtx.traceId, "completed");
      const totalLatencyMs = Date.now() - startTime;
      latencyMs.totalMs = totalLatencyMs;

      return {
        answerText: abstentionMessage,
        bullets: [],
        citations: [],
        needsClarification: true,
        clarifyingQuestions,
        meta: {
          channel: input.channel,
          latencyMs,
          tokensEstimate: 0,
          retrievalTopK: 0,
          injectionScore: userMessageDetection.score,
          safetyActionsApplied: [...safetyActionsApplied, "zero_chunk_abstention"],
          traceId: traceCtx.traceId,
          intent: queryIntent,
          retrievalChunksConsidered: 0,
          retrievalDistinctSources: 0,
          retrievalTopSimilarityScore: 0,
          retrievalFallbackUsed: retrievalResult.diagnostics.decision.usedFallback,
        },
      };
    }

    // 3. Build context from chunks (with untrusted context wrapping)
    const chunkMap = new Map<string, { chunk: ChunkType; score: number; sourceVersionId?: string }>();
    const contextParts = relevantChunks.map((r, i) => {
      chunkMap.set(r.chunk.id, { chunk: r.chunk, score: r.score, sourceVersionId: r.chunk.sourceVersionId || undefined });
      const docTitle = r.source?.title || `chunk ${r.chunk.id} from source ${r.chunk.sourceId}`;
      const keyFields = detectFieldTypes(r.chunk.text);
      const keyFieldsLine = keyFields.length > 0
        ? keyFields.join(", ")
        : "general-information";

      let chunkText = r.chunk.text;
      if (!chunkText.includes("<UNTRUSTED_CONTEXT")) {
        chunkText = `<UNTRUSTED_CONTEXT source="upload">
${chunkText}
</UNTRUSTED_CONTEXT>`;
      }
      return `SOURCE [${i + 1}]: ${docTitle}\nKEY FIELDS PRESENT: ${keyFieldsLine}\nCONTENT:\n${chunkText}`;
    });

    // Stable citation index: chunkId -> 1-based index in context
    const citationIndexMap = new Map<string, number>();
    relevantChunks.forEach((r, i) => {
      citationIndexMap.set(r.chunk.id, i + 1);
    });

    const context = contextParts.join("\n\n---\n\n");

    // 4. Get active policy for context
    const activePolicy = await storage.getActivePolicy();
    let policyContext = "";
    let parsedPolicy: PolicyYaml | null = null;

    if (activePolicy) {
      try {
        parsedPolicy = parseYaml(activePolicy.yamlText) as PolicyYaml;
        const allowedTools = parsedPolicy.roles[input.userRole]?.tools || [];
        policyContext = `\n\nUser role: ${input.userRole}\nAllowed tools: ${allowedTools.join(", ") || "none"}`;
      } catch (e) {
        console.error("Policy parse error:", e);
      }
    }

    // 5. Build system prompt
    const systemPrompt = `You are TracePilot, an enterprise execution intelligence assistant. You think like a senior colleague who has read all the documents, not a database returning records. You can propose actions using integrated tools when the user asks.

${getUntrustedContextInstruction()}

When answering:
1. ONLY use information from the provided context. If the context does not contain enough information, explicitly say so — do NOT guess or fabricate.
2. Every factual claim MUST have a citation. Cite your sources using the chunk IDs provided. Include sourceVersionId if available. Claims without citations will be treated as hallucinations.
3. If the user's query is ambiguous or too vague to answer confidently, set "needsClarification" to true and populate "clarifyingQuestions" with 1-3 specific questions. Do NOT provide a speculative answer when clarification is needed.
4. If the user asks you to do something (create a Jira ticket, post to Slack, etc.), propose an action.
5. For non-smalltalk queries, your "answer" field MUST follow RESPONSE_STYLE_RULES: insight paragraph (2-4 sentences, lead with the single most important insight; never open with "based on", "according to", or "I found"); then 2-5 full-sentence bullets with inline [N] markers; then one specific actionable follow-up (not generic). Priority and Impact in any summary table must always be populated. Never use passive voice for ownership. Never start with "I". Never end with a non-specific offer.

Available actions (if user requests): jira.create_issue, jira.update_issue, slack.post_message, confluence.upsert_page
${policyContext}

${STRUCTURED_CONTEXT_INSTRUCTION}${needsMultiSourceAnswer
  ? `\n\nIMPORTANT: This query requires cross-source synthesis. You MUST cite at least 2 distinct sources in your answer. Draw facts from different SOURCE [N] blocks.`
  : ""}

Context from knowledge base:
${context || "No relevant documents found."}
${RESPONSE_STYLE_RULES}
Respond in JSON format matching this schema:
{
  "answer": "MUST follow RESPONSE_STYLE_RULES: insight-first paragraph, bullets with [N] markers, specific follow-up. Priority and Impact never blank. No passive voice for ownership. Do not start with I. No generic closing offer.",
  "bullets": [{"claim": "a specific claim", "citations": [{"sourceId": "...", "sourceVersionId": "... (optional)", "chunkId": "...", "charStart": number (optional), "charEnd": number (optional)}]}],
  "owner": "Person name if query asks 'who' and context contains owner/assignee/lead. Otherwise omit.",
  "deadline": "Date string if query asks 'when' and context contains deadline/due/ETA. Otherwise omit.",
  "action": null or {"type": "tool.name", "draft": {...fields}, "rationale": "why this action", "citations": [...]},
  "needsClarification": false,
  "clarifyingQuestions": []
}`;

    // 6. Build messages (sanitize conversation history too)
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...(input.conversationHistory || []).slice(-10).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.role === "user" ? sanitizeContent(m.content, { maxLength: 2000, sourceType: "upload" }).sanitized : m.content,
      })),
      { role: "user", content: sanitizedUserMessage },
    ];

    // 7. Call LLM with dynamic token budget
    const llmStart = Date.now();
    const tokenBudget = getResponseBudget(input.message, queryIntent);
    const responseText = await chatCompletion(messages, { maxOutputTokens: tokenBudget, temperature: 0.2 });
    latencyMs.llmMs = Date.now() - llmStart;

    // Estimate token usage
    const tokensEstimate = Math.ceil(
      messages.reduce((a, m) => a + m.content.length, 0) / 4 +
      responseText.length / 4
    );

    // Record LLM span
    await tracer.recordSpan(traceCtx.traceId, {
      name: "llm_completion",
      kind: "llm",
      durationMs: latencyMs.llmMs,
      model: OPENAI_CHAT_MODEL,
      inputTokens: Math.ceil(messages.reduce((a, m) => a + m.content.length, 0) / 4),
      outputTokens: Math.ceil(responseText.length / 4),
      metadata: {
        channel: input.channel,
        messageCount: messages.length,
      },
    });

    // 8. Parse and validate response with repair pass
    let chatResponse: ChatResponse;
    console.log(`[AgentCore] Raw LLM response (first 500 chars): ${responseText.substring(0, 500)}`);
    const validationResult = await validateWithRepair(responseText, chatResponseSchema, 2);
    console.log(`[AgentCore] JSON validation: success=${validationResult.success}, repaired=${validationResult.repaired}, bullets=${validationResult.data?.bullets?.length || 0}`);

    if (validationResult.success && validationResult.data) {
      chatResponse = validationResult.data;

      // Log repair span if repair was needed
      if (validationResult.repaired && validationResult.repairAttempts && validationResult.repairAttempts > 0) {
        safetyActionsApplied.push("json_repair");
        await tracer.recordSpan(traceCtx.traceId, {
          name: "json_repair",
          kind: "validate",
          durationMs: 0,
          metadata: {
            repairAttempts: validationResult.repairAttempts,
            originalError: validationResult.originalError,
            channel: input.channel,
          },
        });
      }
    } else {
      // Fallback response if JSON validation fails
      chatResponse = {
        answer: responseText,
        bullets: [],
        action: null,
        needsClarification: false,
        clarifyingQuestions: [],
      };

      if (validationResult.repairAttempts && validationResult.repairAttempts > 0) {
        await tracer.recordSpan(
          traceCtx.traceId,
          {
            name: "json_validation_failed",
            kind: "validate",
            durationMs: 0,
            metadata: {
              repairAttempts: validationResult.repairAttempts,
              channel: input.channel,
            },
          },
          "failed",
          undefined,
          validationResult.originalError
        );
      }
    }

    // Structured extraction for doc-intent queries
    let structuredOutput: {
      sections?: Section[];
      framingContext?: string;
      summary?: string;
      keyFacts?: Array<{ text: string; citations: Citation[] }>;
      evidence?: Array<{
        id: string;
        title: string;
        url?: string;
        locationUrl?: string;
        connectorType: string;
        connectorLabel: string;
        whyUsed?: string;
      }>;
      kind?: "doc_intent" | "general";
      intentType?: string;
      detailsBlocks?: Array<{ type: string; title?: string; data: unknown }>;
    } | null = null;

    // OKR view model for enterprise-grade rendering (only for OKR intent)
    let okrViewModel: OkrAnswerViewModel | undefined;

    if (isDocIntentQuery) {
      try {
        console.log(`[AgentCore] Using structured extraction for ${queryIntent}`);

        // Content sanity filter: exclude chunks that look like binary/PDF boilerplate,
        // long numeric arrays, or completely unrelated content (resume headers, Elsevier).
        const GARBAGE_PATTERNS = [
          /\[PDF Document - \d+ bytes\]/i,
          /(?:\d[\d,.]{20,})/,                  // long numeric sequences
          /\bElsevier\b.*\bAll rights reserved\b/i,
          /^(?:CURRICULUM\s+VITAE|RESUME|CV\b)/im,
          /^\s*(?:[0-9a-f]{2}\s+){10,}/m,       // hex dumps
        ];
        const filteredChunks = relevantChunks.filter(r => {
          const text = r.chunk.text;
          if (!text || text.trim().length < 20) return false;
          for (const pat of GARBAGE_PATTERNS) {
            if (pat.test(text)) {
              console.log(`[AgentCore] Content filter: dropping chunk ${r.chunk.id} (matched garbage pattern)`);
              return false;
            }
          }
          return true;
        });

        if (filteredChunks.length < relevantChunks.length) {
          console.log(`[AgentCore] Content filter: ${relevantChunks.length} → ${filteredChunks.length} chunks`);
          safetyActionsApplied.push("content_sanity_filter");
        }
        let chunksForExtraction = filteredChunks.length > 0 ? filteredChunks : relevantChunks;

        // Generic source-type enforcement: filter chunks to allowed types for the retrieval intent
        {
          const { inferCanonicalSourceType, INTENT_ALLOWED_SOURCE_TYPES } = await import("../retrieval");
          const allowedTypes = INTENT_ALLOWED_SOURCE_TYPES[retrievalIntent];
          if (allowedTypes) {
            const typeFiltered = chunksForExtraction.filter(r =>
              allowedTypes.includes(inferCanonicalSourceType(r.source || {}))
            );
            if (typeFiltered.length > 0) {
              console.log(`[AgentCore] Source-type filter (${retrievalIntent}): ${chunksForExtraction.length} → ${typeFiltered.length} chunks`);
              chunksForExtraction = typeFiltered;
            } else {
              console.warn(`[AgentCore] Source-type filter removed all chunks for intent=${retrievalIntent}`);
            }
          }
        }

        // Format context string with chunk headers for extraction
        const context = chunksForExtraction.map(r =>
          `--- Chunk: ${r.chunk.id} ---\n${r.chunk.text}`
        ).join("\n\n");

        // Extract structured data using OpenAI with jsonSchema
        const extractedData = await runStructuredExtractor(
          sanitizedUserMessage,
          context,
          queryIntent
        );

        // Format chunks for validation
        const chunksForValidation = relevantChunks.map(r => ({
          chunkId: r.chunk.id,
          text: r.chunk.text,
          sourceId: r.chunk.sourceId
        }));

        // Ground and validate citations
        let groundedData = validateAndAttribute(extractedData, chunksForValidation);

        // Auto-repair pass: recover citations that failed strict grounding
        const { data: repairedData, repairCount } = repairCitations(groundedData, chunksForValidation);
        if (repairCount > 0) {
          console.log(`[AgentCore] Citation auto-repair recovered ${repairCount} citation(s)`);
          safetyActionsApplied.push("citation_auto_repair");
          groundedData = repairedData;
        }

        // Render to structured sections + metadata
        const rendered = renderExtractedData(groundedData);

        if (rendered.sections && rendered.sections.length > 0) {
          // Build evidence from only used sources (stable order by first citation)
          const evidence = await buildEvidence(rendered.sections, relevantChunks);

          // Use response composer to generate polished Markdown with citation markers
          const composed = composeEnterpriseAnswer({
            sections: rendered.sections,
            framingContext: rendered.framingContext,
            summary: rendered.summary,
            evidence,
            bullets: rendered.bullets,
            intentType: queryIntent,
          });

          structuredOutput = {
            sections: rendered.sections,
            framingContext: rendered.framingContext,
            summary: rendered.summary,
            keyFacts: composed.keyFacts,         // Citation-backed key facts
            evidence: composed.orderedSources,   // Use reordered evidence from composer
            kind: "doc_intent",
            intentType: queryIntent.toLowerCase() as any,
            detailsBlocks: [
              { type: "structured_sections", title: "Structured report", data: rendered.sections },
              { type: "key_facts", title: "Key facts", data: composed.keyFacts },
              ...(rendered.summary ? [{ type: "summary", title: "Summary", data: rendered.summary }] : []),
            ],
          };

          // Keep answer text aligned with section/bullet citations from the composed renderer.
          chatResponse.answer = composed.renderedAnswer;

          console.log(`[AgentCore] Composed answer with ${composed.orderedSources.length} ordered sources`);

          // Doc-intent citation gating: verify evidence sources have claims in the answer
          if (structuredOutput.evidence && chatResponse.answer) {
            const answerLower = chatResponse.answer.toLowerCase();
            const gatedEvidence = structuredOutput.evidence.filter(ev => {
              // Check if any section item citing this source has text that appears in the answer
              const hasClaimInAnswer = (rendered.sections ?? []).some(section =>
                section.items.some((item: any) => {
                  const citesSrc = item.citations?.some((c: any) => c.sourceId === ev.id);
                  if (!citesSrc) return false;
                  // Check if the item's claim/text appears in the rendered answer
                  const itemText = (item.claim || item.text || item.current || '').toLowerCase();
                  const words = itemText.split(/\s+/).filter((w: string) => w.length > 4);
                  if (words.length === 0) return true; // Keep if no words to check
                  const matchCount = words.filter((w: string) => answerLower.includes(w)).length;
                  return matchCount >= Math.ceil(words.length * 0.3);
                })
              );
              return hasClaimInAnswer;
            });
            if (gatedEvidence.length > 0 && gatedEvidence.length < structuredOutput.evidence.length) {
              console.log(`[AgentCore] Doc-intent citation gating: ${structuredOutput.evidence.length} → ${gatedEvidence.length} evidence sources`);
              safetyActionsApplied.push("doc_intent_citation_gating");
              structuredOutput.evidence = gatedEvidence;
            }
          }

          // Generic source-type evidence filter: remove evidence not matching allowed types
          {
            const { inferCanonicalSourceType, INTENT_ALLOWED_SOURCE_TYPES } = await import("../retrieval");
            const allowedTypes = INTENT_ALLOWED_SOURCE_TYPES[retrievalIntent];
            if (allowedTypes && structuredOutput.evidence) {
              const typeFilteredEvidence = structuredOutput.evidence.filter(
                (ev: any) => allowedTypes.includes(inferCanonicalSourceType(ev))
              );
              if (typeFilteredEvidence.length < structuredOutput.evidence.length) {
                console.log(`[AgentCore] Source-type evidence filter (${retrievalIntent}): ${structuredOutput.evidence.length} → ${typeFilteredEvidence.length}`);
                structuredOutput.evidence = typeFilteredEvidence;
                safetyActionsApplied.push("source_type_evidence_filter");
              }
            }
          }

          // Use structured bullets if available
          if (rendered.bullets && rendered.bullets.length > 0) {
            chatResponse.bullets = rendered.bullets;
          }

          console.log(`[AgentCore] Structured extraction succeeded: ${rendered.sections.length} sections, ${evidence.length} evidence items`);

          // Build OkrAnswerViewModel for OKR intent (enterprise-grade rendering)
          if (queryIntent === "OKR" && rendered.sections && rendered.sections.length > 0) {
            try {
              okrViewModel = buildOkrAnswerViewModel({
                sections: rendered.sections,
                evidence: composed.orderedSources || evidence,
                relatedSources: [], // Will be populated later from relatedCitations
                framingContext: rendered.framingContext,
                summary: rendered.summary,
              });
              // Enhanced OKR debug logging
              const totalKRs = okrViewModel.objectives.reduce((acc, obj) => acc + obj.keyResults.length, 0);
              const citedSources = okrViewModel.citationIndex.filter(c => c.kind === 'cited' || !c.kind).length;
              const contextSources = okrViewModel.sourcesRelated?.length || 0;
              const uniqueCitationIds = new Set(
                okrViewModel.objectives.flatMap(obj => 
                  obj.keyResults.flatMap(kr => kr.citationIds)
                )
              ).size;
              console.log(`[OKR Debug] KRs: ${totalKRs}, cited: ${citedSources}, context: ${contextSources}, uniqueCitations: ${uniqueCitationIds}`);
              console.log(`[AgentCore] Built OkrAnswerViewModel with ${okrViewModel.objectives.length} objectives, ${okrViewModel.citationIndex.length} citations`);
            } catch (vmError) {
              console.error("[AgentCore] Failed to build OkrAnswerViewModel:", vmError);
              // Continue without view model - DocAnswer will be used as fallback
            }
          }
        }
      } catch (error) {
        console.error("[AgentCore] Structured extraction failed, using fallback:", error);
        safetyActionsApplied.push("structured_extraction_fallback");
      }
    }

    // 9. Enrich citations with sourceVersionId, charStart/charEnd, URL, and label
    const enrichCitations = async (citations: Citation[]): Promise<Citation[]> => {
      const enrichedCitations: Citation[] = [];

      for (const citation of citations) {
        const chunkInfo = chunkMap.get(citation.chunkId);
        if (!chunkInfo) {
          enrichedCitations.push(citation);
          continue;
        }

        // Fetch source to get URL and metadata
        const source = await storage.getSource(chunkInfo.chunk.sourceId);
        if (!source) {
          enrichedCitations.push({
            ...citation,
            sourceVersionId: citation.sourceVersionId || chunkInfo.sourceVersionId,
            charStart: citation.charStart ?? chunkInfo.chunk.charStart ?? undefined,
            charEnd: citation.charEnd ?? chunkInfo.chunk.charEnd ?? undefined,
          });
          continue;
        }

        // Construct URL and label based on source type
        let url: string | undefined;
        let label: string | undefined;

        const metadata = source.metadataJson as Record<string, unknown> | null;

        switch (source.type) {
          case "slack": {
            // Slack permalink: https://workspace.slack.com/archives/CHANNEL_ID/pMESSAGE_TS
            const channelId = metadata?.channelId as string | undefined;
            const teamDomain = metadata?.teamDomain as string | undefined;
            const chunkMeta = chunkInfo.chunk.metadataJson as Record<string, unknown> | null;
            const messageTs = chunkMeta?.messageTs as string | undefined;

            if (channelId && messageTs) {
              // Convert timestamp to permalink format (remove decimal point)
              const permalinkTs = messageTs.replace(".", "");
              url = teamDomain
                ? `https://${teamDomain}.slack.com/archives/${channelId}/p${permalinkTs}`
                : `https://slack.com/archives/${channelId}/p${permalinkTs}`;
            } else if (source.url) {
              url = source.url;
            }

            const channelName = metadata?.channelName as string | undefined;
            label = channelName ? `#${channelName}` : source.title;
            break;
          }

          case "drive": {
            // Google Drive - construct deep links based on mimeType
            const fileId = (metadata?.fileId || metadata?.id) as string | undefined;
            const mimeType = metadata?.mimeType as string | undefined;
            
            if (fileId) {
              // Construct proper deep links based on Google Workspace type
              if (mimeType === "application/vnd.google-apps.document") {
                url = `https://docs.google.com/document/d/${fileId}/edit`;
              } else if (mimeType === "application/vnd.google-apps.spreadsheet") {
                url = `https://docs.google.com/spreadsheets/d/${fileId}/edit`;
              } else if (mimeType === "application/vnd.google-apps.presentation") {
                url = `https://docs.google.com/presentation/d/${fileId}/edit`;
              } else {
                // Fallback to Drive file view for other types
                url = `https://drive.google.com/file/d/${fileId}/view`;
              }
            } else {
              // Use webViewLink if available, else source.url
              url = source.url || (metadata?.webViewLink as string | undefined) || undefined;
            }
            label = source.title;
            break;
          }

          case "jira": {
            // Jira issue browse URL
            url = source.url || undefined; // Already constructed as https://domain.atlassian.net/browse/KEY
            const issueKey = metadata?.key as string | undefined;
            label = issueKey || source.title;
            break;
          }

          case "confluence": {
            // Confluence page URL
            url = source.url || undefined; // Already constructed as https://domain.atlassian.net/wiki/spaces/...
            label = source.title;
            break;
          }

          default:
            url = source.url || undefined;
            label = source.title;
        }

        enrichedCitations.push({
          ...citation,
          sourceVersionId: citation.sourceVersionId || chunkInfo.sourceVersionId,
          charStart: citation.charStart ?? chunkInfo.chunk.charStart ?? undefined,
          charEnd: citation.charEnd ?? chunkInfo.chunk.charEnd ?? undefined,
          url,
          label,
        });
      }

      return enrichedCitations;
    };

    const citationEnrichStart = Date.now();
    chatResponse.bullets = await Promise.all(
      chatResponse.bullets.map(async (bullet) => ({
        ...bullet,
        citations: await enrichCitations(bullet.citations),
      }))
    );

    if (chatResponse.action) {
      chatResponse.action = {
        ...chatResponse.action,
        citations: await enrichCitations(chatResponse.action.citations),
      };
    }
    latencyMs.citationEnrichMs = Date.now() - citationEnrichStart;

    // Contract integrity guard: citations must map to retrieved chunks only.
    const retrievedChunkIds = new Set(relevantChunks.map((r) => r.chunk.id));
    chatResponse.bullets = chatResponse.bullets.map((bullet) => {
      const deduped = new Map<string, Citation>();
      for (const c of bullet.citations || []) {
        if (!retrievedChunkIds.has(c.chunkId)) continue;
        const key = `${c.sourceId}:${c.chunkId}`;
        if (!deduped.has(key)) deduped.set(key, c);
      }
      return {
        ...bullet,
        citations: Array.from(deduped.values()),
      };
    });

    // Auto-assign citations from retrieved chunks when bullets have no valid citations
    // (e.g. LLM hallucinated chunk IDs that the contract integrity guard removed)
    {
      const bulletsNeedCitations = chatResponse.bullets.length > 0 &&
        chatResponse.bullets.every(b => !b.citations || b.citations.length === 0);
      if (bulletsNeedCitations && relevantChunks.length > 0) {
        console.log(`[AgentCore] Auto-assigning citations: ${chatResponse.bullets.length} bullets have no valid citations after integrity guard, ${relevantChunks.length} chunks available`);
        for (const bullet of chatResponse.bullets) {
          if (bullet.citations && bullet.citations.length > 0) continue;
          const claimLower = (bullet.claim || "").toLowerCase();
          const claimTerms = claimLower.split(/\s+/).filter(t => t.length > 3);
          let bestChunk = relevantChunks[0];
          let bestScore = 0;
          for (const rc of relevantChunks) {
            const chunkLower = rc.chunk.text.toLowerCase();
            let matchCount = 0;
            for (const term of claimTerms) {
              if (chunkLower.includes(term)) matchCount++;
            }
            const score = claimTerms.length > 0 ? matchCount / claimTerms.length : 0;
            if (score > bestScore) {
              bestScore = score;
              bestChunk = rc;
            }
          }
          bullet.citations = [{
            sourceId: bestChunk.chunk.sourceId,
            chunkId: bestChunk.chunk.id,
            sourceVersionId: bestChunk.chunk.sourceVersionId || undefined,
            charStart: bestChunk.chunk.charStart ?? undefined,
            charEnd: bestChunk.chunk.charEnd ?? undefined,
          }];
        }
      }
    }

    // ROOT CAUSE 3 fix: repair answer text so inline [N] counts match bullet citations.
    // Skip for doc-intent answers: composeEnterpriseAnswer already placed correct
    // source-indexed markers; running the chunk-indexed repair would corrupt them.
    const alreadyHasComposedMarkers = structuredOutput?.sections && structuredOutput.sections.length > 0;
    if (!alreadyHasComposedMarkers) {
      chatResponse.answer = repairAnswerCitations(
        chatResponse.answer,
        chatResponse.bullets,
        citationIndexMap,
      );
    }

    // 10. Policy check for action draft
    let actionDraft: AgentTurnOutput["actionDraft"] | undefined;
    if (chatResponse.action) {
      const policyResult = checkPolicy(parsedPolicy, {
        userRole: input.userRole,
        toolName: chatResponse.action.type,
        toolParams: chatResponse.action.draft,
      });

      await tracer.recordSpan(traceCtx.traceId, {
        name: "policy_check",
        kind: "validate",
        durationMs: 0,
        metadata: {
          allowed: policyResult.allowed,
          requiresApproval: policyResult.requiresApproval,
          denialReason: policyResult.denialReason,
          channel: input.channel,
        },
      });

      actionDraft = {
        type: chatResponse.action.type,
        draft: chatResponse.action.draft,
        rationale: chatResponse.action.rationale,
        requiresApproval: policyResult.requiresApproval,
        denialReason: policyResult.allowed ? undefined : policyResult.denialReason,
      };

      if (!policyResult.allowed) {
        safetyActionsApplied.push("policy_denial");
      } else if (policyResult.requiresApproval) {
        safetyActionsApplied.push("approval_required");
      }
    }

    // 11. Log audit event (with PII redaction) — non-fatal: DB encoding errors must not crash the stream
    try {
      await storage.createAuditEvent({
        requestId: input.requestId || traceCtx.requestId,
        userId: input.userId,
        role: input.userRole,
        kind: "chat",
        prompt: redactPIIFromObject(input.message) as string,
        retrievedJson: relevantChunks.map(r => ({
          chunkId: r.chunk.id,
          sourceId: r.chunk.sourceId,
          sourceVersionId: r.chunk.sourceVersionId,
          score: r.score,
        })),
        responseJson: redactPIIFromObject(chatResponse),
        policyJson: parsedPolicy,
        success: true,
        latencyMs,
        traceId: traceCtx.traceId,
      });
    } catch (auditErr) {
      console.warn("[AgentCore] createAuditEvent failed (non-fatal):", String(auditErr).slice(0, 200));
    }

    // 12. End trace successfully
    await tracer.endTrace(traceCtx.traceId, "completed");

    const totalLatencyMs = Date.now() - startTime;
    latencyMs.totalMs = totalLatencyMs;

    // 12.5. Collect cited sourceIds from bullets and sections
    const citedSourceIds = new Set<string>();
    for (const bullet of chatResponse.bullets) {
      for (const c of bullet.citations) {
        citedSourceIds.add(c.sourceId);
      }
    }
    if (structuredOutput?.sections) {
      for (const section of structuredOutput.sections) {
        for (const item of section.items) {
          if (item.citations) {
            for (const c of item.citations) {
              citedSourceIds.add(c.sourceId);
            }
          }
        }
      }
    }

    // 12.5.1. General answer composition (non-doc-intent): fix JSON dumps and add structure
    if (!isDocIntentQuery) {
      const { composeGeneralAnswer, isJsonDumpish } = await import("../rag/generalComposer");
      if (isJsonDumpish(chatResponse.answer)) {
        safetyActionsApplied.push("json_dump_cleanup");
      }
      const composed = composeGeneralAnswer(chatResponse.answer, chatResponse.bullets, citedSourceIds);
      chatResponse.answer = composed.renderedAnswer;
    }

    // 12.5.2. Citation gating for non-doc-intent: verify cited sources actually appear in answer
    if (!isDocIntentQuery && chatResponse.answer) {
      const answerLower = chatResponse.answer.toLowerCase();
      const verifiedSourceIds = new Set<string>();
      for (const bullet of chatResponse.bullets) {
        const claimWords = bullet.claim.toLowerCase().split(/\s+/).filter(w => w.length > 4);
        const inAnswer = claimWords.length > 0 &&
          claimWords.filter(w => answerLower.includes(w)).length >= Math.ceil(claimWords.length * 0.3);
        if (inAnswer) {
          for (const c of bullet.citations) {
            verifiedSourceIds.add(c.sourceId);
          }
        }
      }
      if (verifiedSourceIds.size > 0) {
        citedSourceIds.clear();
        Array.from(verifiedSourceIds).forEach(s => citedSourceIds.add(s));
      }
    }

    // Citation safety net: remove any sourceId not in the actually-retrieved chunks.
    // Prevents hallucinated sourceIds from surfacing in the final response even if
    // the citation gating passed them (e.g. bullet text overlapping answer by coincidence).
    const retrievedSourceIds = new Set(relevantChunks.map(r => r.chunk.sourceId));
    for (const sid of Array.from(citedSourceIds)) {
      if (!retrievedSourceIds.has(sid)) {
        console.log(`[AgentCore] Citation safety net: removed ungrounded sourceId ${sid}`);
        citedSourceIds.delete(sid);
      }
    }

    // Multi-source post-pass: if retrieval had >=2 sources but citations collapsed to one,
    // attach one citation from the highest-ranked uncited source to preserve cross-source evidence.
    if (needsMultiSourceAnswer && citedSourceIds.size < 2 && retrievedSourceIds.size >= 2) {
      const stopWords = new Set([
        "the", "and", "what", "when", "who", "with", "from", "that", "this", "there", "their", "about",
        "launch", "blockers", "biggest", "doing", "responsible", "deadline",
      ]);
      const queryTerms = (sanitizedUserMessage.toLowerCase().match(/[a-z0-9-]+/g) || [])
        .filter((token) => token.length > 3 && !stopWords.has(token));
      const sortedCandidates = [...relevantChunks]
        .filter((r) => !citedSourceIds.has(r.chunk.sourceId))
        .filter((r) => {
          const haystack = `${r.source?.title || ""} ${r.chunk.text.slice(0, 900)}`.toLowerCase();
          const hasQueryOverlap = queryTerms.some((term) => haystack.includes(term));
          const hasIntentSignal = /owner|deadline|due|eta|status|priority|blocker|risk|mitigation|timeline|roadmap|okr|budget|architecture|issue|ticket/.test(haystack);
          return hasQueryOverlap && hasIntentSignal;
        })
        .sort((a, b) => {
          const textA = `${a.source?.title || ""} ${a.chunk.text.slice(0, 280)}`.toLowerCase();
          const textB = `${b.source?.title || ""} ${b.chunk.text.slice(0, 280)}`.toLowerCase();
          const boost = (text: string) =>
            (/\b(jira|issue|ticket|bug)\b/.test(text) ? 0.2 : 0) +
            (/\b(meeting|allhands|blocker|risk|mitigation|deadline|owner)\b/.test(text) ? 0.1 : 0);
          return (b.score + boost(textB)) - (a.score + boost(textA));
        });
      const secondary = sortedCandidates[0];

      if (secondary) {
        const secondaryText = normalizeForGrounding(secondary.chunk.text.slice(0, 320));
        const secondaryWords = secondaryText.split(/\s+/).filter((w: string) => w.length > 3);
        const MULTI_SOURCE_OVERLAP_THRESHOLD = 0.25;
        const hasClaimLevelUse = chatResponse.bullets.some((bullet) => {
          const claimText = normalizeForGrounding(bullet.claim || "");
          const matchCount = secondaryWords.filter((w: string) => claimText.includes(w)).length;
          const overlap = secondaryWords.length > 0 ? matchCount / secondaryWords.length : 0;
          return overlap >= MULTI_SOURCE_OVERLAP_THRESHOLD;
        }) || (structuredOutput?.sections || []).some((section) =>
          section.items.some((item) => {
            const itemText = normalizeForGrounding(`${item.text} ${item.current || ""} ${item.status || ""}`);
            const matchCount = secondaryWords.filter((w: string) => itemText.includes(w)).length;
            const overlap = secondaryWords.length > 0 ? matchCount / secondaryWords.length : 0;
            return overlap >= MULTI_SOURCE_OVERLAP_THRESHOLD;
          })
        );

        if (!hasClaimLevelUse && !needsMultiSourceAnswer) {
          // Do not inject synthetic multi-source markers when the answer does not actually use this source
          // (skip guard for multi-source queries — the source already passed retrieval relevance filters).
        } else {
        const secondaryCitation: Citation = {
          sourceId: secondary.chunk.sourceId,
          sourceVersionId: secondary.chunk.sourceVersionId || undefined,
          chunkId: secondary.chunk.id,
          charStart: secondary.chunk.charStart ?? undefined,
          charEnd: secondary.chunk.charEnd ?? undefined,
          label: secondary.source?.title || undefined,
          title: secondary.source?.title || undefined,
          score: secondary.score,
          snippet: secondary.chunk.text.slice(0, 400),
        };

        if (chatResponse.bullets.length > 0) {
          chatResponse.bullets[0].citations = [...(chatResponse.bullets[0].citations || []), secondaryCitation];
        } else if (structuredOutput?.sections?.length && structuredOutput.sections[0]?.items?.length) {
          // Inject into the first section item instead of creating a synthetic meta-bullet
          const firstItem = structuredOutput.sections[0].items[0];
          firstItem.citations = [...(firstItem.citations || []), {
            sourceId: secondary.chunk.sourceId,
            chunkId: secondary.chunk.id,
            score: secondary.score,
          }];
        }

        // Also propagate to matching section items so summaryRows pick up multi-source citations
        if (structuredOutput?.sections) {
          const secondaryText = normalizeForGrounding(secondary.chunk.text.slice(0, 280));
          const secWords = secondaryText.split(/\s+/).filter((w: string) => w.length > 3);
          for (const section of structuredOutput.sections) {
            for (const item of section.items) {
              const itemText = normalizeForGrounding(
                `${item.text} ${item.owner || ""} ${item.status || ""} ${item.current || ""}`
              );
              const matchCount = secWords.filter((w: string) => itemText.includes(w)).length;
              const overlap = secWords.length > 0 ? matchCount / secWords.length : 0;
              if (overlap >= 0.5) {
                const alreadyHas = item.citations?.some((c) => c.sourceId === secondary.chunk.sourceId);
                if (!alreadyHas) {
                  item.citations = [...(item.citations || []), {
                    sourceId: secondary.chunk.sourceId,
                    chunkId: secondary.chunk.id,
                    score: secondary.score,
                  }];
                }
              }
            }
          }
        }

        citedSourceIds.add(secondary.chunk.sourceId);
        safetyActionsApplied.push("multisource_citation_postpass");

        // For doc-intent composed answers: inject the new source marker into the answer text.
        // The composer used source-indexed [1][2] markers from `composed.orderedSources`.
        // The postpass just added a new source that needs an index in the answer.
        if (alreadyHasComposedMarkers && structuredOutput?.evidence) {
          const sourceIdToIdx = new Map<string, number>();
          structuredOutput.evidence.forEach((ev, i) => sourceIdToIdx.set(ev.id, i + 1));
          if (!sourceIdToIdx.has(secondary.chunk.sourceId)) {
            sourceIdToIdx.set(secondary.chunk.sourceId, sourceIdToIdx.size + 1);
          }
          for (const bullet of chatResponse.bullets) {
            if (!bullet.citations || bullet.citations.length < 2) continue;
            const neededIndices = [...new Set(
              bullet.citations
                .map(c => sourceIdToIdx.get(c.sourceId))
                .filter((n): n is number => n !== undefined)
            )].sort((a, b) => a - b);
            if (neededIndices.length < 2) continue;
            const fullMarkers = neededIndices.map(n => `[${n}]`).join("");
            const claimPrefix = escapeRegex(bullet.claim.slice(0, 30));
            if (!claimPrefix) continue;
            const lineRe = new RegExp("^(- " + claimPrefix + "[^\\n]*?)(\\[\\d+\\](?:\\[\\d+\\])*)(.*)$", "m");
            chatResponse.answer = chatResponse.answer.replace(lineRe, (_, before, existingMarkers, after) => {
              if (existingMarkers === fullMarkers) return _;
              return before + fullMarkers + after;
            });
          }
        }
        }
      }
    }

    // Collapse multi-line bullets so [N] markers stay on the same line as their "- " prefix.
    // Repeat to handle multiple continuation lines.
    let prevAnswer = "";
    while (prevAnswer !== chatResponse.answer) {
      prevAnswer = chatResponse.answer;
      chatResponse.answer = chatResponse.answer.replace(
        /^(- .+)\n([ \t]+\S.+)/gm,
        "$1 $2",
      );
    }

    // If the answer text has no [N] markers but bullets have citations, inject markers.
    // This handles the case where the LLM puts citations only in the JSON `bullets` structure.
    if (chatResponse.bullets.length > 0 && citedSourceIds.size > 0) {
      const existingMarkers = [...(chatResponse.answer || "").matchAll(/\[(\d+)\]/g)].length;
      if (existingMarkers === 0) {
        const sourceIdToIdx = new Map<string, number>();
        let idx = 1;
        for (const bullet of chatResponse.bullets) {
          for (const cit of (bullet.citations || [])) {
            if (cit.sourceId && !sourceIdToIdx.has(cit.sourceId)) {
              sourceIdToIdx.set(cit.sourceId, idx++);
            }
          }
        }
        if (sourceIdToIdx.size > 0) {
          for (const bullet of chatResponse.bullets) {
            const markers = [...new Set(
              (bullet.citations || [])
                .map(c => sourceIdToIdx.get(c.sourceId))
                .filter((n): n is number => n !== undefined)
            )].sort((a, b) => a - b).map(n => `[${n}]`).join("");
            if (markers && bullet.claim) {
              const claimSnippet = bullet.claim.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              const re = new RegExp(`(- ${claimSnippet}[^\\n]*)`, "m");
              if (re.test(chatResponse.answer)) {
                chatResponse.answer = chatResponse.answer.replace(re, `$1 ${markers}`);
              } else {
                const lineRe = new RegExp(`(${claimSnippet}[^\\n]*)`, "m");
                if (lineRe.test(chatResponse.answer)) {
                  chatResponse.answer = chatResponse.answer.replace(lineRe, `$1 ${markers}`);
                }
              }
            }
          }
          console.log(`[AgentCore] Injected citation markers into answer text (${sourceIdToIdx.size} sources)`);
        }
      }
    }

    // Non-smalltalk answers must be grounded with actual citations, otherwise refuse safely.
    const answerMarkerCount = [...(chatResponse.answer || "").matchAll(/\[(\d+)\]/g)].length;
    const hasInlineCitationObjects = chatResponse.bullets.some((b) => (b.citations || []).length > 0);
    console.log(`[AgentCore] Citation check: intent=${queryIntent}, citedSources=${citedSourceIds.size}, answerMarkers=${answerMarkerCount}, hasInlineCitations=${hasInlineCitationObjects}, bulletCount=${chatResponse.bullets.length}`);
    // Only trigger fallback when there are genuinely no citations at all.
    // If bullets have citation objects, the answer text markers will be added by the pinning pass below.
    const needsFallback = queryIntent !== "SMALLTALK" && citedSourceIds.size === 0 && !hasInlineCitationObjects;
    if (needsFallback) {
      const partialFallback = buildPartialGroundedFallback(relevantChunks, sanitizedUserMessage);
      if (partialFallback) {
        chatResponse.bullets = partialFallback.bullets;
        // Route through enterprise formatter instead of using raw chunk snippets
        const fallbackEvidence2 = await Promise.all(
          Array.from(partialFallback.citedSourceIds).map(async (sid) => {
            const source = await storage.getSource(sid);
            return source ? {
              id: sid, title: source.title, connectorType: source.type,
              connectorLabel: source.type, whyUsed: "Partial evidence",
            } : null;
          })
        ).then(arr => arr.filter((e): e is NonNullable<typeof e> => e !== null));
        chatResponse.answer = enforceEnterpriseAnswerFormat({
          draftAnswer: "I found some relevant information in the available sources.",
          evidence: fallbackEvidence2,
          bullets: partialFallback.bullets,
          citations: partialFallback.bullets.flatMap(b => b.citations),
          intent: queryIntent,
        });
        chatResponse.needsClarification = true;
        chatResponse.clarifyingQuestions = [partialFallback.clarifyingQuestion];
        citedSourceIds.clear();
        partialFallback.citedSourceIds.forEach((sid) => citedSourceIds.add(sid));
        safetyActionsApplied.push("partial_grounded_fallback");
      } else {
        chatResponse.answer = "I couldn't find enough grounded evidence yet. Could you narrow this to one area so I can cite it reliably?";
        chatResponse.bullets = [];
        chatResponse.needsClarification = true;
        chatResponse.clarifyingQuestions = ["Do you want me to focus on timeline, owners, or blockers?"];
        citedSourceIds.clear();
        safetyActionsApplied.push("citation_refusal_guard_no_evidence");
      }
    }

    // 12.6. Build top-level citations split into used (cited) and related (retrieved but not cited)
    const seenUsedSourceIds = new Set<string>();
    const seenRelatedSourceIds = new Set<string>();
    type TopLevelCitation = {
      sourceId: string;
      sourceVersionId?: string;
      chunkId: string;
      charStart?: number;
      charEnd?: number;
      url?: string;
      label?: string;
      title?: string;
      snippet?: string;
      score?: number;
      sourceType?: string;
    };
    const usedCitations: TopLevelCitation[] = [];
    const relatedCitations: TopLevelCitation[] = [];

    for (const r of relevantChunks) {
      const sid = r.chunk.sourceId;
      const isCited = citedSourceIds.has(sid);
      const seenSet = isCited ? seenUsedSourceIds : seenRelatedSourceIds;
      const targetArr = isCited ? usedCitations : relatedCitations;

      if (seenSet.has(sid)) continue;
      seenSet.add(sid);

      const source = r.source || await storage.getSource(sid);
      const metadata = source?.metadataJson as Record<string, unknown> | null;

      // Construct URL based on source type
      let url: string | undefined;
      if (source) {
        switch (source.type) {
          case "drive": {
            const fileId = (metadata?.fileId || metadata?.id) as string | undefined;
            const mimeType = metadata?.mimeType as string | undefined;
            if (fileId) {
              if (mimeType === "application/vnd.google-apps.document") {
                url = `https://docs.google.com/document/d/${fileId}/edit`;
              } else if (mimeType === "application/vnd.google-apps.spreadsheet") {
                url = `https://docs.google.com/spreadsheets/d/${fileId}/edit`;
              } else if (mimeType === "application/vnd.google-apps.presentation") {
                url = `https://docs.google.com/presentation/d/${fileId}/edit`;
              } else {
                url = `https://drive.google.com/file/d/${fileId}/view`;
              }
            } else {
              url = source.url || (metadata?.webViewLink as string | undefined) || undefined;
            }
            break;
          }
          case "slack": {
            const channelId = metadata?.channelId as string | undefined;
            const teamDomain = metadata?.teamDomain as string | undefined;
            const chunkMeta = r.chunk.metadataJson as Record<string, unknown> | null;
            const messageTs = chunkMeta?.messageTs as string | undefined;
            if (channelId && messageTs) {
              const permalinkTs = messageTs.replace(".", "");
              url = teamDomain
                ? `https://${teamDomain}.slack.com/archives/${channelId}/p${permalinkTs}`
                : `https://slack.com/archives/${channelId}/p${permalinkTs}`;
            } else {
              url = source.url || undefined;
            }
            break;
          }
          default:
            url = source.url || undefined;
        }
      }

      targetArr.push({
        sourceId: sid,
        sourceVersionId: r.chunk.sourceVersionId || undefined,
        chunkId: r.chunk.id,
        charStart: r.chunk.charStart ?? undefined,
        charEnd: r.chunk.charEnd ?? undefined,
        url,
        label: source?.title || undefined,
        title: source?.title || undefined,
        snippet: r.chunk.text.slice(0, 600),
        score: r.score,
        sourceType: source?.type || undefined,
      });
    }

    // 13. Populate okrViewModel.sourcesRelated (empty by default, only in eval/debug mode)
    if (okrViewModel) {
      okrViewModel.sourcesRelated = [];
    }

    // 14. Deterministic enterprise style enforcement (global)
    // Skip for doc-intent answers already formatted by composeEnterpriseAnswer — 
    // re-processing would duplicate bullets and follow-up questions.
    const retrievedChunksForRewrite: RetrievedChunkForRewrite[] = relevantChunks.map((r) => ({
      chunkId: r.chunk.id,
      sourceId: r.chunk.sourceId,
      score: r.score,
      snippet: r.chunk.text.slice(0, 600),
    }));
    const allInlineCitations = chatResponse.bullets.flatMap((b) => b.citations || []);

    const alreadyComposed = (structuredOutput?.sections && structuredOutput.sections.length > 0) ||
      safetyActionsApplied.includes("partial_grounded_fallback") ||
      safetyActionsApplied.includes("citation_integrity_partial_fallback");
    if (!alreadyComposed) {
      chatResponse.answer = enforceEnterpriseAnswerFormat({
        draftAnswer: chatResponse.answer,
        evidence: (structuredOutput?.evidence || []).map((e) => ({
          id: e.id,
          title: e.title,
          url: e.url,
          locationUrl: e.locationUrl,
          connectorType: e.connectorType,
          connectorLabel: e.connectorLabel,
          whyUsed: e.whyUsed,
        })),
        bullets: chatResponse.bullets,
        citations: allInlineCitations,
        retrievedChunks: retrievedChunksForRewrite,
        intent: queryIntent,
      });
    }

    // Citation pinning moved to after remap step (see below)

    // ROOT CAUSE 4: answer quality check (log-only, never blocks response)
    {
      const { checkAnswerQuality } = await import("./answerQualityCheck");
      const qualityWarnings = checkAnswerQuality(
        chatResponse.answer,
        chatResponse.bullets,
        sanitizedUserMessage,
      );
      if (qualityWarnings.length > 0) {
        console.log(
          `[AnswerQuality] traceId=${traceCtx.traceId} warnings=${JSON.stringify(qualityWarnings)}`,
        );
        safetyActionsApplied.push(...qualityWarnings.map((w) => `quality_warn:${w.split(":")[0]}`));
      }
    }

    chatResponse.answer = sanitizeAnswerText(chatResponse.answer);

    // Citation integrity pass: normalize chunk-indexed [N] markers to source-level
    // indices so answer text aligns with top-level source-level citations.
    const sourceIndexBySourceId = buildCitationIndexMap({
      sections: structuredOutput?.sections as any,
      bullets: chatResponse.bullets as Array<{ citations?: Array<{ sourceId: string }> }>,
    });
    // Skip remap for doc-intent composed answers: composeEnterpriseAnswer already
    // placed correct source-indexed markers. Running remap would corrupt them.
    if (!alreadyComposed) {
      const repairedMarkers = remapAnswerChunkMarkersToSourceMarkers(
        chatResponse.answer,
        relevantChunks.map((r) => ({ chunk: { sourceId: r.chunk.sourceId } })),
        sourceIndexBySourceId,
      );
      if (repairedMarkers.repaired) {
        chatResponse.answer = repairedMarkers.text;
        safetyActionsApplied.push("citation_marker_remap");
        if (process.env.DEBUG_CITATIONS === "1") {
          console.log("[DEBUG_CITATIONS] marker remap applied", {
            sourceIndexEntries: Array.from(sourceIndexBySourceId.entries()),
            invalidMarkers: repairedMarkers.invalidMarkers,
          });
        }
      }
    }

    const debugCitationIntegrity =
      process.env.DEBUG_CITATION_INTEGRITY === "1" || process.env.DEBUG_CITATIONS === "1";
    if (debugCitationIntegrity) {
      console.log("[DEBUG_CITATION_INTEGRITY] source coverage", {
        retrievedSourceIds: Array.from(retrievedSourceIds),
        citedSourceIds: Array.from(citedSourceIds),
        citationIndexMap: Array.from(sourceIndexBySourceId.entries()),
        rowLevel: (structuredOutput?.sections || []).flatMap((section) =>
          section.items.map((item) => ({
            item: item.text,
            sourceIds: (item.citations || []).map((citation) => citation.sourceId),
          })),
        ),
      });
    }

    // Populate sourceIndexBySourceId from citedSourceIds if not already populated.
    // Actual pinning is consolidated into the FINAL pass below to avoid double-pinning.
    {
      if (sourceIndexBySourceId.size === 0 && citedSourceIds.size > 0) {
        let idx = 1;
        for (const sid of Array.from(citedSourceIds)) {
          if (!sourceIndexBySourceId.has(sid)) {
            sourceIndexBySourceId.set(sid, idx++);
          }
        }
      }
      // Final fallback: populate from structuredOutput.evidence when grounding failed entirely.
      // This ensures the evidence panel is never empty for doc-intent answers.
      if (sourceIndexBySourceId.size === 0 && structuredOutput?.evidence?.length) {
        let idx = 1;
        for (const ev of structuredOutput.evidence) {
          if (!sourceIndexBySourceId.has(ev.id)) {
            sourceIndexBySourceId.set(ev.id, idx++);
          }
        }
      }
    }

    // Ensure answer text has [N] markers if bullets have citations but answer doesn't
    if (sourceIndexBySourceId.size > 0 && ![...chatResponse.answer.matchAll(/\[(\d+)\]/g)].length) {
      const answerLines = chatResponse.answer.split("\n");
      const bulletLineIndices = answerLines.reduce<number[]>((acc, line, idx) => {
        if (/^\s*-\s/.test(line)) acc.push(idx);
        return acc;
      }, []);
      for (let bi = 0; bi < chatResponse.bullets.length && bi < bulletLineIndices.length; bi++) {
        const bullet = chatResponse.bullets[bi];
        if (!bullet.citations || bullet.citations.length === 0) continue;
        const indices = [...new Set(
          bullet.citations.map(c => sourceIndexBySourceId.get(c.sourceId)).filter((n): n is number => n !== undefined)
        )].sort((a, b) => a - b);
        if (indices.length === 0) continue;
        const markers = indices.map(n => `[${n}]`).join("");
        const lineIdx = bulletLineIndices[bi];
        if (!/\[\d+\]/.test(answerLines[lineIdx])) {
          answerLines[lineIdx] = answerLines[lineIdx].trimEnd() + " " + markers;
        }
      }
      chatResponse.answer = answerLines.join("\n");
    }

    // Citation integrity guard: ensure visible answer markers map to known source indices.
    const validateAnswerMarkers = () => {
      const known = new Set(Array.from(sourceIndexBySourceId.values()).map((n) => String(n)));
      const markers = [...chatResponse.answer.matchAll(/\[(\d+)\]/g)].map((m) => m[1]);
      const invalid = markers.filter((m) => !known.has(m));
      const hasExpectedCitations = chatResponse.bullets.some((bullet) => (bullet.citations || []).length > 0);
      return {
        markers,
        invalid,
        ok: invalid.length === 0 && (!hasExpectedCitations || markers.length > 0),
      };
    };

    let markerIntegrity = validateAnswerMarkers();
    if (!markerIntegrity.ok && structuredOutput?.sections?.length && structuredOutput?.evidence) {
      const repaired = composeEnterpriseAnswer({
        sections: structuredOutput.sections,
        framingContext: structuredOutput.framingContext,
        summary: structuredOutput.summary,
        evidence: structuredOutput.evidence,
        bullets: chatResponse.bullets,
      });
      chatResponse.answer = repaired.renderedAnswer;
      markerIntegrity = validateAnswerMarkers();
      safetyActionsApplied.push("citation_integrity_repair");
    }
    if (!markerIntegrity.ok) {
      const partialFallback = buildPartialGroundedFallback(relevantChunks, sanitizedUserMessage);
      if (partialFallback) {
        // Route fallback through the enterprise formatter to avoid garbled raw chunks
        const fallbackEvidence = await Promise.all(
          Array.from(partialFallback.citedSourceIds).map(async (sid) => {
            const source = await storage.getSource(sid);
            return source ? {
              id: sid, title: source.title, connectorType: source.type,
              connectorLabel: source.type, whyUsed: "Partial evidence",
            } : null;
          })
        ).then(arr => arr.filter((e): e is NonNullable<typeof e> => e !== null));

        chatResponse.bullets = partialFallback.bullets;
        chatResponse.answer = enforceEnterpriseAnswerFormat({
          draftAnswer: "I found some relevant information in the available sources.",
          evidence: fallbackEvidence,
          bullets: partialFallback.bullets,
          citations: partialFallback.bullets.flatMap(b => b.citations),
          intent: queryIntent,
        });
        chatResponse.needsClarification = true;
        chatResponse.clarifyingQuestions = [partialFallback.clarifyingQuestion];
        safetyActionsApplied.push("citation_integrity_partial_fallback");
      } else {
        chatResponse.answer = "I couldn't find enough grounded evidence yet. Could you narrow this to one area so I can cite it reliably?";
        chatResponse.bullets = [];
        chatResponse.needsClarification = true;
        chatResponse.clarifyingQuestions = ["Do you want me to focus on timeline, owners, or blockers?"];
        safetyActionsApplied.push("citation_integrity_refusal_no_evidence");
      }
    }

    // Groundedness guard for date claims + deterministic owner/date extraction safety net.
    {
      const monthPairs: Array<{ short: string; full: string }> = [
        { short: "jan", full: "january" },
        { short: "feb", full: "february" },
        { short: "mar", full: "march" },
        { short: "apr", full: "april" },
        { short: "may", full: "may" },
        { short: "jun", full: "june" },
        { short: "jul", full: "july" },
        { short: "aug", full: "august" },
        { short: "sep", full: "september" },
        { short: "oct", full: "october" },
        { short: "nov", full: "november" },
        { short: "dec", full: "december" },
      ];
      const datePattern = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?\b|\b\d{4}-\d{2}-\d{2}\b|\bQ[1-4]\s+\d{4}\b/gi;
      const normalizeDate = (value: string) => {
        let out = value.toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ").trim();
        for (const month of monthPairs) {
          out = out.replace(new RegExp(`\\b${month.short}\\b`, "g"), month.full);
        }
        return out;
      };
      const dateVariants = (value: string) => {
        const base = normalizeDate(value);
        if (!base) return [] as string[];
        const variants = new Set<string>([base]);
        for (const month of monthPairs) {
          for (const candidate of Array.from(variants)) {
            variants.add(candidate.replace(new RegExp(`\\b${month.full}\\b`, "g"), month.short));
          }
        }
        return Array.from(variants);
      };

      const answerDateMatches = [...chatResponse.answer.matchAll(datePattern)].map((m) => m[0]);

      const allowedDates = new Set<string>();
      for (const section of structuredOutput?.sections || []) {
        for (const item of section.items || []) {
          const dateFields = [item.due, (item as any).deadline, (item as any).date, item.status];
          for (const fieldValue of dateFields) {
            if (!fieldValue || typeof fieldValue !== "string") continue;
            for (const match of fieldValue.matchAll(datePattern)) {
              allowedDates.add(normalizeDate(match[0]));
            }
          }
        }
      }

      const citedChunkIds = new Set(
        chatResponse.bullets.flatMap((bullet) => (bullet.citations || []).map((citation) => citation.chunkId)),
      );
      const citedChunksForExtraction = relevantChunks
        .filter((chunkResult) => citedChunkIds.has(chunkResult.chunk.id))
        .map((chunkResult) => ({
          text: chunkResult.chunk.text,
          sourceId: chunkResult.chunk.sourceId,
          chunkId: chunkResult.chunk.id,
        }));
      const citedText = citedChunksForExtraction.map(c => c.text).join("\n");
      const normalizedCitedText = normalizeDate(citedText);
      const citedHasDate = answerDateMatches.some((dateValue) =>
        dateVariants(dateValue).some((candidate) => normalizedCitedText.includes(candidate)),
      );

      const missingDates = answerDateMatches.filter((dateValue) => {
        const variants = dateVariants(dateValue);
        if (variants.some((variant) => allowedDates.has(variant))) return false;
        return !variants.some((variant) => normalizedCitedText.includes(variant));
      });
      const asksForDeadline = /\b(deadline|when|date|due)\b/i.test(sanitizedUserMessage);
      const asksForOwner = /\b(who|owner|responsible|assignee)\b/i.test(sanitizedUserMessage);

      // Deterministic extraction: regex-scan cited chunks for owner/date when LLM missed them.
      const answerHasDate = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2}/i.test(chatResponse.answer) ||
        /\b\d{4}-\d{2}-\d{2}\b/.test(chatResponse.answer) ||
        /\bQ[1-4]\s+\d{4}\b/i.test(chatResponse.answer);
      const answerHasOwner = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/.test(chatResponse.answer);
      const needsDeterministicExtraction =
        (queryIntent === "OWNER" || queryIntent === "DEADLINE") &&
        relevantChunks.length > 0 &&
        (!answerHasDate || !answerHasOwner);

      if (needsDeterministicExtraction) {
        // Also include all retrieved chunks (not just cited) for broader coverage
        const allRetrievedForExtraction = relevantChunks.map(r => ({
          text: r.chunk.text,
          sourceId: r.chunk.sourceId,
          chunkId: r.chunk.id,
        }));
        const deterministicAttrs = extractDeterministicAttributes(allRetrievedForExtraction);
        const injectedParts: string[] = [];

        if (!answerHasOwner && deterministicAttrs.owners.length > 0 && asksForOwner) {
          injectedParts.push(`Owner: ${deterministicAttrs.owners[0]}`);
        }
        if (!answerHasDate && deterministicAttrs.deadlines.length > 0 && asksForDeadline) {
          // Add extracted dates to allowed dates so groundedness guard doesn't strip them
          for (const d of deterministicAttrs.deadlines) {
            allowedDates.add(normalizeDate(d));
          }
          injectedParts.push(`Deadline/ETA: ${deterministicAttrs.deadlines[0]}`);
        }

        if (injectedParts.length > 0) {
          // Find the first bullet or end of narrative to inject
          const bulletIdx = chatResponse.answer.indexOf("\n-");
          if (bulletIdx >= 0) {
            // Find the citation marker from the chunk that actually contains the owner/deadline
            const marker = (() => {
              const attrSourceId = deterministicAttrs.sourceId;
              if (attrSourceId) {
                const idx = sourceIndexBySourceId.get(attrSourceId);
                if (idx !== undefined) return ` [${idx}]`;
              }
              // Fallback: use first bullet's citation source
              const firstCitedSourceId = chatResponse.bullets[0]?.citations?.[0]?.sourceId;
              if (firstCitedSourceId) {
                const idx = sourceIndexBySourceId.get(firstCitedSourceId);
                if (idx !== undefined) return ` [${idx}]`;
              }
              return " [1]";
            })();
            const injectedBullet = `\n- ${injectedParts.join(", ")}${marker}`;
            chatResponse.answer = chatResponse.answer.slice(0, bulletIdx) + injectedBullet + chatResponse.answer.slice(bulletIdx);
          } else {
            chatResponse.answer = `${chatResponse.answer.trim()}\n\n- ${injectedParts.join(", ")}`;
          }
          safetyActionsApplied.push("deterministic_owner_date_injection");
          console.log(`[AgentCore] Deterministic extraction injected: ${injectedParts.join(", ")}`);
        }
      }

      if (asksForDeadline && allowedDates.size === 0 && !citedHasDate && !answerHasDate) {
        // Always try deterministic extraction from all retrieved chunks as last resort
        const deterministicAttrs2 = relevantChunks.length > 0
          ? extractDeterministicAttributes(relevantChunks.map(r => ({
              text: r.chunk.text, sourceId: r.chunk.sourceId, chunkId: r.chunk.id
            })))
          : { owners: [], deadlines: [] };
        // Protect found dates from being stripped
        for (const d of deterministicAttrs2.deadlines) {
          allowedDates.add(normalizeDate(d));
        }
        if (deterministicAttrs2.deadlines.length === 0) {
          chatResponse.answer = chatResponse.answer.replace(/\s{2,}/g, " ").replace(/\s+\./g, ".").trim();
          if (!/couldn't find a.*deadline/i.test(chatResponse.answer) && !/do you want/i.test(chatResponse.answer)) {
            chatResponse.answer = `${chatResponse.answer.trim()}\n\nI couldn't find a specific deadline in the cited sources. Would you like me to search for timeline or ETA details?`.trim();
            chatResponse.needsClarification = true;
            if (!chatResponse.clarifyingQuestions || chatResponse.clarifyingQuestions.length === 0) {
              chatResponse.clarifyingQuestions = ["Would you like me to search for timeline or ETA details?"];
            }
          }
          safetyActionsApplied.push("deadline_not_found_fallback");
        }
      }

      if (missingDates.length > 0) {
        const sentences = chatResponse.answer.split(/(?<=[.!?])\s+/);
        const filtered = sentences.filter((sentence) => {
          const normalizedSentence = normalizeDate(sentence);
          return !missingDates.some((dateValue) => dateVariants(dateValue).some((variant) => normalizedSentence.includes(variant)));
        });
        chatResponse.answer = filtered.join(" ").trim();
        safetyActionsApplied.push("ungrounded_date_dropped");
      }
    }

    const sourcesUsed = await buildSourcesFromCitations(usedCitations);

    // Deduplicate repeated content within bullet lines (collapse "X. X. [1]" → "X. [1]")
    {
      const lines = chatResponse.answer.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/^[-*•●▪]\s+/.test(lines[i])) {
          const textOnly = lines[i].replace(/^[-*•●▪]\s+/, "").replace(/\[\d+\]/g, "").trim();
          const half = Math.floor(textOnly.length / 2);
          if (half >= 30) {
            const firstHalf = textOnly.slice(0, half).trim();
            const secondHalf = textOnly.slice(half).trim();
            if (firstHalf === secondHalf || textOnly.startsWith(firstHalf + " " + firstHalf.slice(0, 10))) {
              const markers = (lines[i].match(/\[\d+\]/g) || []).join("");
              lines[i] = `- ${firstHalf}${markers ? " " + markers : ""}`;
            }
          }
        }
      }
      chatResponse.answer = lines.join("\n");
    }

    // FINAL citation pinning pass: runs after ALL answer modifications to guarantee every bullet has [N].
    {
      const existingMarkers = [...chatResponse.answer.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1])).filter(n => n > 0);
      const finalPinIdx = sourceIndexBySourceId.size > 0
        ? Math.min(...Array.from(sourceIndexBySourceId.values()))
        : existingMarkers.length > 0 ? Math.min(...existingMarkers) : 0;
      if (finalPinIdx > 0) {
        const lines = chatResponse.answer.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (/^[-*•●▪]\s+/.test(lines[i]) && !/\[\d+\]/.test(lines[i])) {
            lines[i] = `${lines[i].replace(/\r$/, "").trimEnd()} [${finalPinIdx}]`;
          }
        }
        chatResponse.answer = lines.join("\n");
      }
    }

    // Owner/deadline safety net: if query asks for a deadline but answer has none, append clarifying question.
    if ((queryIntent === "OWNER" || queryIntent === "DEADLINE") &&
        /\b(deadline|when|date|due|eta)\b/i.test(sanitizedUserMessage)) {
      const finalAnswerHasDate =
        /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2}/i.test(chatResponse.answer) ||
        /\b\d{4}-\d{2}-\d{2}\b/.test(chatResponse.answer) ||
        /\bQ[1-4]\s+\d{4}\b/i.test(chatResponse.answer);
      if (!finalAnswerHasDate && !/\?\s*$/.test(chatResponse.answer.trim())) {
        chatResponse.answer = `${chatResponse.answer.trim()}\n\nI couldn't find a specific deadline in the cited sources. Would you like me to search for timeline or ETA details?`;
        chatResponse.needsClarification = true;
        if (!chatResponse.clarifyingQuestions || chatResponse.clarifyingQuestions.length === 0) {
          chatResponse.clarifyingQuestions = ["Would you like me to search for timeline or ETA details?"];
        }
      }
    }

    // Detect trailing question in answer text and propagate needsClarification
    if (!chatResponse.needsClarification && /\?\s*$/.test(chatResponse.answer.trim())) {
      chatResponse.needsClarification = true;
      if (!chatResponse.clarifyingQuestions || chatResponse.clarifyingQuestions.length === 0) {
        const lastLine = chatResponse.answer.trim().split("\n").pop()?.trim() || "";
        if (lastLine.endsWith("?")) {
          chatResponse.clarifyingQuestions = [lastLine];
        }
      }
    }

    // 15. Return structured output (debug detailsBlocks built in routes layer)
    return {
      answerText: chatResponse.answer,
      bullets: chatResponse.bullets,
      citations: usedCitations,
      sections: structuredOutput?.sections,
      framingContext: structuredOutput?.framingContext,
      summary: structuredOutput?.summary,
      keyFacts: (structuredOutput as any)?.keyFacts,
      sources: sourcesUsed,
      relatedSources: process.env.EVAL_MODE === "1" || process.env.DEBUG_MODE === "1"
        ? await buildSourcesFromCitations(relatedCitations)
        : [],
      evidence: (structuredOutput as any)?.evidence,
      kind: (structuredOutput as any)?.kind,
      intentType: (structuredOutput as any)?.intentType,
      okrViewModel,
      needsClarification: chatResponse.needsClarification || false,
      clarifyingQuestions: chatResponse.clarifyingQuestions || [],
      detailsBlocks: structuredOutput?.detailsBlocks || [],
      retrievedChunks: retrievedChunksForRewrite,
      sourcesUsed,
      citationIndexMap: citationIndexRecord(sourceIndexBySourceId),
      actionDraft,
      meta: {
        channel: input.channel,
        latencyMs,
        tokensEstimate,
        retrievalTopK: relevantChunks.length,
        injectionScore: userMessageDetection.score,
        safetyActionsApplied,
        traceId: traceCtx.traceId,
        intent: queryIntent,
        retrievalIntent,
        retrievalChunksConsidered: relevantChunks.length,
        retrievalDistinctSources: new Set(relevantChunks.map((r) => r.chunk.sourceId)).size,
        retrievalTopSimilarityScore: relevantChunks.length > 0 ? Math.max(...relevantChunks.map((r) => r.score)) : 0,
        retrievalFallbackUsed: retrievalResult.diagnostics.decision.usedFallback,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Log failed audit event
    await storage.createAuditEvent({
      requestId: input.requestId || traceCtx.requestId,
      userId: input.userId,
      role: input.userRole,
      kind: "chat",
      prompt: redactPIIFromObject(input.message) as string,
      success: false,
      error: errorMessage,
      latencyMs,
    });

    // End trace with failure
    await tracer.endTrace(traceCtx.traceId, "failed", errorMessage);

    throw error;
  }
}
