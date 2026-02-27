
import { ExtractedData } from "./structuredExtractor";
import { normalizeForMatch, normalizeForGrounding } from "./textNormalizer";

interface Chunk {
    text: string;
    sourceId: string;
    chunkId: string;
}

interface CitationRef {
    sourceId: string;
    chunkId: string;
}

export interface AttributedItem {
    _citations?: { sourceId: string; chunkId: string; score: number }[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

const GROUNDING_STOPWORDS = new Set([
    "the", "and", "for", "with", "that", "this", "from", "have", "has", "are", "was", "were",
    "been", "into", "about", "what", "when", "where", "which", "while", "their", "there",
    "will", "would", "should", "could", "our", "your", "they", "them", "than", "then", "also",
    "only", "more", "most", "very", "into", "onto", "over", "under", "each", "such", "just",
]);

function groundingTokens(input: string): string[] {
    return normalizeForGrounding(input)
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !GROUNDING_STOPWORDS.has(token));
}

function tokenOverlapScore(left: string, right: string): number {
    const leftTokens = groundingTokens(left);
    const rightTokenSet = new Set(groundingTokens(right));
    if (leftTokens.length === 0 || rightTokenSet.size === 0) return 0;
    let overlap = 0;
    for (const token of leftTokens) {
        if (rightTokenSet.has(token)) overlap += 1;
    }
    return overlap / leftTokens.length;
}

/**
 * Validate model-provided citations against chunk text.
 * Exported so repairCitations can reuse it.
 */
export function validateCitationList(
    itemCitations: any[],
    chunks: Chunk[]
): { sourceId: string; chunkId: string; score: number }[] {
    if (!itemCitations || !Array.isArray(itemCitations)) return [];

    const validated: { sourceId: string; chunkId: string; score: number }[] = [];
    const seen = new Set<string>();

    for (const c of itemCitations) {
        if (!c || !c.chunkId) continue;

        const chunk = chunks.find(ch => ch.chunkId === c.chunkId);
        if (chunk) {
            if (c.quote) {
                const normText = normalizeForGrounding(chunk.text);
                const normQuote = normalizeForGrounding(c.quote);

                if (normText && normQuote && normText.includes(normQuote)) {
                    const key = `${chunk.sourceId}:${chunk.chunkId}`;
                    if (!seen.has(key)) {
                        validated.push({ sourceId: chunk.sourceId, chunkId: chunk.chunkId, score: 1 });
                        seen.add(key);
                    }
                } else {
                    // Fallback matcher for robust grounding when the quote is partial/noisy.
                    const overlap = tokenOverlapScore(c.quote, chunk.text);
                    if (overlap >= 0.45) {
                        const key = `${chunk.sourceId}:${chunk.chunkId}`;
                        if (!seen.has(key)) {
                            validated.push({ sourceId: chunk.sourceId, chunkId: chunk.chunkId, score: overlap });
                            seen.add(key);
                        }
                        console.log(`[Grounding] Fallback match by token overlap=${overlap.toFixed(2)} chunk=${chunk.chunkId}`);
                    } else {
                        console.log(`[Grounding] Fail: Quote not found in chunk. Chunk=${chunk.chunkId} overlap=${overlap.toFixed(2)}`);
                    }
                }
            } else {
                const key = `${chunk.sourceId}:${chunk.chunkId}`;
                if (!seen.has(key)) {
                    validated.push({ sourceId: chunk.sourceId, chunkId: chunk.chunkId, score: 1 });
                    seen.add(key);
                }
            }
        } else {
            console.log(`[Grounding] Fail: Chunk not found for ID: ${c.chunkId}. Available: ${chunks.map(ch => ch.chunkId).join(", ")}`);
        }
    }
    return validated;
}

function normalizeFieldValue(value: string): string {
    return normalizeForGrounding(value).replace(/\s+/g, " ").trim();
}

function normalizeDateValue(value: string): string {
    return normalizeFieldValue(value).replace(/,/g, "");
}

const MONTH_VARIANTS = [
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

function dateVariants(value: string): string[] {
    const normalized = normalizeDateValue(value);
    if (!normalized) return [];
    const variants = new Set<string>([normalized]);
    for (const month of MONTH_VARIANTS) {
        const next = new Set<string>();
        for (const candidate of variants) {
            next.add(candidate);
            next.add(candidate.replace(new RegExp(`\\b${month.short}\\b`, "g"), month.full));
            next.add(candidate.replace(new RegExp(`\\b${month.full}\\b`, "g"), month.short));
        }
        for (const candidate of next) variants.add(candidate);
    }
    return Array.from(variants);
}

function expandOwnerIfPossible(rawOwner: string, citedTexts: string[]): string {
    const owner = rawOwner.trim();
    if (!owner || owner.includes(" ")) return owner;

    const escaped = owner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const fullNamePattern = new RegExp(`\\b(${escaped}\\s+[A-Z][a-z]+)\\b`, "i");
    for (const text of citedTexts) {
        const match = text.match(fullNamePattern);
        if (match?.[1]) return match[1];
    }
    return owner;
}

function appearsInCitedText(value: string, citedTexts: string[], type: "date" | "generic"): boolean {
    if (!value.trim()) return false;
    const normValue = type === "date" ? dateVariants(value) : [normalizeFieldValue(value)];
    if (normValue.length === 0 || !normValue[0]) return false;
    return citedTexts.some((text) => {
        const normTextVariants = type === "date" ? dateVariants(text) : [normalizeFieldValue(text)];
        return normTextVariants.some((normText) => normValue.some((candidate) => normText.includes(candidate)));
    });
}

export function validateStructuredFields(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    item: any,
    validCitations: { sourceId: string; chunkId: string; score: number }[],
    chunks: Chunk[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
    if (!item || !validCitations || validCitations.length === 0) return item;
    const citedTexts = validCitations
        .map((citation) => chunks.find((chunk) => chunk.chunkId === citation.chunkId)?.text || "")
        .filter(Boolean);

    if (citedTexts.length === 0) return item;

    const next = { ...item };

    // Owner/person must be present in cited text. Try to expand short owner tokens.
    if (typeof next.owner === "string" && next.owner.trim()) {
        const expanded = expandOwnerIfPossible(next.owner, citedTexts);
        if (!appearsInCitedText(expanded, citedTexts, "generic")) {
            console.log(`[Grounding:FieldDrop] owner dropped (not found in cited text): "${next.owner}"`);
            next.owner = null;
        } else {
            next.owner = expanded;
        }
    }
    if (typeof next.person === "string" && next.person.trim()) {
        const expanded = expandOwnerIfPossible(next.person, citedTexts);
        if (!appearsInCitedText(expanded, citedTexts, "generic")) {
            console.log(`[Grounding:FieldDrop] person dropped (not found in cited text): "${next.person}"`);
            next.person = null;
        } else {
            next.person = expanded;
        }
    }

    // Date/deadline/due must be present in cited text.
    if (typeof next.deadline === "string" && next.deadline.trim()) {
        if (!appearsInCitedText(next.deadline, citedTexts, "date")) {
            console.log(`[Grounding:FieldDrop] deadline dropped (not found in cited text): "${next.deadline}"`);
            next.deadline = null;
        }
    }
    if (typeof next.due === "string" && next.due.trim()) {
        if (!appearsInCitedText(next.due, citedTexts, "date")) {
            console.log(`[Grounding:FieldDrop] due dropped (not found in cited text): "${next.due}"`);
            next.due = null;
        }
    }
    if (typeof next.date === "string" && next.date.trim()) {
        if (!appearsInCitedText(next.date, citedTexts, "date")) {
            console.log(`[Grounding:FieldDrop] date dropped (not found in cited text): "${next.date}"`);
            next.date = null;
        }
    }

    return next;
}

export function validateAndAttribute(
    data: ExtractedData,
    chunks: Chunk[]
): ExtractedData {
    if (["OKR", "ROADMAP", "BLOCKER", "OWNER", "DEADLINE", "BUDGET", "ARCHITECTURE"].includes(data.type)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const validItems = data.data.items.map((item: any) => {
            const validCits = validateCitationList(item.citations, chunks);

            if (validCits.length === 0 && process.env.EVAL_MODE === '1') {
                return null;
            }

            const validatedFields = validateStructuredFields(item, validCits, chunks);
            validatedFields._citations = validCits;
            return validatedFields;
        }).filter((i: any) => i !== null);

        return { ...data, data: { ...data.data, items: validItems } };
    }

    if (data.type === "GENERAL") {
        const findCitation = (text: string) => {
            const norm = normalizeForMatch(text);
            if (!norm) return [];
            return chunks.filter(c => normalizeForMatch(c.text).includes(norm))
                .map(c => ({ sourceId: c.sourceId, chunkId: c.chunkId, score: 1 }));
        };

        const validFacts = data.data.facts.map((fact: string) => {
            const cits = findCitation(fact);
            if (cits.length === 0) return null;
            return fact;
        }).filter((f: any) => f !== null);

        return { ...data, data: { ...data.data, facts: validFacts } };
    }

    return data;
}

/**
 * Deterministic attribute extraction from cited chunks.
 * Runs regex patterns against the actual cited text to extract owner names and
 * deadlines/dates. Used as a safety net when the LLM fails to extract these fields.
 * Only extracts from chunks that are CITED (grounded).
 */
export function extractDeterministicAttributes(
    citedChunks: Array<{ text: string; sourceId: string; chunkId: string }>,
): { owners: string[]; deadlines: string[]; sourceId?: string } {
    const owners: string[] = [];
    const deadlines: string[] = [];
    const seenOwners = new Set<string>();
    const seenDeadlines = new Set<string>();
    let primarySourceId: string | undefined;

    const OWNERSHIP_PATTERNS = [
        /(?:Owner|Assigned\s+to|Responsible|Lead|Assignee|Point\s+of\s+Contact)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
        /(?:Infrastructure\s+Lead|Team\s+Lead|Engineering\s+Lead|Project\s+Lead)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
    ];

    const DATE_PATTERNS = [
        /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,?\s*\d{4})?\b/gi,
        /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s*,?\s*\d{4}\b/gi,
        /\b\d{4}-\d{2}-\d{2}\b/g,
        /\bQ[1-4]\s+\d{4}\b/gi,
    ];

    const DEADLINE_CONTEXT_PATTERNS = [
        /(?:deadline|due\s+date|ETA|target\s+date|due\s+by|expected\s+by|resolution\s+ETA|completion)[:\s]+([^\n.;]{4,40})/gi,
    ];

    for (const chunk of citedChunks) {
        const text = chunk.text;

        for (const pattern of OWNERSHIP_PATTERNS) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const owner = match[1].trim();
                const key = owner.toLowerCase();
                if (!seenOwners.has(key) && owner.length > 3) {
                    seenOwners.add(key);
                    owners.push(owner);
                    if (!primarySourceId) primarySourceId = chunk.sourceId;
                }
            }
        }

        for (const pattern of DEADLINE_CONTEXT_PATTERNS) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const value = match[1].trim();
                const key = value.toLowerCase();
                if (!seenDeadlines.has(key) && value.length > 3) {
                    seenDeadlines.add(key);
                    deadlines.push(value);
                    if (!primarySourceId) primarySourceId = chunk.sourceId;
                }
            }
        }

        for (const pattern of DATE_PATTERNS) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const dateStr = match[0].trim();
                const key = dateStr.toLowerCase();
                if (!seenDeadlines.has(key)) {
                    seenDeadlines.add(key);
                    deadlines.push(dateStr);
                    if (!primarySourceId) primarySourceId = chunk.sourceId;
                }
            }
        }
    }

    if (owners.length > 0 || deadlines.length > 0) {
        console.log(`[Grounding:DeterministicExtract] owners=[${owners.join(", ")}] deadlines=[${deadlines.join(", ")}] sourceId=${primarySourceId}`);
    }

    return { owners, deadlines, sourceId: primarySourceId };
}

