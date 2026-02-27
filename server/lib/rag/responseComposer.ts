/**
 * Response Composer - Enterprise Answer Presentation Layer
 * 
 * Transforms structured extraction data into polished Markdown with:
 * - Framing context sentence
 * - Key facts summary
 * - Formatted objectives/KRs with inline citation markers [1][2]
 * - Stable source ordering for Evidence panel
 */

import { Section, Citation } from "@shared/schema";

export interface EvidenceItem {
  id: string;
  title: string;
  url?: string;
  locationUrl?: string;
  connectorType: string;
  connectorLabel: string;
  whyUsed?: string;
}

export interface KeyFact {
  text: string;
  citations: Citation[];
}

export interface ComposedResponse {
  renderedAnswer: string;
  orderedSources: EvidenceItem[];
  dedupedCitations: Citation[];
  keyFacts: KeyFact[];
}

export interface RetrievedChunkForRewrite {
  chunkId: string;
  sourceId: string;
  score: number;
  snippet: string;
}

interface ComposeInput {
  sections?: Section[];
  framingContext?: string;
  summary?: string;
  evidence: EvidenceItem[];
  bullets?: Array<{ claim: string; citations: Citation[] }>;
  intentType?: string;
}

/**
 * Build a stable source index from sections, ordered by first appearance.
 * Returns a Map of sourceId -> citation number (1-based)
 */
export function buildOrderedSources(
  sections: Section[] | undefined,
  evidence: EvidenceItem[]
): { sourceIndex: Map<string, number>; orderedEvidence: EvidenceItem[] } {
  const sourceIndex = new Map<string, number>();
  const orderedEvidence: EvidenceItem[] = [];
  let nextIndex = 1;

  // Walk through sections in order, tracking first appearance of each source
  if (sections) {
    for (const section of sections) {
      for (const item of section.items) {
        if (item.citations) {
          for (const citation of item.citations) {
            if (!sourceIndex.has(citation.sourceId)) {
              sourceIndex.set(citation.sourceId, nextIndex++);
              // Find matching evidence item
              const ev = evidence.find(e => e.id === citation.sourceId);
              if (ev) {
                orderedEvidence.push(ev);
              }
            }
          }
        }
      }
    }
  }

  // Add any evidence items that weren't cited (shouldn't happen, but safety)
  for (const ev of evidence) {
    if (!sourceIndex.has(ev.id)) {
      sourceIndex.set(ev.id, nextIndex++);
      orderedEvidence.push(ev);
    }
  }

  return { sourceIndex, orderedEvidence };
}

/**
 * Deduplicate citations by (sourceId, chunkId) tuple.
 * Preserves first occurrence.
 */
