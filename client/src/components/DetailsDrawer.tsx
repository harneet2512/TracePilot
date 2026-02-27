import { useEffect, useMemo, useState } from "react";
import type { ChatDetails, ChatDebug, Citation, Section } from "@shared/schema";
import { ChevronDown, ExternalLink, FileText, ChevronRight } from "lucide-react";
import { SiSlack, SiJira, SiConfluence } from "react-icons/si";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface DetailsDrawerProps {
  details?: ChatDetails;
  citations?: Citation[];
  sections?: Section[];
  citationIndexMap?: Record<string, number>;
  evidence?: Array<{ id: string; title: string; url?: string; connectorType?: string; connectorLabel?: string }>;
  sources?: any[];
  debug?: ChatDebug;
  /** Legacy fields for backward compat with stored messages */
  retrievedChunks?: Array<{ chunkId: string; sourceId: string; snippet: string }>;
  detailsBlocks?: Array<{ type: string; title?: string; data: any }>;
  sourcesUsed?: any[];
  okrViewModel?: any;
}

function ConnectorIcon({ type, className = "h-4 w-4" }: { type?: string; className?: string }) {
  switch (type?.toLowerCase()) {
    case "drive":
    case "google":
      return <img src="https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg" className={className} alt="Drive" />;
    case "slack":
      return <SiSlack className={`${className} text-purple-500`} />;
    case "jira":
      return <SiJira className={`${className} text-blue-500`} />;
    case "confluence":
      return <SiConfluence className={`${className} text-blue-500`} />;
    default:
      return <FileText className={`${className} text-muted-foreground`} />;
  }
}

function CitationChip({ id, citation }: { id: string; citation?: Citation }) {
  const target = citation?.url
    || (citation?.sourceId ? `/api/sources/${citation.sourceId}/open` : undefined);
  return (
    <a
      className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1 text-[11px] font-mono font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded border border-primary/20 transition-colors cursor-pointer"
      href={target || "#"}
      target={target ? "_blank" : undefined}
      rel={target ? "noopener noreferrer" : undefined}
      onClick={(e) => {
        if (!target) e.preventDefault();
      }}
      data-testid="citation-chip"
      title={citation?.label || citation?.title || `Source ${id}`}
    >
      [{id}]
    </a>
  );
}

function ExcerptBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 200;
  const displayText = isLong && !expanded ? text.slice(0, 200) + "..." : text;

  return (
    <div className="text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1.5 mt-1" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
      {displayText}
      {isLong && (
        <button
          className="ml-1 text-primary hover:underline text-xs"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function SummaryTable({
  rows,
  citations,
}: {
  rows: ChatDetails["summaryRows"];
  citations?: Citation[];
}) {
  if (rows.length === 0) return null;

  return (
    <div data-testid="summary-table">
      <div className="text-xs uppercase text-muted-foreground mb-2 font-semibold">Summary</div>
      <div className="rounded border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="h-8 px-3 text-xs">Item</TableHead>
              <TableHead className="h-8 px-3 text-xs">Priority</TableHead>
              <TableHead className="h-8 px-3 text-xs">Owner</TableHead>
              <TableHead className="h-8 px-3 text-xs">Impact</TableHead>
              <TableHead className="h-8 px-3 text-xs">Sources</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => (
              <TableRow key={idx} data-testid="summary-row">
                <TableCell className="px-3 py-2 text-xs max-w-[220px]" style={{ overflowWrap: "anywhere" }}>
                  {row.item}
                </TableCell>
                <TableCell className="px-3 py-2 text-xs whitespace-nowrap">
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-xs font-medium",
                    row.priority.toLowerCase().includes("risk") || row.priority.toLowerCase().includes("behind") || row.priority.toLowerCase().includes("block")
                      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      : row.priority.toLowerCase().includes("track") || row.priority.toLowerCase().includes("on target")
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-muted text-muted-foreground"
                  )}>
                    {row.priority}
                  </span>
                </TableCell>
                <TableCell className="px-3 py-2 text-xs whitespace-nowrap">{row.owner}</TableCell>
                <TableCell className="px-3 py-2 text-xs max-w-[160px]" style={{ overflowWrap: "anywhere" }}>
                  {row.impact}
                </TableCell>
                <TableCell className="px-3 py-2">
                  <span className="inline-flex gap-0.5">
                    {row.citationIds.map((cid) => {
                      const cidNum = Number(cid);
                      const citation = citations?.[cidNum - 1]
                        ?? citations?.find((_c, i) => i + 1 === cidNum);
                      return (
                        <CitationChip
                          key={cid}
                          id={cid}
                          citation={citation ?? undefined}
                        />
                      );
                    })}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EvidenceList({
  evidenceBySource,
}: {
  evidenceBySource: ChatDetails["evidenceBySource"];
}) {
  if (evidenceBySource.length === 0) return null;

  return (
    <div data-testid="evidence-list">
      <div className="text-xs uppercase text-muted-foreground mb-2 font-semibold">Evidence</div>
      <div className="space-y-2">
        {evidenceBySource.map((source, idx) => (
          <EvidenceCard key={source.sourceKey || idx} source={source} index={idx + 1} />
        ))}
      </div>
    </div>
  );
}

function EvidenceCard({ source, index }: { source: ChatDetails["evidenceBySource"][number]; index: number }) {
  const [showExcerpts, setShowExcerpts] = useState(false);
  const hasExcerpts = source.excerpts.length > 0;

  return (
    <div className="rounded-lg border p-3 bg-muted/20" data-testid="evidence-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-mono font-semibold shrink-0">
            {index}
          </span>
          <ConnectorIcon type={source.label} className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium truncate" title={source.title}>
            {source.title}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">{source.label}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {hasExcerpts && (
            <button
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowExcerpts(!showExcerpts)}
            >
              <ChevronRight className={cn("h-3 w-3 transition-transform", showExcerpts && "rotate-90")} />
              {showExcerpts ? "Hide" : "Excerpts"}
            </button>
          )}
          {source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-primary/10 hover:bg-primary/15 text-primary rounded border border-primary/20 transition-colors font-medium"
              data-testid="evidence-open-link"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              Open
            </a>
          )}
        </div>
      </div>
      {showExcerpts && hasExcerpts && (
        <div className="mt-2 space-y-1">
          {source.excerpts.map((excerpt, eIdx) => (
            <ExcerptBlock key={eIdx} text={excerpt.text} />
          ))}
        </div>
      )}
    </div>
  );
}

