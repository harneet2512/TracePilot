import { ApprovalModal } from "@/components/ApprovalModal";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, Redirect } from "wouter";
import { Layout } from "@/components/layout";
import { ChatSidebar } from "@/components/ChatSidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { DetailsDrawer } from "@/components/DetailsDrawer";
import { DocAnswer } from "@/components/DocAnswer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Send,
  Loader2,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Edit3,
  Ticket,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { SiJira, SiSlack, SiConfluence } from "react-icons/si";
import { Copy, Check } from "lucide-react";
import type { ChatResponse, Citation, Action, Message, OkrAnswerViewModel } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { csrfHeaders } from "@/lib/csrf";
import { useConversations, useCreateConversation, useMessages, useConversation } from "@/hooks/use-conversations";
import { conversationKeys } from "@/lib/query-keys";
import quickRepliesConfig from "@config/quickReplies.json";

class SessionExpiredError extends Error {
  constructor() {
    super("Session expired. Please log in again.");
    this.name = "SessionExpiredError";
  }
}

const toolIcons: Record<string, React.ReactNode> = {
  "jira.create_issue": <SiJira className="h-4 w-4" />,
  "jira.update_issue": <SiJira className="h-4 w-4" />,
  "slack.post_message": <SiSlack className="h-4 w-4" />,
  "confluence.upsert_page": <SiConfluence className="h-4 w-4" />,
};

const toolLabels: Record<string, string> = {
  "jira.create_issue": "Create Jira Issue",
  "jira.update_issue": "Update Jira Issue",
  "slack.post_message": "Post to Slack",
  "confluence.upsert_page": "Upsert Confluence Page",
};

// Detect complex prompts that warrant a TODO checklist
const isComplexPrompt = (text: string): boolean => {
  const trimmed = text.trim().toLowerCase();

  // Never show checklist for trivial/greeting prompts
  const trivialPatterns = /^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|cool|bye|goodbye|good morning|good afternoon|good evening|what can you do|help|who are you)[\s!.?]*$/i;
  if (trivialPatterns.test(trimmed)) return false;

  // Doc-intent keywords always warrant checklist (even if short)
  const docIntentKeywords = ['okr', 'okrs', 'roadmap', 'policy', 'q4', 'q3', 'q2', 'q1', 'blockers', 'launch', 'vector database', 'objectives', 'initiatives'];
  if (docIntentKeywords.some(kw => trimmed.includes(kw))) return true;

  // Short prompts without doc keywords are not complex
  if (trimmed.length < 120) return false;

  // Long prompts are complex
  if (text.length > 300) return true;

  // Check for complexity keywords
  const keywords = ['implement', 'fix', 'requirements', 'acceptance', 'scope', 'step', 'checklist', 'todo', 'plan', 'build', 'create', 'design'];
  return keywords.some(kw => trimmed.includes(kw));
};

const TRIVIAL_RE = /^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|cool|bye|goodbye|good morning|good afternoon|good evening|what can you do|help|who are you)[\s!.?]*$/i;

function normalizeAnswerForDisplay(text: string): string {
  let result = text || "";
  result = result.replace(/\*\*(.*?)\*\*/g, "$1");
  result = result.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  result = result.replace(/\s[—–]\s/g, ", ");
  result = result.replace(/[—–]/g, ". ");
  result = result.replace(/^\s*(?:[*•●▪]|\d+\.)\s+/gm, "- ");
  result = result.replace(/\n{3,}/g, "\n\n");
  return result.trim();
}

function CitationPopover({ citation, index, children }: { citation: any; index: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const sourceId = citation?.sourceId ?? citation?.id;
  const title = citation?.title ?? citation?.label ?? "Source";
  const excerpt = citation?.snippet ?? citation?.excerpt ?? "";
  const url = citation?.url ?? (sourceId ? `/api/sources/${sourceId}/open` : undefined);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent
        className="w-80 max-h-[min(60vh,320px)] overflow-auto"
        align="start"
        side="top"
        sideOffset={6}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-2">
          <div className="font-medium text-sm truncate" title={title}>{title}</div>
          {excerpt && (
            <p className="text-xs text-muted-foreground line-clamp-4 break-words">{excerpt}</p>
          )}
          {url && (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center gap-1 text-xs"
              onClick={() => {
                window.open(url, "_blank", "noopener,noreferrer");
                setOpen(false);
              }}
            >
              <ExternalLink className="h-3 w-3" />
              Open source
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function renderInlineCitationNodes(text: string, citations?: any[]) {
  if (!citations || citations.length === 0) return text;
  const nodes: any[] = [];
  const pattern = /\[(\d+)\]/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const idx = Number(match[1]) - 1;
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    const citation = citations[idx];
    if (citation) {
      const sourceId = citation.sourceId || citation.id;
      const target = citation.url
        || (sourceId ? `/api/sources/${sourceId}/open` : undefined);
      nodes.push(
        <CitationPopover key={`inline-citation-${idx}-${match.index}`} citation={citation} index={idx}>
          <button
            type="button"
            className="mx-0.5 text-xs text-primary hover:underline cursor-pointer"
            data-testid="inline-citation-link"
          >
            [{idx + 1}]
          </button>
        </CitationPopover>
      );
    } else {
      nodes.push(match[0]);
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) {
    nodes.push(text.slice(last));
  }
  return nodes;
}

function SafeTextRenderer({ text, className, citations }: { text: string; className?: string; citations?: any[] }) {
  const cleaned = normalizeAnswerForDisplay(text);
  if (!cleaned) return null;

  const lines = cleaned.split(/\r?\n/);
  const blocks: Array<{ type: "p"; text: string } | { type: "ul"; items: string[] }> = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "p", text: paragraph.join(" ").trim() });
    paragraph = [];
  };

  const flushBullets = () => {
    if (!bullets.length) return;
    blocks.push({ type: "ul", items: [...bullets] });
    bullets = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushBullets();
      continue;
    }

    const bulletMatch = trimmed.match(/^-\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      bullets.push(bulletMatch[1].trim());
      continue;
    }

    flushBullets();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushBullets();

  return (
    <div className={cn("space-y-3", className)}>
      {blocks.map((block, index) => (
        block.type === "p" ? (
          <p key={`p-${index}`} className="leading-relaxed">
            {renderInlineCitationNodes(block.text, citations)}
          </p>
        ) : (
          <ul key={`ul-${index}`} className="list-disc pl-5 space-y-1.5">
            {block.items.map((item, itemIndex) => (
              <li key={`li-${index}-${itemIndex}`} className="leading-relaxed">
                {renderInlineCitationNodes(item, citations)}
              </li>
            ))}
          </ul>
        )
      ))}
    </div>
  );
}

// Parse bullets into structured sections with objectives and items
interface ParsedItem {
  text: string;
  owner?: string;
  target?: string;
  current?: string;
  due?: string;
  status?: string;
  citations: Citation[];
}

interface ParsedSection {
  heading: string;
  items: ParsedItem[];
  citations: Citation[];
}

function parseBulletsIntoSections(bullets: Array<{ claim: string; citations: Citation[] }>): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let currentSection: ParsedSection | null = null;

  for (const bullet of bullets) {
    const claim = bullet.claim.trim();

    // Detect objective header: short, ends with colon or is capitalized phrase without metadata
    const isHeader = (
      claim.length < 80 &&
      !claim.toLowerCase().includes('owner:') &&
      !claim.toLowerCase().includes('target:') &&
      !claim.toLowerCase().includes('current:') &&
      (claim.endsWith(':') || /^(objective|goal|initiative|priority|focus area)/i.test(claim) || /^\d+\.\s*[A-Z]/.test(claim))
    );

    if (isHeader) {
      // Start new section
      currentSection = {
        heading: claim.replace(/:$/, ''),
        items: [],
        citations: bullet.citations
      };
      sections.push(currentSection);
    } else {
      // Parse metadata from claim
      const item = parseItemMetadata(claim, bullet.citations);

      if (currentSection) {
        currentSection.items.push(item);
      } else {
        // No section yet, create default
        currentSection = { heading: '', items: [item], citations: [] };
        sections.push(currentSection);
      }
    }
  }

  return sections;
}

