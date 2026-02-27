import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  ClipboardList,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Play,
  Loader2,
  FileText,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { AuditEvent } from "@shared/schema";

interface AuditEventWithUser extends AuditEvent {
  user?: { email: string };
}

const kindColors: Record<string, string> = {
  chat: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  action_execute: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  eval: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  replay: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

function AuditEventDetail({ event }: { event: AuditEventWithUser }) {
  const [openSections, setOpenSections] = useState<string[]>(["prompt"]);

  const toggleSection = (section: string) => {
    setOpenSections((prev) =>
      prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section]
    );
  };

  const latency = event.latencyMs as { embedMs?: number; retrievalMs?: number; llmMs?: number; toolMs?: number } | null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Request ID</p>
          <p className="text-xs font-mono truncate">{event.requestId}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">User</p>
          <p className="text-sm">{event.user?.email || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Role</p>
          <Badge variant="secondary" className="text-xs">{event.role || "—"}</Badge>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <div className="flex items-center gap-1">
            {event.success ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <XCircle className="h-4 w-4 text-red-600" />
            )}
            <span className="text-sm">{event.success ? "Success" : "Failed"}</span>
          </div>
        </div>
      </div>

      {latency && (
        <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>Embed: {latency.embedMs ?? 0}ms</span>
          </div>
          <span>Retrieval: {latency.retrievalMs ?? 0}ms</span>
          <span>LLM: {latency.llmMs ?? 0}ms</span>
          <span>Tool: {latency.toolMs ?? 0}ms</span>
        </div>
      )}

      {event.error && (
        <div className="p-3 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-800 dark:text-red-200 font-mono">{event.error}</p>
        </div>
      )}

      <div className="space-y-2">
        {[
          { key: "prompt", label: "Prompt", data: event.prompt },
          { key: "retrieved", label: "Retrieved Chunks", data: event.retrievedJson },
          { key: "response", label: "Response", data: event.responseJson },
          { key: "toolProposals", label: "Tool Proposals", data: event.toolProposalsJson },
          { key: "toolExecutions", label: "Tool Executions", data: event.toolExecutionsJson },
          { key: "policy", label: "Policy Decision", data: event.policyJson },
          { key: "approval", label: "Approval", data: event.approvalJson },
        ].map(({ key, label, data }) =>
          data ? (
            <Collapsible
              key={key}
              open={openSections.includes(key)}
              onOpenChange={() => toggleSection(key)}
            >
              <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-accent/30 text-left">
                {openSections.includes(key) ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <span className="text-sm font-medium">{label}</span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="text-xs font-mono bg-muted/50 p-3 rounded-md overflow-x-auto mt-1 max-h-64">
                  {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          ) : null
        )}
      </div>
    </div>
  );
}

export default function AuditPage() {
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [successFilter, setSuccessFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<AuditEventWithUser | null>(null);
  const { toast } = useToast();

  const { data: events, isLoading } = useQuery<AuditEventWithUser[]>({
    queryKey: ["/api/audit"],
  });

  const replayMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await apiRequest("POST", `/api/audit/${requestId}/replay`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Replay complete",
        description: `New request ID: ${data.requestId}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/audit"] });
    },
    onError: (error) => {
      toast({
        title: "Replay failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const filteredEvents = events?.filter((event) => {
    if (kindFilter !== "all" && event.kind !== kindFilter) return false;
    if (successFilter === "success" && !event.success) return false;
    if (successFilter === "failed" && event.success) return false;
    if (searchTerm && !event.prompt?.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <Layout title="Audit Logs">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Audit Logs</h2>
          <p className="text-sm text-muted-foreground">
            View and replay chat sessions and action executions
          </p>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search prompts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              data-testid="input-audit-search"
            />
          </div>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-kind-filter">
              <SelectValue placeholder="Kind" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Kinds</SelectItem>
              <SelectItem value="chat">Chat</SelectItem>
              <SelectItem value="action_execute">Action</SelectItem>
              <SelectItem value="eval">Eval</SelectItem>
              <SelectItem value="replay">Replay</SelectItem>
            </SelectContent>
          </Select>
          <Select value={successFilter} onValueChange={setSuccessFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-success-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !filteredEvents?.length ? (
              <div className="py-12 text-center">
                <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No audit events</h3>
                <p className="text-sm text-muted-foreground">
                  Chat sessions and actions will appear here
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Kind</TableHead>
                    <TableHead>Prompt</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[150px]">Time</TableHead>
                    <TableHead className="w-[100px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.map((event) => (
                    <TableRow
                      key={event.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedEvent(event)}
                      data-testid={`audit-row-${event.id}`}
                    >
                      <TableCell>
                        <Badge className={`text-xs ${kindColors[event.kind]}`}>
                          {event.kind}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md truncate">
                        {event.prompt || "—"}
                      </TableCell>
                      <TableCell>
                        {event.success ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            replayMutation.mutate(event.requestId);
                          }}
                          disabled={replayMutation.isPending || event.kind !== "chat"}
                          data-testid={`button-replay-${event.id}`}
                        >
                          {replayMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="h-3 w-3" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Audit Event Details</DialogTitle>
            </DialogHeader>
            {selectedEvent && <AuditEventDetail event={selectedEvent} />}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
