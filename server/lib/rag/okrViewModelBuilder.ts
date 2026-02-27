/**
 * OKR View Model Builder
 *
 * Transforms the output from structuredExtractor + grounding into
 * an enterprise-grade OkrAnswerViewModel with stable citation numbering.
 *
 * Key invariants:
 * - Citation numbers [1..N] assigned by first-seen order
 * - Only cited sources appear in evidence (sourcesUsed)
 * - KRs without citations are omitted (truthful evidence)
 * - Key facts without citations are omitted
 */

import type {
  OkrAnswerViewModel,
  CitationIndexEntry,
  ObjectiveView,
  KeyResultView,
  KeyFactView,
  KRStatus,
  Section,
  Citation
} from "@shared/schema";

interface EvidenceItem {
  id: string;
  title: string;
  url?: string;
  locationUrl?: string;
  connectorType: string;
  connectorLabel: string;
  whyUsed?: string;
}

interface RelatedSourceItem {
  id: string;
  sourceId?: string;
  title: string;
  url?: string;
  locationUrl?: string;
  sourceType?: string;
  sourceTypeLabel?: string;
}

export interface BuildOkrViewModelInput {
  sections: Section[];
  evidence: EvidenceItem[];
  relatedSources: RelatedSourceItem[];
  framingContext?: string;
  summary?: string;
}

/**
 * Build citation index by walking all items in first-seen order.
 * Returns a Map<sourceId, citationNumber> and the ordered index array.
 */
function buildCitationIndex(sections: Section[]): {
  sourceToNumber: Map<string, number>;
  citationIndex: CitationIndexEntry[];
} {
  const sourceToNumber = new Map<string, number>();
  const citationIndex: CitationIndexEntry[] = [];
  let nextId = 1;

  // Walk sections/items in order, track first appearance
  for (const section of sections) {
    for (const item of section.items) {
      if (!item.citations) continue;
      for (const citation of item.citations) {
        if (!sourceToNumber.has(citation.sourceId)) {
          sourceToNumber.set(citation.sourceId, nextId);
          citationIndex.push({
            id: nextId,
            sourceId: citation.sourceId,
            title: citation.title || citation.label || "Untitled",
            url: citation.url,
          });
          nextId++;
        }
      }
    }
  }

  return { sourceToNumber, citationIndex };
}

/**
 * Parse status string into enum value or null.
 */
function parseStatus(statusStr?: string): KRStatus | null {
  if (!statusStr) return null;
  const normalized = statusStr.toLowerCase();
  if (normalized.includes("on track") || normalized.includes("on target")) {
    return "On Track";
  }
  if (normalized.includes("at risk") || normalized.includes("risk")) {
    return "At Risk";
  }
  if (normalized.includes("behind") || normalized.includes("delayed") || normalized.includes("off track")) {
    return "Behind";
  }
  return null;
}

/**
 * Extract citation IDs for an item, filtering to only cited sources.
 */
function extractCitationIds(
  citations: Citation[] | undefined,
  sourceToNumber: Map<string, number>
): number[] {
  if (!citations || citations.length === 0) return [];

  const ids = new Set<number>();
  for (const c of citations) {
    const num = sourceToNumber.get(c.sourceId);
    if (num !== undefined) {
      ids.add(num);
    }
  }
  return Array.from(ids).sort((a, b) => a - b);
}

/**
 * Build objectives array from sections.
 * Each section title becomes objective title, items become KRs.
 * Filters out KRs without citations.
 */
function buildObjectives(
  sections: Section[],
  sourceToNumber: Map<string, number>
): ObjectiveView[] {
  return sections.map(section => {
    const keyResults: KeyResultView[] = [];

    for (const item of section.items) {
      if (item.kind !== "kr" && item.kind !== "bullet") continue;

      const citationIds = extractCitationIds(item.citations, sourceToNumber);

      // Skip items with no citations (cannot be grounded)
      if (citationIds.length === 0) continue;

      keyResults.push({
        text: item.text,
        owner: item.owner,
        target: item.target,
        current: item.current,
        status: parseStatus(item.status),
        due: item.due,
        citationIds,
      });
    }

    // Extract objective owner from first objective-kind item or section context
    const objItem = section.items.find(i => i.kind === "objective");

    return {
      title: section.title,
      owner: objItem?.owner,
      keyResults,
    };
  }).filter(obj => obj.keyResults.length > 0); // Drop objectives with no cited KRs
}