function parseItemMetadata(text: string, citations: Citation[]): ParsedItem {
  let remaining = text;
  let owner: string | undefined;
  let target: string | undefined;
  let current: string | undefined;
  let due: string | undefined;
  let status: string | undefined;

  // Extract Status: ... (e.g. Status: On Track, At Risk, Behind)
  const statusMatch = remaining.match(/Status:\s*([^,.\n]+)/i);
  if (statusMatch) {
    status = statusMatch[1].trim();
    remaining = remaining.replace(statusMatch[0], '').trim();
  }

  // Extract Owner: ...
  const ownerMatch = remaining.match(/Owner:\s*([^,.\n]+)/i);
  if (ownerMatch) {
    owner = ownerMatch[1].trim();
    remaining = remaining.replace(ownerMatch[0], '').trim();
  }

  // Extract Target: ...
  const targetMatch = remaining.match(/Target:\s*([^,.\n]+)/i);
  if (targetMatch) {
    target = targetMatch[1].trim();
    remaining = remaining.replace(targetMatch[0], '').trim();
  }

  // Extract Current: ... or Current baseline: ...
  const currentMatch = remaining.match(/Current(?:\s+baseline)?:\s*([^,.\n]+)/i);
  if (currentMatch) {
    current = currentMatch[1].trim();
    remaining = remaining.replace(currentMatch[0], '').trim();
  }

  // Extract Due/by date
  const dueMatch = remaining.match(/(?:Due|by|complete by|deadline):\s*([^,.\n]+)/i) ||
    remaining.match(/by\s+(Q[1-4]\s*\d{4}|end of \w+|\w+\s+\d{4})/i);
  if (dueMatch) {
    due = dueMatch[1].trim();
    remaining = remaining.replace(dueMatch[0], '').trim();
  }

  // Clean up remaining text
  remaining = remaining.replace(/^[-•]\s*/, '').replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();

  return { text: remaining || text, owner, target, current, due, status, citations };
}

// Task type for TODO checklist
type TaskItem = { id: string; text: string; state: "todo" | "doing" | "done" | "error" };
type ProcessingPhase = "SEARCHING" | "RETRIEVING" | "DRAFTING" | "VALIDATING" | "DONE";

function applyPhaseToTasks(tasks: TaskItem[] | undefined, phase: ProcessingPhase): TaskItem[] | undefined {
  if (!tasks || tasks.length === 0) return tasks;

  const phaseIndex: Record<ProcessingPhase, number> = {
    SEARCHING: 0,
    RETRIEVING: 1,
    DRAFTING: 2,
    VALIDATING: 3,
    DONE: tasks.length,
  };

  const activeIndex = phaseIndex[phase];
  return tasks.map((task, index) => {
    if (phase === "DONE") return { ...task, state: "done" };
    if (index < activeIndex) return { ...task, state: "done" };
    if (index === activeIndex) return { ...task, state: "doing" };
    return { ...task, state: "todo" };
  });
}

function phaseLabel(phase: ProcessingPhase): string {
  switch (phase) {
    case "SEARCHING":
      return "Searching knowledge base";
    case "RETRIEVING":
      return "Retrieving evidence";
    case "DRAFTING":
      return "Drafting response";
    case "VALIDATING":
      return "Validating citations";
    case "DONE":
      return "Completed";
    default:
      return "Processing";
  }
}

