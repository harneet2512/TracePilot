import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Send,
  Loader2,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Edit3,
} from "lucide-react";
import { SiJira, SiSlack, SiConfluence } from "react-icons/si";
import type { ChatResponse, Citation, Action } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: ChatResponse;
  timestamp: Date;
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

function CitationBadge({ citation, index }: { citation: Citation; index: number }) {
  return (
    <Link
      href={`/sources/${citation.sourceId}?chunk=${citation.chunkId}`}
      className="inline-flex"
    >
      <Badge
        variant="secondary"
        className="text-xs cursor-pointer hover:bg-accent"
        data-testid={`citation-${index}`}
      >
        <FileText className="h-3 w-3 mr-1" />
        [{index + 1}]
      </Badge>
    </Link>
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

function MessageBubble({
  message,
  onApprove,
  onCancel,
  isPending,
}: {
  message: Message;
  onApprove?: (action: Action, editedDraft: Record<string, unknown>) => void;
  onCancel?: () => void;
  isPending?: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end mb-6">
        <div className="max-w-2xl bg-primary text-primary-foreground rounded-lg px-4 py-3">
          <p className="text-sm">{message.content}</p>
        </div>
      </div>
    );
  }

  const response = message.response;

  return (
    <div className="mb-6 space-y-4">
      <div className="space-y-3">
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
                    {response.clarifyingQuestions.map((q, i) => (
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
          <>
            <p className="text-sm leading-relaxed">{response?.answer || message.content}</p>

            {response?.bullets && response.bullets.length > 0 && (
              <ul className="space-y-2 mt-3">
                {response.bullets.map((bullet, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-muted-foreground mt-1">-</span>
                    <div>
                      <span className="text-sm">{bullet.claim}</span>
                      {bullet.citations.length > 0 && (
                        <span className="ml-2 inline-flex gap-1 flex-wrap">
                          {bullet.citations.map((c, j) => (
                            <CitationBadge key={j} citation={c} index={j} />
                          ))}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
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
        {message.timestamp.toLocaleTimeString()}
      </span>
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pendingAction, setPendingAction] = useState<{
    action: Action;
    requestId: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const conversationHistory = messages.map(m => ({
        role: m.role,
        content: m.content,
      }));
      const res = await apiRequest("POST", "/api/chat", { message, conversationHistory });
      return res.json();
    },
    onSuccess: (data: ChatResponse) => {
      const newMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer,
        response: data,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, newMessage]);
      if (data.action) {
        setPendingAction({ action: data.action, requestId: crypto.randomUUID() });
      }
    },
    onError: (error) => {
      toast({
        title: "Chat error",
        description: error instanceof Error ? error.message : "Failed to get response",
        variant: "destructive",
      });
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
      setPendingAction(null);
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
    if (!input.trim() || chatMutation.isPending) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    chatMutation.mutate(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleApprove = (action: Action, editedDraft: Record<string, unknown>) => {
    if (!pendingAction) return;
    executeMutation.mutate({
      action: {
        type: action.type,
        draft: editedDraft,
      },
      idempotencyKey: pendingAction.requestId,
    });
  };

  const handleCancel = () => {
    setPendingAction(null);
    toast({
      title: "Action cancelled",
      description: "The action draft has been discarded",
    });
  };

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <Layout title="Chat">
      <div className="flex flex-col h-full max-w-4xl mx-auto">
        <ScrollArea className="flex-1 p-6">
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
            </div>
          ) : (
            <div>
              {messages.map((message, i) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onApprove={
                    i === messages.length - 1 && pendingAction
                      ? handleApprove
                      : undefined
                  }
                  onCancel={
                    i === messages.length - 1 && pendingAction
                      ? handleCancel
                      : undefined
                  }
                  isPending={executeMutation.isPending}
                />
              ))}
              {chatMutation.isPending && (
                <div className="mb-6 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          )}
        </ScrollArea>

        <div className="border-t bg-background p-4">
          <div className="flex gap-3 max-w-4xl mx-auto">
            <Textarea
              placeholder="Ask a question or request an action..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              className="resize-none min-h-[44px]"
              data-testid="input-chat"
            />
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
      </div>
    </Layout>
  );
}
