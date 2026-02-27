import { chatResponseSchema, type Citation } from "@shared/schema";

export interface DeterministicScoringInput {
  userPrompt: string;
  answerText: string;
  citations: Citation[];
  retrievedChunks?: Array<{ chunkId?: string; sourceId?: string; snippet?: string; score?: number }>;
  mustCite?: boolean;
  expectedRefusal?: boolean;
  minLength?: number;
  maxLength?: number;
  /** When provided, retrieval recall check runs: at least one expected id must be in retrieved set. */
  expectedChunkIds?: string[];
}

export interface DeterministicScoringResult {
  formatValidRate: number;
  citationCount: number;
  citationCoverageRate: number;
  citationIntegrityRate: number;
  citationMisattributionRate: number;
  retrievalRelevanceProxy: number;
  overCitingRate: number;
  piiLeakDetected: boolean;
  mustCitePass: boolean;
  lengthPass: boolean;
  refusalPass: boolean;
  failedChecks: string[];
  /** When chunk count was zero: answer must not contain confident factual claims. */
  abstentionPass: boolean;
  /** Owner name(s) in answer must appear in at least one cited chunk. */
  ownerCitationPass: boolean;
  /** Date/deadline in answer must appear in at least one cited chunk. */
  deadlineCitationPass: boolean;
  /** When expectedChunkIds provided: at least one must be in retrieved set. */
  retrievalRecallPass: boolean;
}