/**
 * Build key facts from grounded section items.
 * Only includes facts that have citations.
 * Extracts notable facts: due dates, at-risk status, key targets.
 */
function buildKeyFacts(
  sections: Section[],
  sourceToNumber: Map<string, number>
): KeyFactView[] {
  const facts: KeyFactView[] = [];

  for (const section of sections) {
    for (const item of section.items) {
      if (!item.citations || item.citations.length === 0) continue;

      const citationIds = extractCitationIds(item.citations, sourceToNumber);
      if (citationIds.length === 0) continue;

      // Extract notable facts: due dates, at-risk status, key targets
      if (item.due) {
        facts.push({
          text: `${item.due} deadline`,
          citationIds
        });
      }
      if (item.status && parseStatus(item.status) === "At Risk") {
        const truncatedText = item.text.length > 50 ? item.text.slice(0, 50) + '...' : item.text;
        facts.push({
          text: `${truncatedText} - At Risk`,
          citationIds
        });
      }
      if (item.target) {
        facts.push({
          text: `${item.target} target`,
          citationIds
        });
      }
    }
  }

  // Dedupe by normalized text, cap at 4
  const seen = new Set<string>();
  return facts.filter(f => {
    const norm = f.text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  }).slice(0, 4);
}

/**
 * Detect document type from title for better descriptions.
 */
function detectDocType(title: string): 'okr' | 'architecture' | 'blockers' | 'roadmap' | 'budget' | 'other' {
  const lower = title.toLowerCase();
  if (/(okr|objective|key result|goal|kpi)/i.test(lower)) return 'okr';
  if (/(architect|design|system|technical)/i.test(lower)) return 'architecture';
  if (/(blocker|issue|risk|impediment|all-hands|standup)/i.test(lower)) return 'blockers';
  if (/(roadmap|timeline|milestone|schedule|launch)/i.test(lower)) return 'roadmap';
  if (/(budget|cost|spend|financial|expense)/i.test(lower)) return 'budget';
  return 'other';
}

/**
 * Generate a meaningful description for an evidence item.
 */
function generateDescription(
  title: string,
  sections: Section[],
  sourceId: string
): string {
  const docType = detectDocType(title);
  
  // Collect what data was extracted from this source
  const extractedData: {
    targets: string[];
    owners: string[];
    statuses: string[];
    dates: string[];
    krCount: number;
  } = {
    targets: [],
    owners: [],
    statuses: [],
    dates: [],
    krCount: 0
  };

  for (const section of sections) {
    for (const item of section.items) {
      if (item.citations?.some(c => c.sourceId === sourceId)) {
        extractedData.krCount++;
        if (item.target) extractedData.targets.push(item.target);
        if (item.owner) extractedData.owners.push(item.owner);
        if (item.status) extractedData.statuses.push(item.status);
        if (item.due) extractedData.dates.push(item.due);
      }
    }
  }

  // Build description based on document type and extracted data
  const parts: string[] = [];

  switch (docType) {
    case 'okr':
      if (extractedData.targets.length > 0) {
        const uniqueTargets = [...new Set(extractedData.targets)].slice(0, 2);
        parts.push(`Defines ${uniqueTargets.join(', ')} targets`);
      } else if (extractedData.krCount > 0) {
        parts.push(`Contains ${extractedData.krCount} key result${extractedData.krCount > 1 ? 's' : ''}`);
      }
      if (extractedData.owners.length > 0) {
        parts.push('owner assignments');
      }
      break;
    case 'architecture':
      parts.push('Technical specifications');
      if (extractedData.targets.length > 0) {
        parts.push(`performance targets (${extractedData.targets[0]})`);
      }
      break;
    case 'blockers':
      if (extractedData.statuses.some(s => s.toLowerCase().includes('risk'))) {
        parts.push('At-risk items and blockers');
      } else {
        parts.push('Current blockers and issues');
      }
      break;
    case 'roadmap':
      if (extractedData.dates.length > 0) {
        parts.push(`Timeline and milestones (${extractedData.dates[0]})`);
      } else {
        parts.push('Project timeline and milestones');
      }
      break;
    case 'budget':
      parts.push('Budget and financial data');
      break;
    default:
      if (extractedData.krCount > 0) {
        parts.push(`${extractedData.krCount} item${extractedData.krCount > 1 ? 's' : ''} cited`);
      }
  }

  return parts.length > 0 ? parts.join('; ') : 'Supporting context';
}

