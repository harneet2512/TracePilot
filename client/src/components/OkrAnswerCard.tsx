import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { ChevronDown, Files, ExternalLink, FileText } from "lucide-react";
import { SiSlack, SiJira, SiConfluence } from "react-icons/si";
import { InlineCitations } from "./InlineCitations";
import { StatusBadge } from "./StatusBadge";
import type { OkrAnswerViewModel, CitationIndexEntry } from "@shared/schema";

interface OkrAnswerCardProps {
  viewModel: OkrAnswerViewModel;
  className?: string;
}

function ConnectorIcon({ type, className = "h-3 w-3" }: { type?: string; className?: string }) {
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

/**
 * Compute gap between target and current values.
 * Returns a gap string like "gap: +3.2s" or "gap: -$20K" when both values are numeric.
 * Returns null if values are not comparable.
 */
function computeGap(target?: string, current?: string): string | null {
  if (!target || !current) return null;
  
  // Extract numeric values and units from strings like "2s", "5.2s p95", "$180K", "95%"
  const parseValue = (str: string): { value: number; unit: string; prefix: string } | null => {
    // Handle dollar amounts: $180K, $2.5M, $1000
    const dollarMatch = str.match(/\$([0-9.]+)([KMB]?)/i);
    if (dollarMatch) {
      let value = parseFloat(dollarMatch[1]);
      const multiplier = dollarMatch[2]?.toUpperCase();
      if (multiplier === 'K') value *= 1000;
      else if (multiplier === 'M') value *= 1000000;
      else if (multiplier === 'B') value *= 1000000000;
      return { value, unit: multiplier || '', prefix: '$' };
    }
    
    // Handle time values: 2s, 5.2s, 100ms, 2s p95
    const timeMatch = str.match(/([0-9.]+)\s*(s|ms|sec|seconds?)/i);
    if (timeMatch) {
      let value = parseFloat(timeMatch[1]);
      const unit = timeMatch[2].toLowerCase();
      if (unit === 'ms') value /= 1000;
      return { value, unit: 's', prefix: '' };
    }
    
    // Handle percentages: 95%, 99.9%
    const percentMatch = str.match(/([0-9.]+)\s*%/);
    if (percentMatch) {
      return { value: parseFloat(percentMatch[1]), unit: '%', prefix: '' };
    }
    
    // Handle plain numbers with optional unit
    const plainMatch = str.match(/^([0-9.]+)\s*(\w*)$/);
    if (plainMatch) {
      return { value: parseFloat(plainMatch[1]), unit: plainMatch[2] || '', prefix: '' };
    }
    
    return null;
  };
  
  const targetParsed = parseValue(target);
  const currentParsed = parseValue(current);
  
  if (!targetParsed || !currentParsed) return null;
  
  // Only compare if units match (or both have no unit)
  if (targetParsed.unit !== currentParsed.unit) return null;
  if (targetParsed.prefix !== currentParsed.prefix) return null;
  
  const diff = currentParsed.value - targetParsed.value;
  
  // Only show gap if there's a meaningful difference (> 0.1%)
  if (Math.abs(diff) < 0.001 * Math.abs(targetParsed.value)) return null;
  
  // Format the gap
  const sign = diff > 0 ? '+' : '';
  const prefix = targetParsed.prefix;
  const unit = targetParsed.unit;
  
  // Format based on magnitude
  let formattedDiff: string;
  const absDiff = Math.abs(diff);
  
  if (prefix === '$') {
    if (absDiff >= 1000000) {
      formattedDiff = `${sign}${prefix}${(diff / 1000000).toFixed(1)}M`;
    } else if (absDiff >= 1000) {
      formattedDiff = `${sign}${prefix}${(diff / 1000).toFixed(1)}K`;
    } else {
      formattedDiff = `${sign}${prefix}${diff.toFixed(0)}`;
    }
  } else if (unit === 's') {
    formattedDiff = `${sign}${diff.toFixed(1)}${unit}`;
  } else if (unit === '%') {
    formattedDiff = `${sign}${diff.toFixed(1)}${unit}`;
  } else {
    formattedDiff = `${sign}${diff.toFixed(1)}${unit}`;
  }
  
  return `gap: ${formattedDiff}`;
}

/**
 * Enterprise-grade OKR Answer Card
 *
 * Renders a structured OKR response with:
 * - Title and timeframe badge header
 * - Key facts as chips with citation markers
 * - Objectives with KR table (Owner, Target, Current, Status, Due columns)
 * - Evidence panel showing only cited sources
 * - Related sources accordion (collapsed by default)
 */
export function OkrAnswerCard({ viewModel, className }: OkrAnswerCardProps) {
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const [highlightedEvidence, setHighlightedEvidence] = useState<number | undefined>();

  const scrollToEvidence = useCallback((citationId: number) => {
    // Expand evidence if collapsed
    if (!isEvidenceOpen) {
      setIsEvidenceOpen(true);
    }
    setHighlightedEvidence(citationId);
    // Scroll after expand animation
    setTimeout(() => {
      document.getElementById(`evidence-${citationId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }, 150);
    // Clear highlight after 1.5s
    setTimeout(() => setHighlightedEvidence(undefined), 1500);
  }, [isEvidenceOpen]);

  const { title, timeframe, framingContext, keyFacts, objectives, citationIndex, sourcesRelated } = viewModel;
  const isSingleSource = citationIndex.length === 1;

  return (
    <div className={cn("bg-card border rounded-lg p-6 space-y-5 max-w-4xl", className)}>
      {/* Header: Title + Timeframe Badge */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {timeframe && (
          <Badge variant="secondary" className="text-xs">
            {timeframe}
          </Badge>
        )}
      </div>

      {/* Executive Framing */}
      {framingContext && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {framingContext}
        </p>
      )}

      {/* Key Facts Row */}
      {keyFacts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {keyFacts.map((fact, idx) => (
            <div
              key={idx}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary/5 rounded-full text-sm"
            >
              <span>{fact.text}</span>
              {!isSingleSource && fact.citationIds.length > 0 && (
                <InlineCitations
                  ids={fact.citationIds}
                  onCitationClick={scrollToEvidence}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Objectives with KR Tables */}
      <div className="space-y-6">
        {objectives.map((objective, objIdx) => (
          <div key={objIdx} className="space-y-3">
            {/* Objective Title */}
            <div className="flex items-start gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0 mt-0.5">
                {objIdx + 1}
              </span>
              <div>
                <h3 className="font-semibold text-base text-foreground">
                  {objective.title}
                </h3>
                {objective.owner && (
                  <span className="text-xs text-muted-foreground">
                    Owner: {objective.owner}
                  </span>
                )}
              </div>
            </div>

            {/* Key Results Table */}
            {objective.keyResults.length > 0 && (
              <div className="ml-8 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[40%]">Key Result</TableHead>
                      <TableHead className="w-[12%]">Owner</TableHead>
                      <TableHead className="w-[12%]">Target</TableHead>
                      <TableHead className="w-[12%]">Current</TableHead>
                      <TableHead className="w-[12%]">Status</TableHead>
                      <TableHead className="w-[12%]">Due</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {objective.keyResults.map((kr, krIdx) => {
                      const gap = computeGap(kr.target, kr.current);
                      return (
                        <TableRow key={krIdx}>
                          <TableCell className="font-medium">
                            <div className="flex items-start gap-1">
                              <span>{kr.text}</span>
                              {!isSingleSource && kr.citationIds.length > 0 && (
                                <InlineCitations
                                  ids={kr.citationIds}
                                  onCitationClick={scrollToEvidence}
                                />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {kr.owner || "-"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {kr.target ? (
                              <Badge variant="outline" className="font-mono text-xs bg-primary/10 dark:bg-primary/10 border-primary/20 dark:border-primary/20">
                                {kr.target}
                              </Badge>
                            ) : "-"}
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {kr.current ? (
                                <Badge variant="outline" className="font-mono text-xs bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-700">
                                  {kr.current}
                                </Badge>
                              ) : "-"}
                              {gap && (
                                <span className="text-xs text-orange-600 dark:text-orange-400 font-medium whitespace-nowrap">
                                  {gap}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={kr.status} />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {kr.due || "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Single Source Footer */}
      {isSingleSource && citationIndex.length === 1 && (
        <div className="pt-3 border-t border-muted/50 flex items-center gap-2 text-sm text-muted-foreground">
          <ConnectorIcon type={citationIndex[0].connectorType} />
          <span>Source:</span>
          {citationIndex[0].url ? (
            <button
              onClick={() => window.open(citationIndex[0].url, '_blank', 'noopener,noreferrer')}
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              {citationIndex[0].title}
              <ExternalLink className="h-3 w-3" />
            </button>
          ) : (
            <span>{citationIndex[0].title}</span>
          )}
        </div>
      )}

      {/* Evidence Section (Collapsible) */}
      {citationIndex.length > 1 && (
        <Collapsible
          open={isEvidenceOpen}
          onOpenChange={setIsEvidenceOpen}
          className="pt-4 border-t border-muted/50"
        >
          <CollapsibleTrigger className="flex items-center justify-between w-full group py-1">
            <span className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Files className="h-4 w-4 text-muted-foreground" />
              Evidence ({citationIndex.length} cited)
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:text-foreground",
                isEvidenceOpen && "rotate-180"
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
            <div className="mt-3 max-h-[320px] overflow-y-auto pr-1 space-y-2">
              {citationIndex.map((ev) => (
                <div
                  key={ev.id}
                  id={`evidence-${ev.id}`}
                  className={cn(
                    "flex items-start justify-between gap-3 p-3 rounded-lg transition-all duration-300",
                    highlightedEvidence === ev.id
                      ? 'bg-primary/15 ring-2 ring-primary/40'
                      : 'bg-muted/30 hover:bg-muted/50'
                  )}
                >
                  {/* Left: [n] Title — description */}
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    {/* Index badge */}
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-mono font-semibold shrink-0 mt-0.5">
                      {ev.id}
                    </span>

                    {/* Title and description */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm font-medium truncate max-w-[200px] lg:max-w-[300px] cursor-default">
                                {ev.title}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="break-words">{ev.title}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        {ev.description && (
                          <>
                            <span className="text-muted-foreground">—</span>
                            <span className="text-sm text-muted-foreground truncate">
                              {ev.description}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <ConnectorIcon type={ev.connectorType} className="h-3 w-3" />
                        <span className="text-xs text-muted-foreground">
                          {ev.connectorLabel || ev.connectorType || 'Source'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Open button */}
                  {ev.url ? (
                    <button
                      onClick={() => window.open(ev.url, '_blank', 'noopener,noreferrer')}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-primary/10 hover:bg-primary/15 text-primary rounded border border-primary/20 transition-colors font-medium shrink-0"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-muted text-muted-foreground rounded border border-muted cursor-not-allowed opacity-50 shrink-0">
                      <ExternalLink className="h-3 w-3" />
                      Open
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

    </div>
  );
}