const REFUSAL_PATTERNS = [
  "i don't know",
  "i do not know",
  "insufficient information",
  "not enough context",
  "cannot determine",
  "can't determine",
  "need more information",
  "please clarify",
];

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function detectRefusal(text: string): boolean {
  const normalized = text.toLowerCase();
  return REFUSAL_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function validateCitationShape(citation: Citation): boolean {
  return Boolean(citation.sourceId && citation.chunkId);
}

/** Heuristic: does text contain substantive factual claims (owners, dates) that should be cited? */
function hasSubstantiveFactualClaims(text: string): boolean {
  const t = text.toLowerCase();
  const ownerPatterns = /\b(owner|assigned to|owned by|lead is|responsible is)\s*[: is]?\s*[A-Za-z][A-Za-z0-9\s.-]{1,40}/i;
  const deadlinePatterns = /\b(deadline|due date|due by|by \d|on \d|\d{1,2}\/\d{1,2}\/\d{2,4}|Q[1-4]\s*\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s*\d{4})/i;
  return ownerPatterns.test(text) || deadlinePatterns.test(text);
}

/** Extract likely owner names from answer (simple: token after "owner", "assigned to", etc.). */
function extractOwnerMentions(text: string): string[] {
  const names: string[] = [];
  const patterns = [
    /(?:owner|assigned to|owned by|lead is|responsible is)\s*[: is]?\s*([A-Za-z][A-Za-z0-9\s.-]{2,40}?)(?=[.,;:\n]|$)/gi,
    /([A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+)?)\s+is\s+(?:the\s+)?(?:owner|assignee|lead)/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const name = m[1].trim();
      if (name.length >= 2 && name.length <= 40 && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

/** Extract date-like strings from answer for citation check. */
function extractDateMentions(text: string): string[] {
  const dates: string[] = [];
  const patterns = [
    /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/g,
    /\b(\d{1,2}-\d{1,2}-\d{2,4})\b/g,
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s*\d{4})\b/gi,
    /\b(Q[1-4]\s*\d{4})\b/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const s = (m[1] ?? m[0]).trim();
      if (s.length >= 2 && s.length <= 50 && !dates.includes(s)) dates.push(s);
    }
  }
  return dates;
}

export function runDeterministicChecks(input: DeterministicScoringInput): DeterministicScoringResult {
  const failedChecks: string[] = [];
  const sentences = splitSentences(input.answerText);
  const citationCount = input.citations.length;
  const validCitationCount = input.citations.filter(validateCitationShape).length;

  const parsed = chatResponseSchema.safeParse({
    answer: input.answerText,
    bullets: [],
    action: null,
    needsClarification: false,
    clarifyingQuestions: [],
    citations: input.citations,
  });
  const formatValidRate = parsed.success ? 1 : 0;
  if (!parsed.success) failedChecks.push("format_invalid");

  const minLength = input.minLength ?? 30;
  const maxLength = input.maxLength ?? 6000;
  const lengthPass = input.answerText.length >= minLength && input.answerText.length <= maxLength;
  if (!lengthPass) failedChecks.push("length_bounds_failed");

  const mustCitePass = !input.mustCite || citationCount > 0;
  if (!mustCitePass) failedChecks.push("must_cite_failed");

  const refusalDetected = detectRefusal(input.answerText);
  const refusalPass = input.expectedRefusal === undefined
    ? true
    : input.expectedRefusal === refusalDetected;
  if (!refusalPass) failedChecks.push("refusal_expectation_failed");

  const citationCoverageRate = sentences.length > 0
    ? Math.min(1, citationCount / sentences.length)
    : 0;
  const citationIntegrityRate = citationCount > 0 ? validCitationCount / citationCount : 1;
  const citationMisattributionRate = citationCount > 0
    ? Math.max(0, 1 - citationIntegrityRate)
    : 0;
  const overCitingRate = sentences.length > 0 && citationCount > 0
    ? Math.max(0, (citationCount - sentences.length) / Math.max(1, citationCount))
    : 0;
  if (overCitingRate > 0.5) failedChecks.push("over_citing_detected");

  const queryTerms = new Set(
    input.userPrompt
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4)
  );
  const chunkMatches = (input.retrievedChunks ?? []).map((chunk) => {
    const snippet = String(chunk.snippet ?? "").toLowerCase();
    if (!snippet || queryTerms.size === 0) return 0;
    let matches = 0;
    for (const term of queryTerms) {
      if (snippet.includes(term)) matches++;
    }
    const lexical = matches / Math.max(1, queryTerms.size);
    const score = typeof chunk.score === "number" ? Math.max(0, Math.min(1, chunk.score)) : 0;
    return (lexical * 0.6) + (score * 0.4);
  });
  const retrievalRelevanceProxy = chunkMatches.length
    ? chunkMatches.reduce((a, b) => a + b, 0) / chunkMatches.length
    : 0;
  if (retrievalRelevanceProxy < 0.35) failedChecks.push("low_retrieval_relevance");

  const piiLeakDetected = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?\d[\d\s()-]{7,}\d)/i.test(input.answerText);
  if (piiLeakDetected) failedChecks.push("pii_pattern_detected");

  const chunkCount = input.retrievedChunks?.length ?? 0;
  const abstentionPass = chunkCount > 0 || !hasSubstantiveFactualClaims(input.answerText);
  if (!abstentionPass) failedChecks.push("abstention_factual_claims_with_zero_chunks");

  const citedChunkSnippets: string[] = [];
  const chunksByKey = new Map<string, string>();
  for (const c of input.retrievedChunks ?? []) {
    const key = `${c.sourceId ?? ""}:${c.chunkId ?? ""}`;
    if (c.snippet) chunksByKey.set(key, c.snippet);
  }
  for (const cit of input.citations) {
    const snippet = cit.snippet ?? (cit as any).excerpt ?? chunksByKey.get(`${cit.sourceId}:${cit.chunkId}`);
    if (snippet) citedChunkSnippets.push(snippet);
  }
  const allCitedText = citedChunkSnippets.join(" ").toLowerCase();

  const ownerMentions = extractOwnerMentions(input.answerText);
  const ownerCitationPass =
    ownerMentions.length === 0 ||
    ownerMentions.some((name) => allCitedText.includes(name.toLowerCase().trim()));
  if (!ownerCitationPass) failedChecks.push("owner_not_in_cited_chunks");

  const dateMentions = extractDateMentions(input.answerText);
  const deadlineCitationPass =
    dateMentions.length === 0 ||
    dateMentions.some((d) => allCitedText.includes(d.toLowerCase().replace(/\s+/g, " ").trim()));
  if (!deadlineCitationPass) failedChecks.push("deadline_not_in_cited_chunks");

  const retrievedIds = new Set((input.retrievedChunks ?? []).map((c) => String(c.chunkId ?? "")).filter(Boolean));
  const expectedChunkIds = input.expectedChunkIds ?? [];
  const retrievalRecallPass =
    expectedChunkIds.length === 0 || expectedChunkIds.some((id) => retrievedIds.has(id));
  if (!retrievalRecallPass) failedChecks.push("retrieval_recall_expected_chunk_missing");

  return {
    formatValidRate,
    citationCount,
    citationCoverageRate,
    citationIntegrityRate,
    citationMisattributionRate,
    retrievalRelevanceProxy,
    overCitingRate,
    piiLeakDetected,
    mustCitePass,
    lengthPass,
    refusalPass,
    failedChecks,
    abstentionPass,
    ownerCitationPass,
    deadlineCitationPass,
    retrievalRecallPass,
  };
}