/**
 * Enrich citation index with evidence details (url, locationUrl, why, description, kind).
 */
function enrichCitationIndex(
  citationIndex: CitationIndexEntry[],
  evidence: EvidenceItem[],
  sections: Section[]
): CitationIndexEntry[] {
  return citationIndex.map(entry => {
    // Find matching evidence item
    const ev = evidence.find(e => e.id === entry.sourceId);
    if (!ev) {
      return {
        ...entry,
        kind: "cited" as const,
      };
    }

    // Generate "why" description based on what was cited (short form)
    let why = ev.whyUsed;
    if (!why) {
      const usedFor: string[] = [];
      for (const section of sections) {
        for (const item of section.items) {
          if (item.citations?.some(c => c.sourceId === entry.sourceId)) {
            if (item.target) usedFor.push('targets');
            if (item.owner) usedFor.push('owners');
            if (item.status) usedFor.push('status');
            if (item.due) usedFor.push('dates');
          }
        }
      }
      const uniqueUsedFor = Array.from(new Set(usedFor)).slice(0, 3);
      why = uniqueUsedFor.length > 0 ? uniqueUsedFor.join(', ') : undefined;
    }

    // Generate full description for UI display
    const description = generateDescription(ev.title, sections, entry.sourceId);

    return {
      ...entry,
      title: ev.title || entry.title,
      url: ev.url || entry.url,
      locationUrl: ev.locationUrl,
      connectorType: ev.connectorType,
      connectorLabel: ev.connectorLabel,
      why,
      description,
      kind: "cited" as const,
    };
  });
}

/**
 * Build related sources (retrieved but not cited).
 */
function buildRelatedSources(
  relatedSources: RelatedSourceItem[],
  sourceToNumber: Map<string, number>
): CitationIndexEntry[] {
  let nextId = sourceToNumber.size + 1;

  return relatedSources
    .filter(rs => {
      const id = rs.sourceId || rs.id;
      return !sourceToNumber.has(id);
    })
    .map(rs => ({
      id: nextId++,
      sourceId: rs.sourceId || rs.id,
      title: rs.title,
      url: rs.url,
      locationUrl: rs.locationUrl,
      connectorType: rs.sourceType || 'drive',
      connectorLabel: rs.sourceTypeLabel || 'Drive',
      description: 'Retrieved for context but not directly cited',
      kind: "context" as const,
    }));
}

/**
 * Extract title from framing context or first objective.
 */
function extractTitle(
  framingContext?: string,
  sections?: Section[]
): string {
  if (framingContext) {
    // Parse "Here are the Q4 OKRs for AI Search" -> "Q4 OKRs - AI Search"
    const match = framingContext.match(/(?:Here are the\s+)?(.+?)\s+(?:for|from)\s+(.+)/i);
    if (match) {
      return `${match[1]} - ${match[2]}`;
    }
    // Remove "Here are the" prefix if present
    return framingContext.replace(/^Here are the\s+/i, '').trim();
  }
  if (sections && sections.length > 0) {
    return sections[0].title;
  }
  return "OKR Summary";
}

/**
 * Extract timeframe from sections or framing.
 */
