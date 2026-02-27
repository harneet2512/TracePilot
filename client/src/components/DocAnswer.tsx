import { useState } from "react";
import type { Section, Citation } from "@shared/schema";
import type { DocIntentEvidence, DocIntentItem } from "@shared/schema";
import { FileText, ExternalLink, ChevronDown, Files } from "lucide-react";
import { SiSlack, SiJira, SiConfluence } from "react-icons/si";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface EvidenceItem {
  id: string;
  title: string;
  url?: string;
  locationUrl?: string;
  connectorType?: string;
  connectorLabel?: string;
  whyUsed?: string;
  /** First two lines of excerpt from source (from evidence props). */
  excerpts?: { text: string }[];
}

interface KeyFact {
  text: string;
  citations?: Array<{ sourceId: string; chunkId?: string }>;
}

interface RetrievalSummary {
  chunksConsidered?: number;
  distinctSources?: number;
  topSimilarityScore?: number;
  fallbackRetrievalUsed?: boolean;
}

interface DocAnswerProps {
  framingContext?: string;
  sourceSummary?: string;
  summary?: string;
  keyFacts?: KeyFact[];
  sections: Section[];
  evidence?: EvidenceItem[];
  relatedSources?: EvidenceItem[];
  isSingleSource: boolean;
  citationIndexMap?: Record<string, number>;
  intentType?: string;
  retrievalSummary?: RetrievalSummary;
}

// Get connector icon based on type
function ConnectorIcon({ type, className = "h-4 w-4" }: { type?: string; className?: string }) {
  switch (type?.toLowerCase()) {
    case 'drive':
    case 'google':
      return <img src="https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg" className={className} alt="Drive" />;
    case 'slack':
      return <SiSlack className={`${className} text-purple-500`} />;
    case 'jira':
      return <SiJira className={`${className} text-blue-500`} />;
    case 'confluence':
      return <SiConfluence className={`${className} text-blue-500`} />;
    default:
      return <FileText className={`${className} text-muted-foreground`} />;
  }
}

// Get connector label
function getConnectorLabel(type?: string, label?: string): string {
  if (label) return label;
  switch (type?.toLowerCase()) {
    case 'drive':
    case 'google':
      return 'Drive';
    case 'slack':
      return 'Slack';
    case 'jira':
      return 'Jira';
    case 'confluence':
      return 'Confluence';
    default:
      return type || 'Source';
  }
}

function getTableHeaders(intentType?: string): { item: string; details: string } {
  switch ((intentType || "").toLowerCase()) {
    case "okr":      return { item: "Key Result", details: "Target / Status / Owner" };
    case "blocker":  return { item: "Blocker", details: "Impact / Status / Owner" };
    case "roadmap":  return { item: "Milestone", details: "Date / Status" };
    case "owner":    return { item: "Responsibility", details: "Owner / Deadline" };
    case "deadline": return { item: "Task", details: "Deadline / Status" };
    case "budget":   return { item: "Category", details: "Amount / Details" };
    default:         return { item: "Item", details: "Details" };
  }
}

function getFollowUpQuestion(intentType?: string): string {
  switch ((intentType || "").toLowerCase()) {
    case "okr":      return "Want me to drill into any specific key result or pull up the latest progress metrics?";
    case "blocker":  return "Want me to pull up the escalation timeline or break down the mitigation steps?";
    case "roadmap":  return "Want me to break down any specific quarter or pull up the feature dependencies?";
    case "owner":    return "Want me to look up the escalation contacts or the full resolution timeline?";
    case "deadline": return "Want me to look up the escalation contacts or the full resolution timeline?";
    case "budget":   return "Want me to break down the line items or compare against the original budget?";
    default:         return "Want me to dig deeper into any of these areas or pull up more details?";
  }
}

const UNAVAILABLE = "—";

function formatDetailsCell(item: Section['items'][number]): string {
  const parts: string[] = [];
  if (item.target)  parts.push(`Target: ${item.target}`);
  if (item.current) parts.push(`Current: ${item.current}`);
  if (item.due)     parts.push(`Due: ${item.due}`);
  if (item.owner)   parts.push(`Owner: ${item.owner}`);
  return parts.join(" · ") || UNAVAILABLE;
}

