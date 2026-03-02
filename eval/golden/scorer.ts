/**
 * Groundedness Scorer - NO LLM required
 * Validates claims against cited evidence using lexical matching
 */

import type { ExpectedFact, EvalCase } from "./cases";

export interface Claim {
  text: string;
  // Numbers/dates/names extracted from the claim
  extractedValues: string[];
  // Source IDs cited for this claim
  citedSourceIds: string[];
}

export interface GroundednessResult {
  // Overall metrics
  groundedClaimRate: number;
  hallucinationCount: number;
  numericMismatchCount: number;
  citationCoverageRate: number;
  multiSourceSupportRate: number;

  // Per-claim details
  claims: ClaimResult[];

  // Expected facts validation
  expectedFactsFound: number;
  expectedFactsMissing: string[];

  // Pass/fail
  passed: boolean;
  failures: string[];
}

export interface ClaimResult {
  claim: string;
  isGrounded: boolean;
  isNumericMatch: boolean;
  hasCitation: boolean;
  matchedEvidence: string[];
  missingValues: string[];
}

// Patterns to extract numbers, dates, percentages
// Tightened to avoid false positives: require $ or 2+ digits, or K/M/% suffix
const NUMBER_PATTERN = /\$[\d,]+(?:\.\d+)?(?:K|M)?|[\d,]{2,}(?:\.\d+)?(?:K|M|%)/gi;
const DATE_PATTERN = /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*\d{4})?/gi;
const NAME_PATTERN = /(?:Jordan|Alex|Sarah|Mike|Jennifer)\s+[A-Z][a-z]+/g;

/**
 * Extract atomic claims from answer text
 * Splits by sentences and bullet points
 */
export function extractClaims(answer: string): string[] {
  // Split by sentences, bullets, and newlines
  const parts = answer
    .split(/(?<=[.!?])\s+|\n[-•*]\s*|\n\d+\.\s*|\n{2,}/)
    .map(s => s.trim())
    .filter(s => s.length > 10) // Filter out very short fragments
    .filter(s => {
      // Exclude generic preamble/boilerplate that is not from evidence
      const lower = s.toLowerCase();
      return !lower.startsWith("based on the documents") &&
             !lower.startsWith("here's what i") &&
             !lower.startsWith("i couldn't find");
    });

  return parts;
}

/**
 * Extract values (numbers, dates, names) from text
 */
export function extractValues(text: string): string[] {
  const values: string[] = [];

  // Extract numbers
  const numbers = text.match(NUMBER_PATTERN) || [];
  values.push(...numbers.map(n => n.replace(/,/g, "")));

  // Extract dates
  const dates = text.match(DATE_PATTERN) || [];
  values.push(...dates);

  // Extract names
  const names = text.match(NAME_PATTERN) || [];
  values.push(...names);

  return [...new Set(values)];
}

/**
 * Normalize text for comparison
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if a value appears in the evidence text
 * Handles number formatting variations
 */