export function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  return citations.filter(c => {
    const key = `${c.sourceId}:${c.chunkId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Format citation markers for an item based on its citations.
 * Returns string like "[1]" or "[1][3]" for multi-source.
 */
function formatCitationMarkers(
  citations: Citation[] | undefined,
  sourceIndex: Map<string, number>
): string {
  if (!citations || citations.length === 0) return '';

  // Get unique source IDs from citations, preserving order
  const uniqueSourceIds: string[] = [];
  for (const c of citations) {
    if (!uniqueSourceIds.includes(c.sourceId)) {
      uniqueSourceIds.push(c.sourceId);
    }
  }

  // Convert to markers
  const markers = uniqueSourceIds
    .map(sid => sourceIndex.get(sid))
    .filter((n): n is number => n !== undefined)
    .sort((a, b) => a - b)
    .map(n => `[${n}]`);

  return markers.length > 0 ? ' ' + markers.join('') : '';
}

/**
 * Format a single KR/item line with metadata as parenthetical context
 * and a source citation at the end.
 */
function formatItemLine(
  item: Section['items'][number],
  sourceIndex: Map<string, number>,
  evidence: EvidenceItem[],
  isSingleSource: boolean
): string {
  let line = `- ${item.text}`;

  // Add compact metadata in parentheses (no em dashes)
  const metaParts: string[] = [];
  if (item.target) metaParts.push(`target: ${item.target}`);
  if (item.current) metaParts.push(`current: ${item.current}`);
  if (item.status) metaParts.push(item.status);
  if (item.due) metaParts.push(`due ${item.due}`);
  if (item.owner) metaParts.push(`owner: ${item.owner}`);

  if (metaParts.length > 0) {
    line += ` (${metaParts.join(', ')})`;
  }

  // Add inline citation markers at end of the claim.
  if (item.citations && item.citations.length > 0) {
    if (isSingleSource && evidence.length === 1) {
      line += " [1]";
    } else {
      line += formatCitationMarkers(item.citations, sourceIndex);
    }
  }

  return line;
}

/**
 * Derive citation-backed key facts from grounded section items.
 * Only includes facts from items that have citations, preventing uncited claims.
 */
export function deriveKeyFacts(sections: Section[]): KeyFact[] {
  const facts: KeyFact[] = [];

  for (const section of sections) {
    for (const item of section.items) {
      if (!item.citations || item.citations.length === 0) continue;

      // Extract notable facts: due dates, at-risk status, key targets
      if (item.due) {
        facts.push({ text: `${item.due} deadline`, citations: item.citations });
      }
      if (item.status &&
          (item.status.toLowerCase().includes('risk') ||
           item.status.toLowerCase().includes('behind'))) {
        facts.push({
          text: `${item.text} (${item.status})`,
          citations: item.citations,
        });
      }
      if (item.target) {
        facts.push({ text: `${item.target} target`, citations: item.citations });
      }
    }
  }

  // Dedupe by normalized text, cap at 4
  const seen = new Set<string>();
  return facts.filter(f => {
    const norm = f.text.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  }).slice(0, 4);
}

/**
 * Compose a golden enterprise narrative from structured extraction data.
 *
 * Output format (golden narrative):
 * 1. Friendly opener sentence
 * 2. 2-4 sentence summary paragraph
 * 3. Bullets with (Source: <name>) citations
 * 4. Follow-up offer
 */
export function composeEnterpriseAnswer(input: ComposeInput): ComposedResponse {
  const { sections, framingContext, summary, evidence, bullets } = input;

  // Build stable source ordering
  const { sourceIndex, orderedEvidence } = buildOrderedSources(sections, evidence);

  // Determine if single source (affects citation marker display)
  const isSingleSource = orderedEvidence.length === 1;

  const lines: string[] = [];

  // 1) Narrative-first answer (2-4 sentences).
  const FILLER_OPENERS_RE = /^(here are the|based on the|sure!|happy to help|great question|here's what i found|found \d+)\s*/i;

  const narrativeParts: string[] = [];
  if (framingContext) {
    const cleaned = framingContext.trim().replace(FILLER_OPENERS_RE, '');
    if (cleaned) narrativeParts.push(cleaned.charAt(0).toUpperCase() + cleaned.slice(1));
  }
  if (summary) narrativeParts.push(summary.trim());
  if (narrativeParts.length === 0 && sections && sections.length > 0) {
    const totalItems = sections.reduce((acc, s) => acc + s.items.length, 0);
    narrativeParts.push(`Found ${totalItems} item${totalItems > 1 ? "s" : ""} across ${sections.length} area${sections.length > 1 ? "s" : ""}.`);
  }
  if (narrativeParts.length === 0) {
    narrativeParts.push("The following results were retrieved from connected sources.");
  }
  let narrative = narrativeParts.join(" ").replace(/\s+/g, " ").trim();
  if (!/[.!?]\s*$/.test(narrative)) narrative += ".";
  lines.push(narrative);
  lines.push('');

  // 2) Short bullets with citations
  let pushedBullets = 0;
  if (sections && sections.length > 0) {
    for (const section of sections) {
      for (const item of section.items) {
        if (pushedBullets >= 7) break;
        lines.push(formatItemLine(item, sourceIndex, orderedEvidence, isSingleSource));
        pushedBullets += 1;
      }
      if (pushedBullets >= 7) break;
    }

    // Enterprise style requires at least 2 bullets. If extraction returns a single item,
    // add one grounded supplemental bullet from the same cited item metadata.
    if (pushedBullets < 2) {
      const supplementalSeen = new Set<string>();
      for (const section of sections) {
        for (const item of section.items) {
          if (pushedBullets >= 2) break;
          const marker = formatCitationMarkers(item.citations, sourceIndex);
          const candidates = [
            item.status ? `- Status: ${item.status}${marker}` : "",
            item.current ? `- Current impact: ${item.current}${marker}` : "",
            item.due ? `- Deadline: ${item.due}${marker}` : "",
            item.owner ? `- Owner: ${item.owner}${marker}` : "",
          ].filter(Boolean);
          for (const candidate of candidates) {
            if (pushedBullets >= 2) break;
            const key = candidate.toLowerCase();
            if (supplementalSeen.has(key)) continue;
            supplementalSeen.add(key);
            lines.push(candidate);
            pushedBullets += 1;
          }
        }
        if (pushedBullets >= 2) break;
      }
    }
    lines.push('');
  }

  // 3) Intent-specific follow-up offer
  const intentLower = (input.intentType || "").toLowerCase();
  let followUp: string;
  if (/blocker|risk/.test(intentLower)) {
    followUp = "Want me to pull up the escalation timeline or break down the mitigation steps?";
  } else if (/owner|deadline/.test(intentLower)) {
    followUp = "Want me to look up the escalation contacts or the full resolution timeline?";
  } else if (/roadmap/.test(intentLower)) {
    followUp = "Want me to break down any specific quarter or pull up the feature dependencies?";
  } else if (/okr/.test(intentLower)) {
    followUp = "Want me to drill into any specific key result or pull up the latest progress metrics?";
  } else if (/architecture/.test(intentLower)) {
    followUp = "Want me to dive deeper into any component or pull up the cost breakdown?";
  } else if (/budget/.test(intentLower)) {
    followUp = "Want me to break down the line items or compare against the original budget?";
  } else {
    followUp = "Want me to dig deeper into any of these areas or pull up more details?";
  }
  lines.push(followUp);

  // Build deduped citations from bullets and sections
  const allCitations: Citation[] = [];
  if (bullets) {
    for (const b of bullets) {
      allCitations.push(...b.citations);
    }
  }
  if (sections) {
    for (const section of sections) {
      for (const item of section.items) {
        if (item.citations) {
          allCitations.push(...item.citations);
        }
      }
    }
  }

  // Derive key facts for structured data consumers
  const keyFacts = sections ? deriveKeyFacts(sections) : [];

  // Final sanitization: remove any stray em dashes
  let renderedAnswer = lines.join('\n').trim();
  renderedAnswer = renderedAnswer.replace(/\s[—–]\s/g, ', ').replace(/[—–]/g, '. ').replace(/\.\.\s/g, '. ');

  return {
    renderedAnswer,
    orderedSources: orderedEvidence,
    dedupedCitations: dedupeCitations(allCitations),
    keyFacts,
  };
}

function stripStructuredScaffolding(text: string): string {
  let cleaned = (text || "").trim();
  cleaned = cleaned.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  cleaned = cleaned.replace(/^\s*(key facts|blockers(?:\s*&\s*risks)?|summary)\s*:?\s*$/gim, "");
  cleaned = cleaned.replace(/^\s*\|.*\|\s*$/gm, "");
  cleaned = cleaned.replace(/^\s*\|?[-:\s|]{3,}\|?\s*$/gm, "");
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, "$1");
  cleaned = cleaned.replace(/\*(.*?)\*/g, "$1");
  cleaned = cleaned.replace(/\s[—–]\s/g, ", ").replace(/[—–]/g, ". ");
  // Strip robotic preambles and meta-language that leak internal process
  cleaned = cleaned.replace(/I cross-checked the available evidence[^.]*\.\s*/gi, "");
  cleaned = cleaned.replace(/I kept this grounded in the retrieved sources[^.]*\.\s*/gi, "");
  cleaned = cleaned.replace(/I reviewed the retrieved evidence and pulled the most relevant findings[^.]*\.\s*/gi, "");
  cleaned = cleaned.replace(/grounded in the supporting documents[^.]*\.\s*/gi, "");
  cleaned = cleaned.replace(/Cross-source evidence includes[^.]*\.\s*/gi, "");
  cleaned = cleaned.replace(/Based on the context provided[^.]*\.\s*/gi, "");
  cleaned = cleaned.replace(/According to the retrieved sources[^.]*\.\s*/gi, "");
  // Remove bullet lines that are pure meta-commentary (no factual content)
  cleaned = cleaned.replace(/^- Cross-source evidence includes[^\n]*$/gm, "");
  cleaned = cleaned.replace(/^- Source: (?:an additional|another) supporting document[^\n]*$/gm, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function ensureQuestionLine(text: string): string {
  const trimmed = text.trim();
  if (trimmed.endsWith("?")) return trimmed;
  return "Would you like me to break this down by owner, timeline, or risk?";
}

function uniqueMarkersFromCitations(
  citations: Citation[] | undefined,
  sourceIndex: Map<string, number>
): string {
  if (!citations || citations.length === 0) return "";
  const ids: string[] = [];
  for (const c of citations) {
    if (!ids.includes(c.sourceId)) ids.push(c.sourceId);
  }
  const markers = ids
    .map((id) => sourceIndex.get(id))
    .filter((n): n is number => typeof n === "number")
    .sort((a, b) => a - b)
    .map((n) => `[${n}]`);
  return markers.length ? ` ${markers.join("")}` : "";
}

function looksStructuredPrimaryAnswer(text: string): boolean {
  const trimmed = (text || "").trim();
  if (!trimmed) return true;
  if (/^(key facts|blockers(?:\s*&\s*risks)?|summary)\b/i.test(trimmed)) return true;
  if (/^\s{0,3}#{1,6}\s+/m.test(trimmed)) return true;
  if (/^\s*\|.*\|\s*$/m.test(trimmed)) return true;
  return false;
}

export function enforceEnterpriseAnswerFormat(input: {
  draftAnswer: string;
  evidence: EvidenceItem[];
  bullets?: Array<{ claim: string; citations: Citation[] }>;
  citations?: Citation[];
  retrievedChunks?: RetrievedChunkForRewrite[];
  intent?: string;
}): string {
  const draft = stripStructuredScaffolding(input.draftAnswer || "");
  const fallback = "Here is what I found across the relevant sources.";
  const prose = draft || fallback;
  const sentences = splitSentences(prose);

  // Skip formatting for smalltalk (defensive; smalltalk is usually routed before this)
  if (input.intent === "SMALLTALK") return prose;

  // Idempotency: short greeting-like responses — avoid "narrative becomes bullets" duplication
  const isShortGreeting =
    prose.length < 250 &&
    /^(hi|hello|hey|thanks|thank you)/i.test(prose) &&
    /how can i help/i.test(prose.toLowerCase());
  if (isShortGreeting) return stripStructuredScaffolding(prose);

  const orderedSourceIds: string[] = [];
  for (const c of input.citations || []) {
    if (!orderedSourceIds.includes(c.sourceId)) orderedSourceIds.push(c.sourceId);
  }
  for (const e of input.evidence || []) {
    if (!orderedSourceIds.includes(e.id)) orderedSourceIds.push(e.id);
  }
  const sourceIndex = new Map<string, number>();
  orderedSourceIds.forEach((sid, idx) => sourceIndex.set(sid, idx + 1));

  const narrative = (() => {
    const top = sentences.slice(0, 3);
    if (top.length >= 2) return top.join(" ");
    if (top.length === 1) return top[0];
    return fallback;
  })();

  const bulletLines: string[] = [];
  if (input.bullets && input.bullets.length > 0) {
    for (const bullet of input.bullets) {
      const claim = (bullet.claim || "").trim();
      if (!claim) continue;
      const markers = uniqueMarkersFromCitations(bullet.citations, sourceIndex);
      bulletLines.push(`- ${claim}${markers}`);
      if (bulletLines.length >= 7) break;
    }
  }

  // Idempotency: if draft already has 2+ bullets, use them — do not add duplicate bullets
  const existingBulletPattern = /^[-*•●▪]\s+.+$/gm;
  const existingBullets = prose.match(existingBulletPattern) || [];
  const usedExistingBullets =
    existingBullets.length >= 2 &&
    bulletLines.length === 0 &&
    (() => {
      for (const line of existingBullets.slice(0, 7)) {
        bulletLines.push(line.startsWith("-") ? line : `- ${line.replace(/^[-*•●▪]\s*/, "").trim()}`);
      }
      return true;
    })();

  // If still under 2 bullets, try to promote answer sentences as bullets
  if (bulletLines.length < 2) {
    const extra = sentences.slice(1, 5)
      .filter(s => !s.endsWith("?") && s.length > 20)
      .map((s) => `- ${s}`);
    for (const e of extra) {
      bulletLines.push(e);
      if (bulletLines.length >= 3) break;
    }
  }

  // Last-resort: use evidence source titles as bullet context (never raw chunk text)
  if (bulletLines.length < 2 && input.evidence && input.evidence.length > 0) {
    for (const ev of input.evidence) {
      if (bulletLines.length >= 3) break;
      const marker = sourceIndex.get(ev.id);
      const whyUsed = ev.whyUsed ? ` (${ev.whyUsed})` : "";
      bulletLines.push(`- Source: ${ev.title}${whyUsed}${marker ? ` [${marker}]` : ""}`);
    }
  }

  // Deduplication: remove bullets whose normalized text overlaps >80% with another bullet
  const deduplicatedBullets: string[] = [];
  const seenBulletTexts: string[] = [];
  for (const line of bulletLines) {
    const text = line.replace(/^-\s*/, "").replace(/\[\d+\]/g, "").trim().toLowerCase();
    const isDuplicate = seenBulletTexts.some(seen => {
      const words = text.split(/\s+/).filter(w => w.length > 2);
      const seenWords = new Set(seen.split(/\s+/).filter(w => w.length > 2));
      if (words.length === 0) return true;
      const overlap = words.filter(w => seenWords.has(w)).length / words.length;
      return overlap > 0.8;
    });
    if (!isDuplicate && text.length > 5) {
      deduplicatedBullets.push(line);
      seenBulletTexts.push(text);
    }
  }
  bulletLines.length = 0;
  bulletLines.push(...deduplicatedBullets.slice(0, 7));

  // Citation integrity: every bullet line must carry at least one marker when sources exist.
  const defaultMarker = sourceIndex.size > 0 ? ` [${Math.min(...Array.from(sourceIndex.values()))}]` : "";
  for (let i = 0; i < bulletLines.length; i += 1) {
    if (!/\[\d+\]/.test(bulletLines[i]) && defaultMarker) {
      bulletLines[i] = `${bulletLines[i]}${defaultMarker}`;
    }
  }

  // Idempotency: if draft already ends with a question, do not append another
  const endsWithQuestion = /\?[^?]*$/.test(prose.trim());
  const nextStep = endsWithQuestion
    ? (prose.match(/[^.?]*\?[^?]*$/) || ["Would you like me to go deeper on timeline, owners, or risks?"])[0].trim()
    : ensureQuestionLine(
        sentences.find((s) => s.includes("?")) ||
        "Would you like me to go deeper on timeline, owners, or risks?"
      );

  const composed = [narrative, "", ...bulletLines.slice(0, 7), "", nextStep].join("\n").trim();
  // Enterprise style: strip em dashes
  return stripStructuredScaffolding(composed).replace(/\u2014/g, "-").replace(/\u2013/g, "-");
}

export function shouldRewriteEnterpriseAnswer(answer: string): boolean {
  return looksStructuredPrimaryAnswer(answer);
}

/**
 * Generate a "whyUsed" description for an evidence item based on how it was cited.
 */
export function generateWhyUsed(
  sourceId: string,
  sections: Section[] | undefined,
  connectorType: string
): string {
  if (!sections) return '';

  const usedFor: string[] = [];

  for (const section of sections) {
    for (const item of section.items) {
      if (item.citations?.some(c => c.sourceId === sourceId)) {
        // Extract key info from item
        if (item.kind === 'kr' || item.kind === 'objective') {
          if (item.target) usedFor.push('targets');
          if (item.owner) usedFor.push('owners');
          if (item.status) usedFor.push('status');
          if (item.due) usedFor.push('dates');
        }
      }
    }
  }

  // Dedupe and join
  const unique = Array.from(new Set(usedFor));
  if (unique.length === 0) {
    // Default descriptions by connector type
    switch (connectorType.toLowerCase()) {
      case 'drive':
        return 'Document source';
      case 'slack':
        return 'Slack discussion';
      case 'jira':
        return 'Issue tracker';
      case 'confluence':
        return 'Wiki page';
      default:
        return 'Source document';
    }
  }

  return unique.slice(0, 4).join(', ');
}