// Priority pill — visual and distinct (high/medium/low)
function PriorityPill({ priority }: { priority: string }) {
  const p = priority.trim().toLowerCase();
  const isHigh = p.includes("high") || p === "p0" || p === "critical";
  const isLow = p.includes("low") || p === "p2" || p === "p3";
  return (
    <span
      className={cn(
        "inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium",
        isHigh && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
        !isHigh && !isLow && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
        isLow && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
      )}
    >
      {priority || UNAVAILABLE}
    </span>
  );
}

// Status badge — colored chip
function StatusBadge({ status }: { status: string }) {
  const isRisk = status.toLowerCase().includes('risk') || status.toLowerCase().includes('behind');
  const isGood = status.toLowerCase().includes('track') || status.toLowerCase().includes('on target') || status.toLowerCase().includes('complete') || status.toLowerCase().includes('launched');
  return (
    <span className={cn(
      "ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium",
      isRisk
        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        : isGood
        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
    )}>
      {status}
    </span>
  );
}

// Evidence list: horizontal flex row, fixed compact cards (icon, truncated filename, first two excerpt lines, Open)
function EvidenceList({
  evidence,
  highlightIndex,
}: {
  evidence: EvidenceItem[];
  highlightIndex?: number;
}) {
  if (evidence.length === 0) return null;

  return (
    <div className="flex flex-row flex-wrap gap-2">
      {evidence.map((ev, idx) => {
        const excerptLines = (ev.excerpts?.slice(0, 2).map((e) => e.text) ?? []).filter(Boolean);
        if (excerptLines.length === 0 && ev.whyUsed) excerptLines.push(ev.whyUsed);
        return (
          <div
            key={ev.id}
            id={`evidence-${idx}`}
            className={cn(
              "w-[240px] shrink-0 flex flex-col gap-1.5 p-2.5 rounded-lg border border-border/50 transition-all duration-300",
              highlightIndex === idx
                ? "bg-primary/15 ring-2 ring-primary/40"
                : "bg-muted/40 hover:bg-muted/60"
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <ConnectorIcon type={ev.connectorType} className="h-4 w-4 shrink-0" />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-sm font-medium truncate block min-w-0">
                      {ev.title}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="break-words">{ev.title}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {excerptLines.length > 0 && (
              <div className="text-xs text-muted-foreground line-clamp-2 break-words">
                {excerptLines.slice(0, 2).map((line, i) => (
                  <p key={i} className="truncate">{line}</p>
                ))}
              </div>
            )}
            <button
              onClick={() => {
                const url = ev.url || ev.locationUrl || `/api/sources/${ev.id}/open`;
                window.open(url, "_blank", "noopener,noreferrer");
              }}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-primary/10 hover:bg-primary/15 text-primary rounded border border-primary/20 transition-colors font-medium w-fit mt-0.5"
              data-testid="source-open-link"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              Open
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function DocAnswer({
  framingContext,
  sourceSummary,
  summary,
  keyFacts,
  sections,
  evidence = [],
  relatedSources,
  isSingleSource,
  citationIndexMap,
  intentType,
  retrievalSummary,
}: DocAnswerProps) {
  const [highlightedEvidence, setHighlightedEvidence] = useState<number | undefined>();

  // Evidence is collapsed by default (per requirement: "default collapsed when N>0")
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Deduplicate evidence by id (backend doc-intent path can emit same sourceId under
  // multiple chunkId entries; keep first occurrence).
  const dedupedEvidence = Array.from(new Map(evidence.map(e => [e.id, e])).values());
  const sourceIndex = new Map<string, number>(
    Object.entries(citationIndexMap || {})
      .filter(([, idx]) => Number.isFinite(Number(idx)))
      .map(([sid, idx]) => [sid, Number(idx)])
  );
  const evidenceIndexBySourceId = new Map<string, number>(dedupedEvidence.map((ev, idx) => [ev.id, idx]));

  // Scroll to evidence: expand if collapsed, scroll, highlight
  const scrollToEvidence = (idx: number) => {
    if (!isEvidenceOpen) {
      setIsEvidenceOpen(true);
    }
    setHighlightedEvidence(idx);
    setTimeout(() => {
      document.getElementById(`evidence-${idx}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }, 150);
    setTimeout(() => setHighlightedEvidence(undefined), 1500);
  };

  const showEvidenceSection = dedupedEvidence.length > 0;
  const hasDetails = (keyFacts && keyFacts.length > 0) || !!summary;
  const headers = getTableHeaders(intentType);

  return (
    <div className="space-y-4">
      {/* 1. Enterprise narrative paragraph */}
      {framingContext && (
        <p className="text-sm text-foreground leading-relaxed">
          {framingContext}
        </p>
      )}

      {/* Retrieval summary line (chunks, sources, best score) */}
      {retrievalSummary && (
        <p className="text-xs text-muted-foreground">
          {typeof retrievalSummary.chunksConsidered === "number" && (
            <span>{retrievalSummary.chunksConsidered} chunks</span>
          )}
          {typeof retrievalSummary.distinctSources === "number" && (
            <span>{retrievalSummary.chunksConsidered != null ? " · " : ""}{retrievalSummary.distinctSources} sources</span>
          )}
          {typeof retrievalSummary.topSimilarityScore === "number" && retrievalSummary.topSimilarityScore > 0 && (
            <span>{retrievalSummary.chunksConsidered != null || retrievalSummary.distinctSources != null ? " · " : ""}best match {Math.round(retrievalSummary.topSimilarityScore * 100)}%</span>
          )}
        </p>
      )}

      {/* 2. Summary Table(s) — one per section */}
      <div className="space-y-4">
        {sections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-2">
            {/* Section heading */}
            <h3 className="text-sm font-semibold text-foreground border-b border-muted/50 pb-1.5">
              {section.title}
            </h3>

            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-muted/40">
                  <th className="text-left py-1.5 pr-4 text-xs font-semibold text-muted-foreground w-[28%]">
                    {headers.item}
                  </th>
                  <th className="text-left py-1.5 pr-2 text-xs font-semibold text-muted-foreground w-[12%]">
                    Priority
                  </th>
                  <th className="text-left py-1.5 pr-2 text-xs font-semibold text-muted-foreground w-[15%]">
                    Impact
                  </th>
                  <th className="text-left py-1.5 pr-4 text-xs font-semibold text-muted-foreground w-[30%]">
                    {headers.details}
                  </th>
                  <th className="text-left py-1.5 text-xs font-semibold text-muted-foreground w-[15%]">
                    Sources
                  </th>
                </tr>
              </thead>
              <tbody>
                {section.items.map((item, iIdx) => {
                  const citedSids = item.citations
                    ? Array.from(new Set(item.citations.map(c => c.sourceId)))
                    : [];
                  const priority = (item as any).priority;
                  const impact = (item as any).impact;
                  const detailsText = formatDetailsCell(item);
                  return (
                    <tr key={iIdx} className="border-b border-muted/20 hover:bg-muted/20 transition-colors">
                      <td className="py-2 pr-4 align-top">
                        <span className="text-foreground font-medium leading-snug">{item.text}</span>
                        {item.status ? <StatusBadge status={item.status} /> : null}
                      </td>
                      <td className="py-2 pr-2 align-top text-xs">
                        {priority != null && String(priority).trim() ? <PriorityPill priority={String(priority)} /> : <span className="text-muted-foreground">{UNAVAILABLE}</span>}
                      </td>
                      <td className="py-2 pr-2 align-top text-xs text-muted-foreground leading-snug">
                        {impact != null && String(impact).trim() ? String(impact) : UNAVAILABLE}
                      </td>
                      <td className="py-2 pr-4 align-top text-xs text-muted-foreground leading-snug">
                        {detailsText}
                      </td>
                      <td className="py-2 align-top">
                        {item.citations && item.citations.length > 0 && (
                          <span className="inline-flex gap-0.5 flex-wrap">
                            {isSingleSource ? (
                              <button
                                className="font-mono text-[11px] text-primary hover:text-primary/80 hover:underline cursor-pointer bg-primary/10 px-1 rounded transition-colors"
                                onClick={() => scrollToEvidence(0)}
                                title={dedupedEvidence[0] ? `View source: ${dedupedEvidence[0].title}` : "View source"}
                              >
                                [1]
                              </button>
                            ) : (
                              citedSids.map(sid => {
                                const evidenceIdx = evidenceIndexBySourceId.get(sid);
                                if (evidenceIdx === undefined) return null;
                                const labelIdx = sourceIndex.get(sid) ?? (evidenceIdx + 1);
                                return (
                                  <button
                                    key={sid}
                                    className="font-mono text-[11px] text-primary hover:text-primary/80 hover:underline cursor-pointer bg-primary/10 px-1 rounded transition-colors"
                                    onClick={() => scrollToEvidence(evidenceIdx)}
                                    title={`View source: ${dedupedEvidence[evidenceIdx].title}`}
                                  >
                                    [{labelIdx}]
                                  </button>
                                );
                              })
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* 3. Single source footer (when exactly 1 cited source) */}
      {isSingleSource && dedupedEvidence.length === 1 && (
        <div className="pt-3 border-t border-muted/50 flex items-center gap-2 text-sm text-muted-foreground">
          <ConnectorIcon type={dedupedEvidence[0].connectorType} className="h-3.5 w-3.5" />
          <span>Source:</span>
          {dedupedEvidence[0].url ? (
            <button
              onClick={() => window.open(dedupedEvidence[0].url, '_blank', 'noopener,noreferrer')}
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              {dedupedEvidence[0].title}
              <ExternalLink className="h-3 w-3" />
            </button>
          ) : (
            <span>{dedupedEvidence[0].title}</span>
          )}
        </div>
      )}

      {/* 4. Evidence panel (collapsed by default, cited-only sources) */}
      {showEvidenceSection && (
        <Collapsible
          open={isEvidenceOpen}
          onOpenChange={setIsEvidenceOpen}
          className="pt-4 border-t border-muted/50"
        >
          <CollapsibleTrigger className="flex items-center justify-between w-full group py-1">
            <span className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Files className="h-4 w-4 text-muted-foreground" />
              Evidence ({dedupedEvidence.length})
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:text-foreground",
                isEvidenceOpen && "rotate-180"
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
            <div className="mt-3 max-h-[280px] overflow-y-auto pr-1">
              <EvidenceList
                evidence={dedupedEvidence}
                highlightIndex={highlightedEvidence}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* 5. Details panel: structured extraction content only */}
      {hasDetails && (
        <Collapsible
          open={isDetailsOpen}
          onOpenChange={setIsDetailsOpen}
          className="pt-4 border-t border-muted/50"
        >
          <CollapsibleTrigger className="flex items-center justify-between w-full group py-1">
            <span className="text-sm font-semibold text-foreground">
              Details
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:text-foreground",
                isDetailsOpen && "rotate-180"
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
            <div className="mt-3 p-3 bg-primary/5 rounded-lg border-l-4 border-primary/40">
              {keyFacts && keyFacts.length > 0 ? (
                <ul className="space-y-1">
                  {keyFacts.map((fact, i) => (
                    <li key={i} className="text-sm flex items-start gap-1.5">
                      <span className="text-primary mt-0.5 font-bold text-xs">•</span>
                      <span className="leading-relaxed">
                        {fact.text}
                        {!isSingleSource && fact.citations && fact.citations.length > 0 && (
                          <span className="ml-1 inline-flex gap-0.5">
                            {Array.from(new Set(fact.citations.map(c => c.sourceId))).map(sid => {
                              const idx = dedupedEvidence.findIndex(e => e.id === sid);
                              if (idx === -1) return null;
                              return (
                                <button
                                  key={sid}
                                  className="font-mono text-[11px] text-primary hover:text-primary/80 hover:underline cursor-pointer bg-primary/10 px-1 rounded transition-colors"
                                  onClick={() => scrollToEvidence(idx)}
                                  title={`View source: ${dedupedEvidence[idx].title}`}
                                >
                                  [{idx + 1}]
                                </button>
                              );
                            })}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : summary ? (
                <ul className="space-y-1">
                  {summary.split("•").filter(Boolean).map((fact, i) => (
                    <li key={i} className="text-sm flex items-start gap-1.5">
                      <span className="text-primary mt-0.5 font-bold text-xs">•</span>
                      <span className="leading-relaxed">{fact.trim()}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* 6. Follow-up question */}
      {intentType && (
        <p className="text-xs text-muted-foreground italic pt-1">
          {getFollowUpQuestion(intentType)}
        </p>
      )}
    </div>
  );
}