// ThinkingBubble with compact status header and collapsible step list
function ThinkingBubble({ tasks, statusLabel }: { tasks?: TaskItem[]; statusLabel?: string }) {
  const [stepsOpen, setStepsOpen] = useState(false); // collapsed by default

  const hasTasks = tasks && tasks.length > 0;

  return (
    <div className="mb-6 space-y-4 group" data-testid="assistant-message" data-status="pending">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
        <div className={`px-3 py-2.5 bg-card rounded-lg border shadow-sm ${hasTasks ? 'flex-1' : ''}`}>
          {/* Compact status header — always visible */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-base font-medium text-foreground" data-testid="thinking-label">
                {statusLabel || "Searching knowledge base"}
                <span className="animate-pulse">...</span>
              </span>
            </div>
            {/* Step count badge + toggle — only when tasks exist */}
            {hasTasks && (
              <button
                onClick={() => setStepsOpen(o => !o)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                data-testid="processing-steps-toggle"
              >
                <span>{tasks.filter(t => t.state === 'done').length}/{tasks.length} steps</span>
                <ChevronDown className={cn("h-3 w-3 transition-transform", stepsOpen && "rotate-180")} />
              </button>
            )}
          </div>

          {/* Step list — collapsed by default */}
          {hasTasks && stepsOpen && (
            <div className="space-y-3 border-t pt-3 mt-3" data-testid="processing-steps-list">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Processing Steps
              </h4>
              {tasks.map((task) => (
                <div key={task.id} className="flex items-start gap-2.5 text-sm p-2 rounded bg-muted/30">
                  <div className="shrink-0 mt-0.5">
                    {task.state === "todo" && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/40" />}
                    {task.state === "doing" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    {task.state === "done" && (
                      <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    {task.state === "error" && (
                      <svg className="h-4 w-4 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </div>
                  <span className={task.state === "done" ? "line-through text-muted-foreground" : "text-foreground"}>
                    {task.text}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function CitationBadge({ citation, index }: { citation: Citation; index: number }) {
  // Try to open external URL if available, otherwise fallback to internal viewer
  const handleClick = (e: React.MouseEvent) => {
    // If citation has url, open it directly
    if (citation.url) {
      e.preventDefault();
      window.open(citation.url, '_blank', 'noopener,noreferrer');
      return;
    }
    // Fallback: open via API redirect route
  };

  // Extract filename from title, truncate if needed
  const rawTitle = (citation as any).title || citation.label || `Source ${index + 1}`;
  const displayName = rawTitle.length > 25 ? rawTitle.slice(0, 22) + "..." : rawTitle;

  // If there's an external URL, use a button with filename chip
  if (citation.url) {
    return (
      <button
        onClick={handleClick}
        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-primary/10 hover:bg-primary/15 text-primary rounded transition-colors border border-primary/20 cursor-pointer max-w-[180px]"
        title={`Open: ${rawTitle}`}
        data-testid={`citation-${index}`}
      >
        <FileText className="h-3 w-3 shrink-0" />
        <span className="font-medium truncate">{displayName}</span>
      </button>
    );
  }

  // Fallback: open via API redirect route
  return (
    <button
      onClick={() => {
        const target = `/api/sources/${citation.sourceId}/open`;
        window.open(target, '_blank', 'noopener,noreferrer');
      }}
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-secondary hover:bg-accent rounded transition-colors border cursor-pointer max-w-[180px]"
      data-testid={`citation-${index}`}
    >
      <FileText className="h-3 w-3 shrink-0" />
      <span className="truncate">{displayName}</span>
    </button>
  );
}

function ActionDraftPanel({
  action,
  onApprove,
  onCancel,
  isPending,
}: {
  action: Action;
  onApprove: (editedDraft: Record<string, unknown>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(action.draft);
  const [isEditing, setIsEditing] = useState(false);

  const handleFieldChange = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Card className="border-2 border-primary/20 bg-accent/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            {toolIcons[action.type]}
            <CardTitle className="text-base font-medium">
              {toolLabels[action.type] || action.type}
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
            data-testid="button-edit-draft"
          >
            <Edit3 className="h-4 w-4 mr-1" />
            {isEditing ? "Preview" : "Edit"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{action.rationale}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEditing ? (
          <div className="space-y-3">
            {Object.entries(draft).map(([key, value]) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs font-medium capitalize">
                  {key.replace(/([A-Z])/g, " $1").trim()}
                </Label>
                {typeof value === "string" && value.length > 100 ? (
                  <Textarea
                    value={String(value)}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    className="text-sm font-mono"
                    rows={4}
                    data-testid={`input-draft-${key}`}
                  />
                ) : (
                  <Input
                    value={String(value ?? "")}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    className="text-sm font-mono"
                    data-testid={`input-draft-${key}`}
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <pre className="text-xs font-mono bg-muted/50 p-3 rounded-md overflow-x-auto">
            {JSON.stringify(draft, null, 2)}
          </pre>
        )}

        {action.citations.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Citations:</span>
            {action.citations.map((c, i) => (
              <CitationBadge key={i} citation={c} index={i} />
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={() => onApprove(draft)}
            disabled={isPending}
            data-testid="button-approve-action"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Executing...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve & Execute
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
            data-testid="button-cancel-action"
          >
            <XCircle className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Extended message type for local state
export type LocalMessage = Message & {
  status?: "pending" | "thinking" | "streaming" | "error" | "complete";
  workStatusLabel?: string;
  tasks?: TaskItem[];
};

function MessageBubble({
  message,
  onApprove,
  onCancel,
  isPending,
  onProposeJira,
  onSendQuickReply,
  conversationId,
}: {
  message: LocalMessage;
  onApprove?: (action: Action, editedDraft: Record<string, unknown>) => void;
  onCancel?: () => void;
  isPending?: boolean;
  onProposeJira: (citation: Citation) => void;
  onSendQuickReply?: (text: string) => void;
  conversationId?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  // Thinking State - use ThinkingBubble with rotating labels and optional tasks
  if (message.status === "thinking") {
    return <ThinkingBubble tasks={message.tasks} statusLabel={message.workStatusLabel} />;
  }

  // Streaming State - show partial text with cursor and skeleton trust badge
  if (message.status === "streaming") {
    return (
      <div className="mb-6 space-y-4 group" data-testid="assistant-message" data-status="streaming">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </div>
          <div className="p-3 bg-muted/20 rounded-lg min-w-[200px] max-w-3xl min-w-0 flex-1 space-y-2" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
            <div className="text-sm leading-relaxed whitespace-pre-wrap">
              {message.content}
              <span className="inline-block w-2 h-4 bg-primary/60 animate-pulse ml-0.5" />
            </div>
            <div className="h-5 w-20 rounded-full bg-muted animate-pulse" data-testid="trust-badge-skeleton" />
          </div>
        </div>
      </div>
    );
  }

  // Error State
  if (message.status === "error") {
    return (
      <div className="mb-6 space-y-4 group" data-testid="assistant-message" data-status="error">
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
          Something went wrong. Please try again.
        </div>
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="flex justify-end mb-6 group" data-testid="user-message">
        <div className="flex items-start gap-2 max-w-2xl pl-10 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity mt-2 shrink-0"
            onClick={handleCopy}
            title="Copy"
          >
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
          </Button>
          <div className={`bg-primary text-primary-foreground rounded-lg px-4 py-3 min-w-0 ${message.status === 'pending' ? 'opacity-70' : ''}`} style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
            <p className="text-sm border-none whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
      </div>
    );
  }

  // Parse response from metadata if available (for assistant messages from DB)
  const responseData = (message.metadataJson as any)?.response as ChatResponse | undefined;
  // OR fallback to message.response (if from local mutation optimistic update)
  const response = responseData || (message as any).response;

  // Backwards compatibility for plain content messages
  const content = message.content;

  // Render Sources Panel Logic
  // Prefer top-level 'sources' list if available (new schema), else citations
  const rawSourcesList = (message as any).sources || response?.sources || [];
  const sourcesList: any[] = Array.from(
    new Map<string, any>(rawSourcesList.map((s: any) => [s.sourceId || s.id, s] as [string, any])).values()
  );
  const hasSources = sourcesList.length > 0;
  
  // DocAnswer component (used for structured section responses) already renders its own
  // evidence panel internally, so we should NOT render a separate panel here when DocAnswer
  // is used. This avoids the duplicate evidence panel bug.
  const hasStructuredSections = response?.sections && response.sections.length > 0;
  
  // Only show evidence panel for legacy bullets-based responses (NOT for DocAnswer responses)
  const hasLegacyBullets = response?.bullets && response.bullets.length > 0 && 
                          response.bullets.some((b: { claim: string }) => b.claim) && 
                          !hasStructuredSections;
  const showEvidencePanel = hasSources && hasLegacyBullets;
  const assistantStatus = message.status === "complete" || !message.status ? "done" : message.status === "streaming" ? "streaming" : "pending";

  return (
    <div className="mb-6 space-y-4 group" data-testid="assistant-message" data-status={assistantStatus}>
      <div className="space-y-3 relative">
        <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleCopy}
            title="Copy"
          >
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
          </Button>
        </div>

        {response?.needsClarification && response.clarifyingQuestions.length > 0 ? (
          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardContent className="pt-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium mb-2">
                    I need some clarification:
                  </p>
                  <ul className="list-disc list-inside space-y-1">
                    {response.clarifyingQuestions.map((q: string, i: number) => (
                      <li key={i} className="text-sm text-muted-foreground">
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="bg-card border rounded-lg p-6 space-y-4 min-w-0 max-w-full" data-testid="assistant-message-content" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
            {hasStructuredSections ? (
              <DocAnswer
                framingContext={(response as any)?.framingContext}
                sourceSummary={(response as any)?.sourceSummary}
                summary={(response as any)?.summary}
                keyFacts={(response as any)?.keyFacts}
                sections={response?.sections || []}
                evidence={(() => {
                  const bySource = (response?.details as any)?.evidenceBySource as Array<{ sourceKey: string; title: string; label: string; url: string; excerpts?: { text: string }[] }> | undefined;
                  const base = ((response as any)?.evidence?.length > 0)
                    ? (response as any).evidence
                    : (response?.sources || []).map((s: any) => ({
                        id: s.sourceId || s.id,
                        title: s.title || s.label || "Source",
                        url: s.url,
                        connectorType: s.sourceType,
                        connectorLabel: s.sourceTypeLabel,
                      }));
                  if (!bySource?.length) return base;
                  return base.map((ev: any) => {
                    const match = bySource.find((e: any) => e.sourceKey === ev.id);
                    return match ? { ...ev, excerpts: match.excerpts } : ev;
                  });
                })()}
                relatedSources={((response as any)?.relatedSources || []).map((s: any) => ({
                  id: s.sourceId || s.id,
                  title: s.title || s.label || "Source",
                  url: s.url,
                  connectorType: s.sourceType,
                  connectorLabel: s.sourceTypeLabel,
                }))}
                intentType={(response as any)?.intentType}
                isSingleSource={sourcesList.length <= 1}
                citationIndexMap={(response as any)?.citationIndexMap || (response as any)?._citationIndexMap}
                retrievalSummary={(response as any)?.retrievalSummary}
              />
            ) : (
              <>
                {(response as any)?.retrievalSummary && (
                  <p className="text-xs text-muted-foreground mb-2">
                    {(response as any).retrievalSummary.chunksConsidered != null && <span>{(response as any).retrievalSummary.chunksConsidered} chunks</span>}
                    {(response as any).retrievalSummary.distinctSources != null && <span>{(response as any).retrievalSummary.chunksConsidered != null ? " · " : ""}{(response as any).retrievalSummary.distinctSources} sources</span>}
                    {(response as any).retrievalSummary.topSimilarityScore != null && (response as any).retrievalSummary.topSimilarityScore > 0 && <span>{(response as any).retrievalSummary.chunksConsidered != null || (response as any).retrievalSummary.distinctSources != null ? " · " : ""}best match {Math.round((response as any).retrievalSummary.topSimilarityScore * 100)}%</span>}
                  </p>
                )}
                <SafeTextRenderer
                  text={response?.answer_text || response?.answer || content}
                  className="text-sm"
                  citations={response?.citations?.length ? response.citations : (response?.sources || [])}
                />
              </>
            )}

            <DetailsDrawer
              details={response?.details}
              citations={response?.citations || response?.sources || []}
              sections={response?.sections}
              sources={response?.sources}
              citationIndexMap={(response as any)?.citationIndexMap || (response as any)?._citationIndexMap}
              debug={response?.debug || (message.metadataJson as any)?.debug}
              retrievedChunks={response?.retrieved_chunks}
              sourcesUsed={response?.sources_used || sourcesList}
            />
            {(() => {
              const trust = (response as any)?.trustSignal as { level?: string; label?: string; detail?: string } | undefined;
              const replyId = (response as any)?.replyId as string | undefined;
              if (!trust?.label) return null;
              const level = (trust.level ?? "review").toLowerCase();
              const isGrounded = level === "grounded";
              const isWarning = level === "warning";
              const badge = (
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                    isGrounded && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
                    level === "review" && "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
                    isWarning && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                  )}
                >
                  {trust.label}
                </span>
              );
              const wrap = (el: React.ReactNode) =>
                replyId && conversationId ? (
                  <a href={`/admin/chats/${conversationId}/replies/${replyId}`} className="inline-flex focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-full">
                    {el}
                  </a>
                ) : (
                  el
                );
              return (
                <div className="mt-2 flex items-center">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>{wrap(badge)}</TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        {trust.detail ?? trust.label}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              );
            })()}
            {(response as any)?.quickReplies?.length > 0 && onSendQuickReply && (
              <div className="flex flex-wrap gap-2 mt-3">
                {(response as any).quickReplies.map((qr: { label: string; text: string }, idx: number) => (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => onSendQuickReply(qr.text)}
                  >
                    {qr.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        {response?.action && onApprove && onCancel && (
          <ActionDraftPanel
            action={response.action}
            onApprove={(draft) => onApprove(response.action!, draft)}
            onCancel={onCancel}
            isPending={isPending || false}
          />
        )}
      </div>

      <span className="text-xs text-muted-foreground">
        {new Date(message.createdAt).toLocaleTimeString()}
      </span>
    </div>
  );
}

export default function ChatPage() {
  // Get conversationId from URL params
  const [matchConversation, params] = useRoute("/chat/:conversationId");
  const [, navigate] = useLocation();
  const conversationId = params?.conversationId;

  // Hooks
  const { data: conversations, isLoading: isLoadingConversations } = useConversations();
  const createConversationMutation = useCreateConversation();
  const { data: messages = [], isLoading: isLoadingMessages } = useMessages(conversationId || null);

  // Auto-redirect or create if no conversation
  useEffect(() => {
    // If no conversationId is present in URL
    if (!matchConversation || !conversationId) {
      if (conversations && conversations.length > 0) {
        // Redirect to most recent
        navigate(`/chat/${conversations[0].id}`);
      } else if (conversations && conversations.length === 0 && !createConversationMutation.isPending && !isCreatingConversation.current) {
        // Create new one immediately so we have an ID
        isCreatingConversation.current = true;
        createConversationMutation.mutate(undefined, {
          onSuccess: (conv) => {
            isCreatingConversation.current = false;
            navigate(`/chat/${conv.id}`);
          },
          onError: () => {
            isCreatingConversation.current = false;
          }
        });
      }
    }
  }, [conversationId, conversations, createConversationMutation.isPending]);

  const [input, setInput] = useState("");
  const [dynamicSuggestions, setDynamicSuggestions] = useState<Array<{ label: string; text: string }>>([]);
  const defaultInitialSuggestions: Array<{ label: string; text: string }> =
    (quickRepliesConfig as any).connectorSuggestions?.default ?? [];
  const [initialSuggestions, setInitialSuggestions] = useState<Array<{ label: string; text: string }>>(defaultInitialSuggestions);
  const [localPendingAction, setLocalPendingAction] = useState<{
    action: Action;
    requestId: string;
  } | null>(null);

  // Track pending optimistic messages to transfer across conversation creation
  const pendingOptimisticMessages = useRef<LocalMessage[]>([]);
  // Prevent double conversation creation
  const isCreatingConversation = useRef(false);

  // Approval Modal State
  const [isApprovalOpen, setIsApprovalOpen] = useState(false);
  const [approvalId, setApprovalId] = useState<number | null>(null);
  const [proposal, setProposal] = useState<any>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isSendingRef = useRef(false);
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);
  const [showJumpButton, setShowJumpButton] = useState(false);

  // Fetch initial suggestions from server (connector-aware)
  useEffect(() => {
    fetch("/api/chat/suggestions?initial=true", { credentials: "include", headers: csrfHeaders() })
      .then((r) => r.json())
      .then((d) => {
        const fetched = d.suggestions || [];
        if (fetched.length > 0) setInitialSuggestions(fetched);
      })
      .catch(() => {
        // Keep defaultInitialSuggestions from quickReplies.json
      });
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 150) + "px";
  }, [input]);

  // Scroll tracking
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]'
    ) as HTMLElement | null;
    if (!viewport) return;
    const handler = () => {
      const atBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 60;
      isAtBottomRef.current = atBottom;
      setShowJumpButton(!atBottom);
    };
    viewport.addEventListener("scroll", handler, { passive: true });
    return () => viewport.removeEventListener("scroll", handler);
  }, []);

  // Scroll to bottom on new messages (only when already at bottom)
  useEffect(() => {
    if (isAtBottomRef.current) {
      scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, localPendingAction]);

  // queryClient is already imported from "@/lib/queryClient"

  // Helper to generate temp IDs
  const generateTempId = () => `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const chatMutation = useMutation({
    mutationFn: async ({ text, requestId: _requestId }: { text: string; requestId: string }) => {
      const currentConvId = conversationId;
      const queryKey = conversationKeys.messages(conversationId || "");

      // Sliding window: send full conversation history so follow-ups can reference prior turns (server uses last 10 pairs)
      const MAX_HISTORY_MESSAGES = 20;
      const conversationHistory = (messages || [])
        .filter((m): m is Message & { role: "user" | "assistant" } => m.role === "user" || m.role === "assistant")
        .slice(-MAX_HISTORY_MESSAGES)
        .map((m) => ({ role: m.role, content: m.content }));

      const body = { message: text, conversationId: currentConvId, conversationHistory };

      const tryStream = async (): Promise<{ ok: true; data: any } | { ok: false; authError: boolean; error: Error }> => {
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const timeoutId = setTimeout(() => controller.abort(), 120_000);
        const streamTimeoutId = setTimeout(() => controller.abort(), 30_000);

        let ttftTimerId: ReturnType<typeof setTimeout> | null = null;
        let idleTimerId: ReturnType<typeof setTimeout> | null = null;
        let lastEventAt = Date.now();
        let firstTokenReceived = false;

        const clearTimers = () => {
          clearTimeout(streamTimeoutId);
          if (ttftTimerId) clearTimeout(ttftTimerId);
          if (idleTimerId) clearTimeout(idleTimerId);
        };

        try {
          const res = await fetch("/api/chat/stream", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
              ...csrfHeaders(),
            },
            credentials: "include",
            body: JSON.stringify(body),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (res.status === 401 || res.status === 403) {
            abortControllerRef.current = null;
            return { ok: false, authError: true, error: new SessionExpiredError() };
          }

          if (!res.ok || !res.body) {
            const err = await res.json().catch(() => ({ error: "Stream failed" }));
            abortControllerRef.current = null;
            return { ok: false, authError: false, error: new Error(err.error || "Failed to send message") };
          }

          ttftTimerId = setTimeout(() => {
            queryClient.setQueryData(queryKey, (old: LocalMessage[] | undefined) => {
              if (!old) return [];
              return old.map(m =>
                m.id === "temp-assistant-placeholder"
                  ? { ...m, workStatusLabel: "Still working…" }
                  : m
              );
            });
          }, 15_000);

          const resetIdleTimer = () => {
            if (idleTimerId) clearTimeout(idleTimerId);
            idleTimerId = setTimeout(() => controller.abort(), 60_000);
          };
          resetIdleTimer();

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let streamedText = "";
          let finalData: any = null;
          let currentEventType = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            lastEventAt = Date.now();
            clearTimeout(streamTimeoutId); // Disarm initial-response timer once stream is flowing
            resetIdleTimer();
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                currentEventType = line.slice(7).trim();
                continue;
              }
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (currentEventType === "phase" && data.phase) {
                    const phase = String(data.phase).toUpperCase() as ProcessingPhase;
                    queryClient.setQueryData(queryKey, (old: LocalMessage[] | undefined) => {
                      if (!old) return [];
                      return old.map(m => {
                        if (m.id !== "temp-assistant-placeholder") return m;
                        return { ...m, workStatusLabel: phaseLabel(phase), tasks: applyPhaseToTasks(m.tasks, phase) };
                      });
                    });
                  } else if (currentEventType === "delta" && data.text) {
                    firstTokenReceived = true;
                    if (ttftTimerId) {
                      clearTimeout(ttftTimerId);
                      ttftTimerId = null;
                    }
                    const isFirstDelta = streamedText.length === 0;
                    streamedText += data.text;
                    queryClient.setQueryData(queryKey, (old: LocalMessage[] | undefined) => {
                      if (!old) return [];
                      return old.map(m => {
                        if (m.id === "temp-assistant-placeholder") {
                          const newStatus = m.status === "thinking" ? "streaming" as const : m.status;
                          const updatedTasks = isFirstDelta ? applyPhaseToTasks(m.tasks, "DRAFTING") : m.tasks;
                          return { ...m, content: streamedText, status: newStatus, tasks: updatedTasks };
                        }
                        return m;
                      });
                    });
                  } else if (currentEventType === "final" && data.answer !== undefined) {
                    finalData = data;
                  } else if (currentEventType === "done") {
                    clearTimeout(streamTimeoutId);
                  } else if (currentEventType === "error" && data.message) {
                    throw new Error(data.message);
                  }
                } catch (e) {
                  if (e instanceof SyntaxError) continue;
                  throw e;
                }
              }
            }
          }

          clearTimers();
          abortControllerRef.current = null;
          return { ok: true, data: finalData || { answer: streamedText, bullets: [], sources: [], conversationId: currentConvId } };
        } catch (fetchErr) {
          clearTimers();
          clearTimeout(timeoutId);
          abortControllerRef.current = null;
          if (fetchErr instanceof Error) {
            if (fetchErr.name === "AbortError") {
              return { ok: false, authError: false, error: new Error("Request timed out. Try a shorter query or try again.") };
            }
            if (fetchErr.message === "Failed to fetch") {
              return { ok: false, authError: false, error: new Error("Connection failed. The server may be unreachable or overloaded. Please try again.") };
            }
            if (fetchErr instanceof SessionExpiredError) {
              return { ok: false, authError: true, error: fetchErr };
            }
          }
          return { ok: false, authError: false, error: fetchErr instanceof Error ? fetchErr : new Error("Unknown error") };
        }
      };

      const tryNonStream = async (): Promise<{ ok: true; data: any } | { ok: false; error: Error }> => {
        try {
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...csrfHeaders() },
            credentials: "include",
            body: JSON.stringify(body),
          });

          if (res.status === 401 || res.status === 403) {
            return { ok: false, error: new SessionExpiredError() };
          }

          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "Request failed" }));
            return { ok: false, error: new Error(err.error || "Request failed") };
          }

          const data = await res.json();
          return { ok: true, data: { ...data, conversationId: data.conversationId || currentConvId } };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e : new Error("Unknown error") };
        }
      };

      const isTrivialPrompt = TRIVIAL_RE.test(text.trim());
      if (isTrivialPrompt) {
        const fastFallback = await tryNonStream();
        if (fastFallback.ok) return fastFallback.data;
        throw fastFallback.error;
      }

      let result = await tryStream();
      if (result.ok) return result.data;
      if (result.authError) throw result.error;

      result = await tryStream();
      if (result.ok) return result.data;
      if (result.authError) throw result.error;

      const fallback = await tryNonStream();
      if (fallback.ok) return fallback.data;
      throw fallback.error;
    },
    onMutate: async (variables) => {
      const messageText = variables.text;
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      const queryKey = conversationKeys.messages(conversationId || "");
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData(queryKey);

      // Create optimistic messages (use requestId as user message id for deduplication)
      const userMsg: LocalMessage = {
        id: variables.requestId,
        conversationId: conversationId || "temp",
        role: "user",
        content: messageText,
        createdAt: new Date() as any,
        toolCallId: null,
        citationsJson: null,
        metadataJson: null,
        status: "pending"
      };

      // Always show 4-step processing status for all non-trivial queries.
      // Steps are displayed as a collapsed list in ThinkingBubble (expanded by toggle).
      const tasks: TaskItem[] = TRIVIAL_RE.test(messageText.trim()) ? [] : [
        { id: "1", text: "Searching knowledge base", state: "doing" },
        { id: "2", text: "Retrieving evidence", state: "todo" },
        { id: "3", text: "Drafting answer", state: "todo" },
        { id: "4", text: "Validating citations", state: "todo" },
      ];

      const assistantMsg: LocalMessage = {
        id: "temp-assistant-placeholder",
        conversationId: conversationId || "temp",
        role: "assistant",
        content: "",
        createdAt: new Date() as any,
        toolCallId: null,
        citationsJson: null,
        metadataJson: null,
        status: "thinking",
        tasks,
      };

      // Store optimistic messages for potential transfer to new conversation
      pendingOptimisticMessages.current = [userMsg, assistantMsg];

      // Optimistically update to the new value
      queryClient.setQueryData(queryKey, (old: Message[] | undefined) => {
        return [...(old || []), userMsg, assistantMsg];
      });

      // Clear input immediately
      setInput("");

      // Trigger scroll after optimistic append
      setTimeout(() => {
        scrollRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);

      return { previousMessages, userMsg, assistantMsg };
    },
    onSettled: () => {
      isSendingRef.current = false;
    },
    onError: (err, newTodo, context) => {
      const queryKey = conversationKeys.messages(conversationId || "");

      if (err instanceof SessionExpiredError) {
        queryClient.setQueryData(queryKey, (old: LocalMessage[] | undefined) => {
          if (!old) return [];
          return old.map(m =>
            m.id === "temp-assistant-placeholder" ? { ...m, status: "error" as const } : m
          );
        });
        pendingOptimisticMessages.current = [];
        toast({
          title: "Session expired",
          description: "Please log in again.",
          variant: "destructive",
        });
        return;
      }

      queryClient.setQueryData(queryKey, (old: LocalMessage[] | undefined) => {
        if (!old) return [];
        return old.map(m => {
          if (m.id === "temp-assistant-placeholder") return { ...m, status: "error" as const };
          return m;
        });
      });
      pendingOptimisticMessages.current = [];

      const isAbort = err instanceof Error && err.name === "AbortError";
      if (!isAbort) {
        toast({
          title: "Chat error",
          description: err instanceof Error ? err.message : "Failed to get response",
          variant: "destructive",
        });
      }
    },
    onSuccess: (data: ChatResponse & { conversationId?: string, citations?: any[], sources?: any[] }, variables, context) => {
      // Helper to create the completed assistant message
      const createCompletedAssistant = (pending: LocalMessage) => {
        const completedTasks = pending.tasks?.map(t => ({ ...t, state: "done" as const }));
        return {
          ...pending,
          id: generateTempId(),
          content: data.answer,
          metadataJson: { response: data },
          sources: data.sources,
          status: "complete" as const,
          tasks: completedTasks,
        };
      };

      // If backend created a new conversation, transfer optimistic state before redirect
      if (!conversationId && data.conversationId) {
        const newQueryKey = conversationKeys.messages(data.conversationId);

        // Build the completed messages from pending optimistic state
        const pendingMsgs = pendingOptimisticMessages.current;
        if (pendingMsgs.length > 0) {
          const completedMessages = pendingMsgs.map(m => {
            if (m.id === "temp-assistant-placeholder") {
              return createCompletedAssistant(m);
            }
            if (m.status === "pending") {
              return { ...m, status: "complete" as const, conversationId: data.conversationId };
            }
            return { ...m, conversationId: data.conversationId };
          });

          // Set the completed messages on the new conversation's query key
          queryClient.setQueryData(newQueryKey, completedMessages);
        }

        // Clear pending ref
        pendingOptimisticMessages.current = [];

        // Invalidate conversation list to show the new one
        queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });

        // Navigate to new conversation
        navigate(`/chat/${data.conversationId}`);

        // Delayed invalidation for message sync
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: newQueryKey });
        }, 800);
        return;
      }

      // Existing conversation - replace placeholder with real data
      const queryKey = conversationKeys.messages(conversationId || "");

      queryClient.setQueryData(queryKey, (old: LocalMessage[] | undefined) => {
        if (!old) return [];
        return old.map(m => {
          if (m.id === "temp-assistant-placeholder") {
            return createCompletedAssistant(m);
          }
          if (m.status === "pending") {
            return { ...m, status: "complete" };
          }
          return m;
        });
      });

      // Clear pending ref
      pendingOptimisticMessages.current = [];

      if (data.action) {
        setLocalPendingAction({ action: data.action, requestId: crypto.randomUUID() });
      }

      // Fetch dynamic suggestions after doc-intent answers
      if ((data.citations?.length ?? 0) > 0 || (data.sources?.length ?? 0) > 0) {
        fetch("/api/chat/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...csrfHeaders() },
          credentials: "include",
          body: JSON.stringify({ answerText: data.answer, userMessage: variables.text }),
        })
          .then((r) => r.ok ? r.json() : null)
          .then((json) => {
            if (json?.suggestions?.length) setDynamicSuggestions(json.suggestions);
          })
          .catch(() => {/* ignore */});
      }

      // Delayed invalidation to let UI settle before refetch
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey });
      }, 500);
    },
  });

  const executeMutation = useMutation({
    mutationFn: async ({
      action,
      idempotencyKey,
    }: {
      action: { type: string; draft: Record<string, unknown> };
      idempotencyKey: string;
    }) => {
      const res = await apiRequest("POST", "/api/actions/execute", {
        action,
        idempotencyKey,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Action executed",
        description: data.message || "Action completed successfully",
      });
      setLocalPendingAction(null);
      queryClient.invalidateQueries({ queryKey: ["/api/audit"] });
    },
    onError: (error) => {
      toast({
        title: "Action failed",
        description: error instanceof Error ? error.message : "Failed to execute action",
        variant: "destructive",
      });
    },
  });

  const handleSend = () => {
    if (!input.trim()) return;
    if (isSendingRef.current) return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    const requestId = crypto.randomUUID();
    isSendingRef.current = true;
    chatMutation.mutate({ text: input.trim(), requestId });
  };

  const handleSendQuickReply = (text: string) => {
    if (isSendingRef.current) return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    const requestId = crypto.randomUUID();
    isSendingRef.current = true;
    setInput("");
    chatMutation.mutate({ text, requestId });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleApprove = (action: Action, editedDraft: Record<string, unknown>) => {
    if (!localPendingAction) return;
    executeMutation.mutate({
      action: {
        type: action.type,
        draft: editedDraft,
      },
      idempotencyKey: localPendingAction.requestId,
    });
  };

  const handleCancel = () => {
    setLocalPendingAction(null);
    toast({
      title: "Action cancelled",
      description: "The action draft has been discarded",
    });
  };

  const handleProposeJira = async (citation: Citation) => {
    try {
      const res = await apiRequest("POST", "/api/decision/jira/propose", {
        citation,
      });
      const data = await res.json();
      setApprovalId(data.approvalId);
      setProposal(data.proposal);
      setIsApprovalOpen(true);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate Jira proposal",
        variant: "destructive",
      });
    }
  };

  return (
    <Layout title="Chat">
      <div className="flex flex-col h-full max-w-6xl mx-auto">
        <div ref={scrollAreaRef} className="flex-1">
        <ScrollArea className="h-full p-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Send className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-medium mb-2">Start a conversation</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                Ask questions about your documents and get AI-powered answers with
                citations. You can also request actions like creating Jira issues
                or posting to Slack.
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {initialSuggestions.map((s) => (
                  <Button key={s.text} variant="outline" size="sm" className="text-xs"
                    onClick={() => handleSendQuickReply(s.text)}>
                    {s.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              {(() => {
                const seen = new Set<string>();
                const dedupedMessages = messages.filter((m) => {
                  if (!m.id) return true;
                  if (seen.has(m.id)) return false;
                  seen.add(m.id);
                  return true;
                });
                return dedupedMessages.map((message, i) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    conversationId={conversationId ?? undefined}
                    onApprove={
                      i === dedupedMessages.length - 1 && localPendingAction
                        ? handleApprove
                        : undefined
                    }
                    onCancel={
                      i === dedupedMessages.length - 1 && localPendingAction
                        ? handleCancel
                        : undefined
                    }
                    isPending={executeMutation.isPending}
                    onProposeJira={handleProposeJira}
                    onSendQuickReply={handleSendQuickReply}
                  />
                ));
              })()}
              {dynamicSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3 px-2 pb-2">
                  {dynamicSuggestions.map((s, i) => (
                    <Button key={i} variant="outline" size="sm" className="text-xs"
                      onClick={() => { setDynamicSuggestions([]); handleSendQuickReply(s.text); }}>
                      {s.label}
                    </Button>
                  ))}
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          )}
        </ScrollArea>
        </div>

        {showJumpButton && (
          <div className="flex justify-center py-1">
            <Button
              size="sm"
              variant="secondary"
              className="text-xs shadow-md"
              onClick={() => {
                scrollRef.current?.scrollIntoView({ behavior: "smooth" });
                setShowJumpButton(false);
                isAtBottomRef.current = true;
              }}
            >
              <ChevronDown className="h-3 w-3 mr-1" /> Jump to latest
            </Button>
          </div>
        )}

        <div className="border-t bg-background p-4">
          <div className="flex gap-3 max-w-6xl mx-auto">
            <Textarea
              ref={textareaRef}
              placeholder="Ask a question or request an action..."
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (e.target.value.trim()) setDynamicSuggestions([]);
              }}
              onKeyDown={handleKeyDown}
              rows={1}
              className="resize-none min-h-[44px] max-h-[150px] overflow-y-auto"
              data-testid="input-chat"
            />
            {chatMutation.isPending && (
              <Button
                variant="outline"
                onClick={() => {
                  if (abortControllerRef.current) {
                    abortControllerRef.current.abort();
                    abortControllerRef.current = null;
                  }
                }}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
            )}
            <Button
              onClick={handleSend}
              disabled={!input.trim() || chatMutation.isPending}
              data-testid="button-send"
            >
              {chatMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {isApprovalOpen && proposal && approvalId && (
          <ApprovalModal
            isOpen={isApprovalOpen}
            onClose={() => setIsApprovalOpen(false)}
            approvalId={approvalId}
            proposal={proposal}
          />
        )}
      </div>
    </Layout>
  );
}