/**
 * Citation auto-repair pass.
 * For items where validateAndAttribute failed to ground citations,
 * attempt a lexical fuzzy match against chunk text to recover citations.
 * This avoids an extra LLM call — we simply search for key terms from the item
 * in the available chunks and assign the best-matching chunk as a citation.
 */
export function repairCitations(
    data: ExtractedData,
    chunks: Chunk[]
): { data: ExtractedData; repairCount: number } {
    let repairCount = 0;

    if (!["OKR", "ROADMAP", "BLOCKER", "OWNER", "DEADLINE", "BUDGET"].includes(data.type)) {
        return { data, repairCount: 0 };
    }

    const repairedItems = data.data.items.map((item: any) => {
        // If item already has valid citations, skip
        if (item._citations && item._citations.length > 0) {
            return item;
        }

        // Attempt lexical repair: build a search string from item fields
        const searchTerms: string[] = [];
        // Generic fields
        if (item.objective) searchTerms.push(item.objective);
        if (item.title) searchTerms.push(item.title);
        if (item.owner) searchTerms.push(item.owner);
        if (item.target) searchTerms.push(item.target);
        if (item.current) searchTerms.push(item.current);
        if (item.status) searchTerms.push(item.status);
        if (item.description) searchTerms.push(item.description);
        // BLOCKER-specific fields
        if (item.blocker) searchTerms.push(item.blocker);
        if (item.impact) searchTerms.push(item.impact);
        // ROADMAP-specific fields
        if (item.milestone) searchTerms.push(item.milestone);
        if (item.details) searchTerms.push(item.details);
        if (item.date) searchTerms.push(item.date);
        // OKR key results (array): include first KR result text
        if (Array.isArray(item.keyResults) && item.keyResults[0]?.result) {
            searchTerms.push(item.keyResults[0].result);
        }
        // OWNER/DEADLINE-specific fields
        if (item.responsibility) searchTerms.push(item.responsibility);
        if (item.person) searchTerms.push(item.person);
        if (item.task) searchTerms.push(item.task);
        if (item.deadline) searchTerms.push(item.deadline);
        // BUDGET-specific fields
        if (item.category) searchTerms.push(item.category);
        if (item.amount) searchTerms.push(item.amount);

        const searchString = normalizeForGrounding(searchTerms.join(" "));
        if (!searchString) return item;

        // Score each chunk with normalized token overlap.
        // Collect all chunks meeting threshold and allow multiple chunks per item.
        const searchWords = groundingTokens(searchString);
        const REPAIR_THRESHOLD = 0.3;
        const MAX_REPAIR_CITATIONS = 3;

        const candidateChunks: Array<{ chunk: Chunk; score: number }> = [];
        for (const chunk of chunks) {
            const chunkTokens = new Set(groundingTokens(chunk.text));
            if (searchWords.length === 0 || chunkTokens.size === 0) continue;
            let overlap = 0;
            for (const word of searchWords) {
                if (chunkTokens.has(word)) overlap++;
            }
            const score = overlap / searchWords.length;
            if (score >= REPAIR_THRESHOLD) {
                candidateChunks.push({ chunk, score });
            }
        }

        // Sort descending and keep the best matching chunks (multiple chunks/source allowed).
        candidateChunks.sort((a, b) => b.score - a.score);
        const repairedCitations: Array<{ sourceId: string; chunkId: string; score: number }> = [];
        for (const { chunk, score } of candidateChunks) {
            if (repairedCitations.length >= MAX_REPAIR_CITATIONS) break;
            const duplicate = repairedCitations.some((c) => c.chunkId === chunk.chunkId);
            if (duplicate) continue;
            repairedCitations.push({ sourceId: chunk.sourceId, chunkId: chunk.chunkId, score });
        }

        if (repairedCitations.length > 0) {
            console.log(`[Grounding:Repair] Recovered ${repairedCitations.length} citation(s) (topScore=${repairedCitations[0].score.toFixed(2)})`);
            repairCount++;
            return { ...item, _citations: repairedCitations };
        }

        // In EVAL_MODE, drop items we can't repair
        if (process.env.EVAL_MODE === '1') {
            console.log(`[Grounding:Repair] Could not repair item, dropping (EVAL_MODE)`);
            return null;
        }

        // In production, keep with empty citations
        return item;
    }).filter((i: any) => i !== null);

    return {
        data: { ...data, data: { ...data.data, items: repairedItems } },
        repairCount,
    };
}

/**
 * Compute unique source IDs used by citations that are grounded in retrieved chunks.
 */
export function computeSourcesUsed(
    citations: CitationRef[],
    retrievedChunks: Chunk[]
): string[] {
    const validChunkIds = new Set(retrievedChunks.map((chunk) => chunk.chunkId));
    const sources = new Set<string>();

    for (const citation of citations || []) {
        if (!citation?.sourceId || !citation?.chunkId) continue;
        if (!validChunkIds.has(citation.chunkId)) continue;
        sources.add(citation.sourceId);
    }

    return Array.from(sources);
}