function extractTimeframe(
  framingContext?: string,
  sections?: Section[]
): string | undefined {
  // Look for Q1-Q4 patterns with year
  const quarterYearPattern = /Q[1-4]\s*\d{4}/i;

  if (framingContext) {
    const match = framingContext.match(quarterYearPattern);
    if (match) return match[0].replace(/\s+/g, ' ');
  }

  // Check section titles
  if (sections) {
    for (const section of sections) {
      const match = section.title.match(quarterYearPattern);
      if (match) return match[0].replace(/\s+/g, ' ');
    }
  }

  // Also check for just quarter (Q4, Q1, etc.)
  if (framingContext) {
    const quarterMatch = framingContext.match(/Q[1-4]/i);
    if (quarterMatch) return quarterMatch[0].toUpperCase();
  }

  return undefined;
}

/**
 * Sort evidence by document type priority:
 * 1. OKR documents (primary)
 * 2. Architecture documents
 * 3. Blockers/All-hands documents
 * 4. Roadmap documents
 * 5. Other sources by original order
 */
function sortByPriority(entries: CitationIndexEntry[]): CitationIndexEntry[] {
  const priorityOrder = { okr: 1, architecture: 2, blockers: 3, roadmap: 4, budget: 5, other: 6 };
  
  return [...entries].sort((a, b) => {
    const typeA = detectDocType(a.title);
    const typeB = detectDocType(b.title);
    const priorityDiff = priorityOrder[typeA] - priorityOrder[typeB];
    if (priorityDiff !== 0) return priorityDiff;
    // Preserve original order for same priority
    return a.id - b.id;
  });
}

/**
 * Build executive framing context with source count.
 */
function buildFramingContext(
  originalFraming: string | undefined,
  sourceCount: number
): string {
  if (originalFraming) {
    // Add source count if not already present
    if (!originalFraming.includes('source') && sourceCount > 1) {
      return `${originalFraming} Based on ${sourceCount} sources.`;
    }
    return originalFraming;
  }
  return sourceCount > 1 
    ? `Based on ${sourceCount} sources.`
    : 'Based on available documentation.';
}

/**
 * Main builder function - transforms structured data to OkrAnswerViewModel.
 */
export function buildOkrAnswerViewModel(
  input: BuildOkrViewModelInput
): OkrAnswerViewModel {
  const { sections, evidence, relatedSources, framingContext, summary } = input;

  // 1. Build citation index by walking items in first-seen order
  const { sourceToNumber, citationIndex } = buildCitationIndex(sections);

  // 2. Enrich citation index with evidence details
  const enrichedCitationIndex = enrichCitationIndex(citationIndex, evidence, sections);

  // 3. Sort by priority (OKR first, then architecture, blockers, roadmap)
  const sortedCitationIndex = sortByPriority(enrichedCitationIndex);

  // 4. Renumber after sorting to maintain [1, 2, 3...] order
  const renumberedIndex = sortedCitationIndex.map((entry, idx) => ({
    ...entry,
    id: idx + 1,
  }));

  // Build new sourceToNumber map for renumbered citations
  const newSourceToNumber = new Map<string, number>();
  for (const entry of renumberedIndex) {
    newSourceToNumber.set(entry.sourceId, entry.id);
  }

  // 5. Build objectives with renumbered citations
  const objectives = buildObjectives(sections, newSourceToNumber);

  // 6. Build key facts (only cited)
  const keyFacts = buildKeyFacts(sections, newSourceToNumber);

  // 7. Build related sources (not cited)
  const sourcesRelated = buildRelatedSources(relatedSources || [], newSourceToNumber);

  // 8. Extract title and timeframe
  const title = extractTitle(framingContext, sections);
  const timeframe = extractTimeframe(framingContext, sections);

  // 9. Build executive framing context
  const finalFramingContext = buildFramingContext(framingContext, renumberedIndex.length);

  return {
    title,
    timeframe,
    framingContext: finalFramingContext,
    keyFacts,
    objectives,
    citationIndex: renumberedIndex,
    sourcesUsed: renumberedIndex, // Same as citationIndex - only cited sources
    sourcesRelated,
  };
}
