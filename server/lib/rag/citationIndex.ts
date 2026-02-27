import type { Section } from "@shared/schema";

type SourceCitation = { sourceId: string };

export function buildCitationIndexMap(input: {
  sections?: Section[];
  bullets?: Array<{ citations?: SourceCitation[] }>;
}): Map<string, number> {
  const index = new Map<string, number>();
  let next = 1;

  for (const section of input.sections || []) {
    for (const item of section.items || []) {
      for (const citation of item.citations || []) {
        if (!index.has(citation.sourceId)) {
          index.set(citation.sourceId, next++);
        }
      }
    }
  }

  for (const bullet of input.bullets || []) {
    for (const citation of bullet.citations || []) {
      if (!index.has(citation.sourceId)) {
        index.set(citation.sourceId, next++);
      }
    }
  }

  return index;
}

export function citationIndexRecord(index: Map<string, number>): Record<string, number> {
  return Object.fromEntries(index.entries());
}

export function indexIdsFromCitations(
  citations: SourceCitation[] | undefined,
  index: Map<string, number>,
): string[] {
  const ids: string[] = [];
  for (const citation of citations || []) {
    const mapped = index.get(citation.sourceId);
    if (mapped === undefined) continue;
    const id = String(mapped);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function parseAnswerCitationMarkers(answerText: string): Set<string> {
  const markers = new Set<string>();
  for (const match of answerText.matchAll(/\[(\d+)\]/g)) {
    markers.add(match[1]);
  }
  return markers;
}
