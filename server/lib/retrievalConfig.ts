/**
 * Retrieval configuration - prevents OOM by enforcing bounded candidate sets.
 * Never load more than RETRIEVAL_MAX_CANDIDATES chunks into memory.
 */

export const RETRIEVAL_TOP_K = parseInt(process.env.RETRIEVAL_TOP_K || "12", 10);
export const RETRIEVAL_PER_SOURCE_CAP = parseInt(process.env.RETRIEVAL_PER_SOURCE_CAP || "4", 10);
export const RETRIEVAL_MAX_CANDIDATES_PG = parseInt(
  process.env.RETRIEVAL_MAX_CANDIDATES_PG || process.env.RETRIEVAL_MAX_CANDIDATES || "200",
  10
);
export const RETRIEVAL_MAX_CANDIDATES_SQLITE = parseInt(process.env.RETRIEVAL_MAX_CANDIDATES_SQLITE || "1200", 10);
export const RETRIEVAL_MIN_UNIQUE_SOURCES_CROSS = parseInt(process.env.RETRIEVAL_MIN_UNIQUE_SOURCES_CROSS || "2", 10);
export const RETRIEVAL_WARM_INDEX_CHUNK_LIMIT = 5000;

export function getRetrievalMaxCandidates(isSQLite: boolean): number {
  return isSQLite ? RETRIEVAL_MAX_CANDIDATES_SQLITE : RETRIEVAL_MAX_CANDIDATES_PG;
}

// ---------------------------------------------------------------------------
// Demo golden-doc allowlist
// ---------------------------------------------------------------------------
export const DEMO_GOLDEN_TITLES = [
  "Q4_2024_OKRs",
  "Q4 2024 OKRs - Project Phoenix",
  "AI_Search_Architecture",
  "AI Search Architecture - Project Phoenix",
  "Engineering_AllHands_Oct28_2024",
  "Engineering All-Hands Meeting Notes - Oct 28, 2024",
  "Product_Roadmap_2025",
  "Product Roadmap 2025 - Project Phoenix",
  "JIRA_INFRA-1247_AWS_EU_Blocker",
  "JIRA-INFRA-1247_AWS_EU_Blocker",
  "JIRA INFRA-1247 - AWS EU Region Quota Blocker",
  "Team_Quick_Reference_Guide",
  "Team Quick Reference Guide - Project Phoenix",
];

/**
 * Normalize a document title for allowlist comparison:
 * lowercase, collapse whitespace, strip common extensions and leading/trailing junk.
 */
export function normalizeTitleForAllowlist(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/\.(md|pdf|docx?|txt|html?)$/i, "")
    .replace(/[_\-\s,]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .trim();
}

const _normalizedGolden = new Set(DEMO_GOLDEN_TITLES.map(normalizeTitleForAllowlist));

export function isDemoAllowedTitle(title: string | null | undefined): boolean {
  const norm = normalizeTitleForAllowlist(title);
  if (!norm) return false;
  if (_normalizedGolden.has(norm)) return true;
  for (const g of _normalizedGolden) {
    if (norm.startsWith(g) || g.startsWith(norm)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Chunk quality filter (applied before LLM prompt construction)
// ---------------------------------------------------------------------------
const LONG_NUMERIC_RUN = /(\d+\s+){25,}/;
const XML_HEADER = /^\s*<\?xml/;
const BOILERPLATE_RE = /All rights reserved|©\s*\d{4}/i;
const PDF_PLACEHOLDER = /\[PDF Document/;
const CONTROL_CHARS = /[\u0005\u0007\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

function normalizeControlChars(text: string): string {
  return text.replace(CONTROL_CHARS, " ");
}

export function isLowQualityChunk(text: string): boolean {
  if (!text) return true;
  const cleaned = normalizeControlChars(text);
  const len = cleaned.length;
  if (len < 80) return true;
  if (PDF_PLACEHOLDER.test(cleaned)) return true;
  const digits = (cleaned.match(/\d/g) || []).length;
  const alpha = (cleaned.match(/[a-zA-Z]/g) || []).length;
  const digitRatio = digits / len;
  const alphaRatio = alpha / len;
  if (digitRatio > 0.45 && alphaRatio < 0.35) return true;
  if (LONG_NUMERIC_RUN.test(cleaned)) return true;
  if (XML_HEADER.test(cleaned)) return true;
  if (BOILERPLATE_RE.test(cleaned) && len < 200) return true;
  return false;
}

export function filterChunkQuality<T extends { chunk: { text: string; chunkIndex: number } }>(
  items: T[],
): { kept: T[]; dropped: number } {
  const kept: T[] = [];
  let dropped = 0;
  for (const item of items) {
    if (item.chunk.chunkIndex === 0) {
      kept.push(item);
      continue;
    }
    if (isLowQualityChunk(item.chunk.text)) {
      dropped++;
    } else {
      kept.push(item);
    }
  }
  if (dropped > 0) {
    console.log(`[Retrieval] Chunk quality filter: dropped ${dropped}/${items.length} low-quality chunks`);
  }
  return { kept, dropped };
}