function valueAppearsInEvidence(value: string, evidence: string): boolean {
  const normalizedValue = value.toLowerCase().replace(/,/g, "");
  // Strip commas from evidence too — fixes date matching (e.g., "October 15, 2024")
  const normalizedEvidence = evidence.toLowerCase().replace(/,/g, "");

  // Direct match
  if (normalizedEvidence.includes(normalizedValue)) {
    return true;
  }

  // Handle number variations (e.g., $2,565,000 vs $2.565M)
  if (/^\$?\d+/.test(value)) {
    // Convert to base number for comparison
    let numValue = parseFloat(value.replace(/[$,]/g, ""));
    if (value.toUpperCase().endsWith("K")) numValue *= 1000;
    if (value.toUpperCase().endsWith("M")) numValue *= 1000000;

    // Check for various formats in evidence (locale-independent)
    // Format numbers manually to avoid toLocaleString() system dependency
    const withCommas = numValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const patterns = [
      numValue.toString(),
      withCommas,
      `$${numValue}`,
      `$${withCommas}`,
      `${numValue / 1000}k`,
      `${numValue / 1000000}m`,
      `$${numValue / 1000}k`,
      `$${numValue / 1000000}m`,
    ];

    for (const pattern of patterns) {
      if (normalizedEvidence.includes(pattern.toLowerCase())) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if claim is grounded in evidence
 */
function isClaimGrounded(
  claim: string,
  evidence: string[],
  extractedValues: string[]
): { grounded: boolean; numericMatch: boolean; matchedEvidence: string[]; missingValues: string[] } {
  const combinedEvidence = evidence.join(" ");
  const normalizedClaim = normalizeText(claim);
  const normalizedEvidence = normalizeText(combinedEvidence);

  // Verbatim containment guard: if the normalized claim is a substring
  // of the normalized evidence, it is grounded by definition
  const isVerbatim = normalizedEvidence.includes(normalizedClaim);

  // Check for key term overlap (must have substantial content match)
  const claimWords = normalizedClaim.split(" ").filter(w => w.length > 3);
  const matchedWords = claimWords.filter(w => normalizedEvidence.includes(w));
  const wordOverlapRate = claimWords.length > 0 ? matchedWords.length / claimWords.length : 0;

  // Check numeric/date values
  const missingValues: string[] = [];
  for (const value of extractedValues) {
    if (!valueAppearsInEvidence(value, combinedEvidence)) {
      missingValues.push(value);
    }
  }

  const numericMatch = missingValues.length === 0;
  const grounded = isVerbatim || (wordOverlapRate >= 0.3 && numericMatch);

  return {
    grounded,
    numericMatch,
    matchedEvidence: evidence.filter(e => normalizeText(e).split(" ").some(w => claimWords.includes(w))),
    missingValues,
  };
}

/**
 * Check if expected fact is present in answer
 */
function isExpectedFactPresent(fact: ExpectedFact, answer: string): boolean {
  // Strip commas from answer too, so "November 15, 2024" matches "november 15 2024"
  const normalizedAnswer = answer.toLowerCase().replace(/,/g, "");

  // Check if required values are present
  if (fact.requiredValues) {
    for (const value of fact.requiredValues) {
      const normalizedValue = value.toLowerCase().replace(/,/g, "");
      if (!normalizedAnswer.includes(normalizedValue)) {
        // Try alternative formats for numbers
        if (/^\$?\d/.test(value)) {
          let found = false;
          let numValue = parseFloat(value.replace(/[$,]/g, ""));
          if (value.endsWith("K")) numValue *= 1000;
          if (value.endsWith("M")) numValue *= 1000000;

          const alternatives = [
            numValue.toString(),
            numValue.toLocaleString(),
            `${numValue / 1000}k`,
            `${numValue / 1000000}m`,
          ];

          for (const alt of alternatives) {
            if (normalizedAnswer.includes(alt.toLowerCase())) {
              found = true;
              break;
            }
          }

          if (!found) return false;
        } else {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * Main scoring function
 */
export function scoreGroundedness(
  answer: string,
  sources: { id: string; title: string; text?: string }[],
  chunks: { sourceId: string; text: string }[],
  evalCase: EvalCase
): GroundednessResult {
  const failures: string[] = [];

  // Extract claims from answer
  const claimTexts = extractClaims(answer);
  const claims: ClaimResult[] = [];

  let groundedCount = 0;
  let hallucinationCount = 0;
  let numericMismatchCount = 0;
  let citedCount = 0;
  let multiSourceCount = 0;

  // Build evidence map by source
  const evidenceBySource = new Map<string, string[]>();
  for (const chunk of chunks) {
    const existing = evidenceBySource.get(chunk.sourceId) || [];
    existing.push(chunk.text);
    evidenceBySource.set(chunk.sourceId, existing);
  }

  // Score each claim
  for (const claimText of claimTexts) {
    const extractedValues = extractValues(claimText);

    // Get all evidence from all chunks
    const allEvidence = chunks.map(c => c.text);

    const groundingResult = isClaimGrounded(claimText, allEvidence, extractedValues);

    const claimResult: ClaimResult = {
      claim: claimText,
      isGrounded: groundingResult.grounded,
      isNumericMatch: groundingResult.numericMatch,
      hasCitation: sources.length > 0,
      matchedEvidence: groundingResult.matchedEvidence.slice(0, 3).map(e => e.substring(0, 200)),
      missingValues: groundingResult.missingValues,
    };

    claims.push(claimResult);

    if (groundingResult.grounded) {
      groundedCount++;
    } else {
      hallucinationCount++;
    }

    if (!groundingResult.numericMatch) {
      numericMismatchCount++;
    }

    if (sources.length > 0) {
      citedCount++;
    }

    // Check multi-source support
    const sourcesWithEvidence = new Set<string>();
    for (const chunk of chunks) {
      if (groundingResult.matchedEvidence.includes(chunk.text)) {
        sourcesWithEvidence.add(chunk.sourceId);
      }
    }
    if (sourcesWithEvidence.size >= 2) {
      multiSourceCount++;
    }
  }

  // Calculate rates
  const groundedClaimRate = claimTexts.length > 0 ? groundedCount / claimTexts.length : 1;
  const citationCoverageRate = claimTexts.length > 0 ? citedCount / claimTexts.length : 1;
  const multiSourceSupportRate = claimTexts.length > 0 ? multiSourceCount / claimTexts.length : 0;

  // Check expected facts
  const expectedFactsMissing: string[] = [];
  for (const fact of evalCase.expectedFacts) {
    if (!isExpectedFactPresent(fact, answer)) {
      expectedFactsMissing.push(fact.text + (fact.requiredValues ? `: ${fact.requiredValues.join(", ")}` : ""));
    }
  }
  const expectedFactsFound = evalCase.expectedFacts.length - expectedFactsMissing.length;

  // Check minimum sources requirement
  if (evalCase.minSources && sources.length < evalCase.minSources) {
    failures.push(`Expected at least ${evalCase.minSources} sources, got ${sources.length}`);
  }

  // Check expected source prefixes
  if (evalCase.expectedSourcePrefixes) {
    const sourceNames = sources.map(s => s.title);
    for (const prefix of evalCase.expectedSourcePrefixes) {
      // Normalize both prefix and title by stripping hyphens, underscores, spaces, and lowercasing
      const normalizedPrefix = prefix
        .replace(/_/g, "")
        .replace(/\.md$/i, "")
        .replace(/-/g, "")
        .replace(/\s+/g, "")
        .toLowerCase();
      
      const found = sourceNames.some(name => {
        const normalizedName = name
          .replace(/[-_\s]/g, "")
          .toLowerCase();
        return normalizedName.includes(normalizedPrefix);
      });
      
      if (!found) {
        failures.push(`Expected source matching "${prefix}" not found`);
      }
    }
  }

  // Apply thresholds
  if (groundedClaimRate < 0.95) {
    failures.push(`Grounded claim rate ${(groundedClaimRate * 100).toFixed(1)}% < 95%`);
  }

  if (hallucinationCount > 0) {
    failures.push(`Found ${hallucinationCount} ungrounded claims`);
  }

  if (numericMismatchCount > 0) {
    failures.push(`Found ${numericMismatchCount} numeric mismatches`);
  }

  if (expectedFactsMissing.length > 0) {
    failures.push(`Missing expected facts: ${expectedFactsMissing.join("; ")}`);
  }

  return {
    groundedClaimRate,
    hallucinationCount,
    numericMismatchCount,
    citationCoverageRate,
    multiSourceSupportRate,
    claims,
    expectedFactsFound,
    expectedFactsMissing,
    passed: failures.length === 0,
    failures,
  };
}

/**
 * Lightweight scoring for offline/unit tests (no actual retrieval)
 */
export function scoreOffline(
  answer: string,
  mockSources: { id: string; title: string }[],
  mockChunks: { sourceId: string; text: string }[],
  evalCase: EvalCase
): GroundednessResult {
  return scoreGroundedness(answer, mockSources, mockChunks, evalCase);
}
