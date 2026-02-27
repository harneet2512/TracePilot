/**
 * General Answer Composer
 *
 * Detects and fixes "JSON dumpish" answers from the LLM for non-doc-intent queries.
 * Formats answers as clear assistant prose with enterprise narrative style.
 */

import type { Citation } from "@shared/schema";
import { enforceEnterpriseAnswerFormat } from "./responseComposer";

/**
 * Detect if answer text looks like raw JSON or contains chunk/source metadata.
 */
export function isJsonDumpish(text: string): boolean {
  if (!text || text.length < 10) return false;

  const trimmed = text.trim();

  // Starts with JSON object/array
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return true;

  // Contains internal metadata field names that should never appear in user-facing text
  const metadataPatterns = [
    "metadataJson",
    "chunkIndex",
    "vectorRef",
    "sourceVersionId",
    "charStart",
    "charEnd",
    "tokenEstimate",
  ];
  const lowerText = trimmed.toLowerCase();
  const metadataHits = metadataPatterns.filter(p => lowerText.includes(p.toLowerCase()));
  if (metadataHits.length >= 2) return true;

  // Multiple JSON-like blocks: lines starting with { or containing ": "
  const jsonLikeLines = trimmed.split("\n").filter(
    line => /^\s*[{[]/.test(line) || /"\w+":\s/.test(line)
  );
  if (jsonLikeLines.length >= 3) return true;

  return false;
}

/**
 * Extract readable text from a JSON-dumpish answer string.
 * Tries to pull out the "answer" field if it's valid JSON, otherwise
 * strips JSON artifacts and returns cleaned text.
 */
function extractReadableText(raw: string): string {
  const trimmed = raw.trim();

  // Try parsing as JSON and extracting the "answer" field
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "object" && parsed !== null) {
      if (typeof parsed.answer === "string" && parsed.answer.length > 0) {
        return parsed.answer;
      }
      // Try other common fields
      for (const key of ["text", "content", "response", "summary"]) {
        if (typeof parsed[key] === "string" && parsed[key].length > 0) {
          return parsed[key];
        }
      }
    }
  } catch {
    // Not valid JSON, continue with cleanup
  }

  // Strip JSON artifacts
  let cleaned = trimmed
    .replace(/^\s*[{[\]}\s]+/gm, "")    // Leading braces/brackets
    .replace(/[{[\]}\s]+\s*$/gm, "")     // Trailing braces/brackets
    .replace(/"(\w+)":\s*/g, "")          // "key": patterns
    .replace(/,\s*$/gm, "")              // Trailing commas
    .replace(/^\s*"(.*)"\s*$/gm, "$1")   // Quoted strings
    .trim();

  return cleaned || raw;
}

function normalizePrimaryAnswerText(text: string): string {
  let cleaned = (text || "").trim();

  // Never surface "Key Facts" as primary output.
  cleaned = cleaned.replace(/^\s*(?:##?\s*)?key\s*facts[:\s-]*/im, "");

  // Strip markdown headers from primary text.
  cleaned = cleaned.replace(/^\s{0,3}#{1,6}\s+/gm, "");

  // Enterprise style: replace em dashes with regular dashes
  cleaned = cleaned.replace(/\u2014/g, "-").replace(/\u2013/g, "-");

  return cleaned.trim();
}

/**
 * Compose a general (non-doc-intent) answer with proper formatting.
 *
 * If the raw answer is JSON-dumpish, cleans it up.
 * Formats as narrative + concise bullets + a helpful follow-up.
 */
export function composeGeneralAnswer(
  rawAnswer: string,
  bullets: Array<{ claim: string; citations: Citation[] }>,
  citedSourceIds: Set<string>
): { renderedAnswer: string; usedSourceIds: Set<string> } {
  let answerText = rawAnswer;

  // If JSON-dumpish, extract readable text
  if (isJsonDumpish(rawAnswer)) {
    answerText = extractReadableText(rawAnswer);
  }

  answerText = normalizePrimaryAnswerText(answerText);

  const renderedAnswer = enforceEnterpriseAnswerFormat({
    draftAnswer: answerText,
    evidence: [],
    bullets,
    citations: bullets.flatMap((b) => b.citations || []),
    retrievedChunks: [],
  });

  return {
    renderedAnswer,
    usedSourceIds: citedSourceIds,
  };
}
