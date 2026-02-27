/**
 * Answer Quality Check - Lightweight regression safety net
 *
 * Runs server-side before the response is sent. Logs warnings
 * without blocking the response, giving visibility into quality
 * regressions across all queries.
 */

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function checkAnswerQuality(
  answer: string,
  bullets: Array<{ claim: string; citations?: Array<{ sourceId: string; chunkId: string }> }>,
  query: string,
): string[] {
  const warnings: string[] = [];

  const fillerOpeners = [
    "here are the",
    "based on the",
    "sure!",
    "happy to help",
    "great question",
    "here's what i found",
  ];
  if (fillerOpeners.some((f) => answer.toLowerCase().startsWith(f))) {
    warnings.push("FILLER_OPENER: answer starts with banned phrase");
  }

  if (answer.includes("\u2014") || answer.includes("\u2013")) {
    warnings.push("EM_DASH: answer contains em dash");
  }

  if (answer.includes('{"') || answer.includes("```")) {
    warnings.push("RAW_JSON: answer contains raw JSON or code block");
  }

  for (const bullet of bullets) {
    if (!bullet.citations || bullet.citations.length < 2) continue;
    const uniqueSources = new Set(bullet.citations.map((c) => c.sourceId));
    if (uniqueSources.size < 2) continue;

    const claimSnippet = (bullet.claim || "").slice(0, 20);
    if (!claimSnippet) continue;
    const escapedSnippet = escapeRegex(claimSnippet);
    const linePattern = new RegExp("^.*" + escapedSnippet + ".*$", "gm");
    const lineMatches = answer.match(linePattern) || [];
    if (lineMatches.length === 0) continue;

    let bestMarkerCount = 0;
    let bestMarkers = new Set<string>();
    for (const line of lineMatches) {
      const m = line.match(/\[\d+\]/g) || [];
      const u = new Set(m);
      if (u.size > bestMarkerCount) {
        bestMarkerCount = u.size;
        bestMarkers = u;
      }
    }
    const uniqueMarkers = bestMarkers;
    if (uniqueMarkers.size < uniqueSources.size) {
      warnings.push(
        `MISSING_CITATIONS: bullet "${bullet.claim.slice(0, 40)}..." ` +
          `has ${uniqueSources.size} sources but answer shows ${uniqueMarkers.size} marker(s)`,
      );
    }
  }

  return warnings;
}