function DebugPanel({ debug }: { debug: ChatDebug }) {
  return (
    <div data-testid="debug-panel" className="space-y-3">
      <div className="text-xs uppercase text-muted-foreground mb-1 font-semibold">Raw Debug Data</div>
      {debug.structured_report_raw && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">Structured Report</div>
          <pre className="text-xs whitespace-pre-wrap break-words bg-muted/30 p-2 rounded overflow-x-hidden max-h-[300px] overflow-y-auto">
            {JSON.stringify(debug.structured_report_raw, null, 2)}
          </pre>
        </div>
      )}
      {debug.retrieved_chunks_raw && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">Retrieved Chunks</div>
          <pre className="text-xs whitespace-pre-wrap break-words bg-muted/30 p-2 rounded overflow-x-hidden max-h-[300px] overflow-y-auto">
            {JSON.stringify(debug.retrieved_chunks_raw, null, 2)}
          </pre>
        </div>
      )}
      {debug.citation_mapping_raw && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">Citation Mapping</div>
          <pre className="text-xs whitespace-pre-wrap break-words bg-muted/30 p-2 rounded overflow-x-hidden max-h-[300px] overflow-y-auto">
            {JSON.stringify(debug.citation_mapping_raw, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * Build source-level index by walking sections in order (same as buildOrderedSources).
 * Returns a Map of sourceId -> 1-based index.
 */
function buildSourceIndex(
  sections: Section[] | undefined,
  citations: Citation[] | undefined,
): Map<string, number> {
  const sourceIndex = new Map<string, number>();
  let nextIdx = 1;

  // Walk sections items in order, assign by first sourceId appearance
  if (sections) {
    for (const section of sections) {
      for (const item of section.items) {
        if (item.citations) {
          for (const c of item.citations) {
            if (!sourceIndex.has(c.sourceId)) {
              sourceIndex.set(c.sourceId, nextIdx++);
            }
          }
        }
      }
    }
  }

  // Also include any citations not yet seen
  if (citations) {
    for (const c of citations) {
      if (!sourceIndex.has(c.sourceId)) {
        sourceIndex.set(c.sourceId, nextIdx++);
      }
    }
  }

  return sourceIndex;
}

/**
 * Derive summaryRows from legacy sections data (backward compat for stored messages).
 */
function deriveSummaryRows(
  sections: Section[] | undefined,
  citations: Citation[] | undefined,
  sourceIndexOverride?: Map<string, number>,
): ChatDetails["summaryRows"] {
  if (!sections || sections.length === 0) return [];

  const sourceIndex = sourceIndexOverride || buildSourceIndex(sections, citations);

  const rows: ChatDetails["summaryRows"] = [];
  for (const section of sections) {
    for (const item of section.items) {
      const cIds: string[] = [];
      if (item.citations) {
        for (const c of item.citations) {
          const mapped = sourceIndex.get(c.sourceId);
          if (mapped !== undefined) {
            const sid = String(mapped);
            if (!cIds.includes(sid)) cIds.push(sid);
          }
        }
      }
      rows.push({
        item: item.text,
        priority: item.status || "\u2014",
        owner: item.owner || "\u2014",
        impact: item.current || item.target || "\u2014",
        citationIds: cIds,
      });
    }
  }
  return rows;
}

/**
 * Derive evidenceBySource from legacy sources + retrieved chunks (backward compat).
 * Orders by source index when sections are available for stable [1][2] correlation.
 */
function deriveEvidenceBySource(
  sources: any[] | undefined,
  retrievedChunks: Array<{ sourceId: string; snippet: string }> | undefined,
  sections?: Section[],
  citations?: Citation[],
  sourceIndexOverride?: Map<string, number>,
): ChatDetails["evidenceBySource"] {
  if (!sources || sources.length === 0) return [];
  const chunksBySource = new Map<string, string[]>();
  if (retrievedChunks) {
    for (const chunk of retrievedChunks) {
      if (!chunksBySource.has(chunk.sourceId)) chunksBySource.set(chunk.sourceId, []);
      chunksBySource.get(chunk.sourceId)!.push(chunk.snippet);
    }
  }

  const sourceIndex = sourceIndexOverride || buildSourceIndex(sections, citations);

  // Dedupe sources by sourceId
  const seenIds = new Set<string>();
  const dedupedSources = sources.filter((src: any) => {
    const sid = src.sourceId || src.id;
    if (seenIds.has(sid)) return false;
    seenIds.add(sid);
    return true;
  });

  const mapped = dedupedSources.map((src: any) => {
    const sid = src.sourceId || src.id;
    const snippets = chunksBySource.get(sid) || [];
    return {
      sourceKey: sid,
      title: src.title || src.label || src.name || "Untitled",
      label: src.sourceTypeLabel || src.sourceType || src.connectorLabel || "Source",
      url: src.url || src.locationUrl || "",
      excerpts: snippets.slice(0, 2).map((s: string) => ({ text: s })),
      _sortIdx: sourceIndex.get(sid) ?? 999,
    };
  });

  mapped.sort((a, b) => a._sortIdx - b._sortIdx);
  return mapped.map(({ _sortIdx, ...rest }) => rest);
}

export function DetailsDrawer({
  details,
  citations,
  sections,
  citationIndexMap,
  sources,
  debug,
  retrievedChunks,
  sourcesUsed,
}: DetailsDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const debugCitations = import.meta.env.VITE_DEBUG_CITATIONS === "1";

  const sourceIndex = useMemo(() => {
    if (!citationIndexMap) return buildSourceIndex(sections, citations);
    const entries = Object.entries(citationIndexMap)
      .filter(([, idx]) => Number.isFinite(Number(idx)))
      .map(([sid, idx]) => [sid, Number(idx)] as const)
      .sort((a, b) => a[1] - b[1]);
    return new Map<string, number>(entries);
  }, [citationIndexMap, sections, citations]);

  // Resolve summary rows: prefer new contract, fallback to deriving from sections
  const summaryRows = useMemo(
    () => (details?.summaryRows?.length ? details.summaryRows : deriveSummaryRows(sections, citations, sourceIndex)),
    [details?.summaryRows, sections, citations, sourceIndex]
  );

  // Resolve evidence: prefer new contract, fallback to deriving from sources + chunks
  const evidenceBySource = useMemo(
    () =>
      details?.evidenceBySource?.length
        ? details.evidenceBySource
        : deriveEvidenceBySource(
            sourcesUsed || sources,
            retrievedChunks as any,
            sections,
            citations,
            sourceIndex,
          ),
    [details?.evidenceBySource, sourcesUsed, sources, retrievedChunks, sections, citations, sourceIndex]
  );

  const filteredEvidenceBySource = useMemo(() => {
    const citedIds = new Set(summaryRows.flatMap((row) => row.citationIds || []));
    if (citedIds.size === 0) return [];
    const citedSourceIds = new Set(
      Array.from(citedIds)
        .map((citationId) =>
          Array.from(sourceIndex.entries()).find(([, idx]) => String(idx) === citationId)?.[0]
        )
        .filter(Boolean) as string[]
    );
    return evidenceBySource.filter((ev, idx) => {
      // Backward-compatible fallback keeps index-based behavior if sourceKey is unavailable.
      const sourceKey = (ev as any).sourceKey as string | undefined;
      if (sourceKey) return citedSourceIds.has(sourceKey);
      return citedIds.has(String(idx + 1));
    });
  }, [summaryRows, evidenceBySource, sourceIndex]);

  useEffect(() => {
    if (!debugCitations) return;
    console.log("[DEBUG_CITATIONS] Summary renderer input", {
      summaryRows: summaryRows.map((row) => ({
        item: row.item,
        citationIds: row.citationIds,
      })),
      citations: (citations || []).map((c, idx) => ({
        idx: idx + 1,
        sourceId: c.sourceId,
        sourceVersionId: (c as any).sourceVersionId,
        label: c.label || c.title,
        url: c.url,
      })),
      evidenceBySource: evidenceBySource.map((ev, idx) => ({
        idx: idx + 1,
        sourceKey: ev.sourceKey,
        title: ev.title,
        url: ev.url,
      })),
      filteredEvidenceBySource: filteredEvidenceBySource.map((ev) => ev.sourceKey),
    });
  }, [debugCitations, summaryRows, citations, evidenceBySource, filteredEvidenceBySource]);

  const devDebugEnabled =
    process.env.NODE_ENV === "development" &&
    import.meta.env.VITE_DEV_DEBUG_UI === "1";

  const hasDebug =
    devDebugEnabled &&
    !!debug &&
    (debug.structured_report_raw ||
      debug.retrieved_chunks_raw ||
      debug.citation_mapping_raw);

  const hasContent = summaryRows.length > 0 || filteredEvidenceBySource.length > 0 || hasDebug;
  if (!hasContent) return null;

  const showTabs = devDebugEnabled && hasDebug;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="pt-3 border-t">
      <CollapsibleTrigger
        className="flex items-center justify-between w-full text-sm font-medium text-muted-foreground hover:text-foreground"
        data-testid="details-toggle"
      >
        <span>Details</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-4" data-testid="details-panel">
        {showTabs ? (
          <Tabs defaultValue="overview">
            <TabsList className="h-8">
              <TabsTrigger value="overview" className="text-xs px-3 py-1">Overview</TabsTrigger>
              <TabsTrigger value="debug" className="text-xs px-3 py-1">Debug</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="space-y-4 mt-3">
              <SummaryTable rows={summaryRows} citations={citations} />
              <EvidenceList evidenceBySource={filteredEvidenceBySource} />
            </TabsContent>
            <TabsContent value="debug" className="mt-3">
              {hasDebug && <DebugPanel debug={debug!} />}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-4" data-testid="details-content">
            <SummaryTable rows={summaryRows} citations={citations} />
            <EvidenceList evidenceBySource={filteredEvidenceBySource} />
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
