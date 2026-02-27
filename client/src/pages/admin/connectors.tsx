import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueries } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Plug,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Unlink,
  Link as LinkIcon,
  FileStack,
  RefreshCw,
  ExternalLink,
  Copy,
} from "lucide-react";
import { SiGoogledrive, SiJira, SiSlack, SiAtlassian, SiConfluence } from "react-icons/si";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UserConnectorAccount, UserConnectorScope } from "@shared/schema";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";

// Provider icon mapping - use real icons, Mock Drive -> Drive
const providerIcons: Record<string, React.ReactNode> = {
  google: <SiGoogledrive className="h-6 w-6 text-[#4285F4]" />,
  drive: <SiGoogledrive className="h-6 w-6 text-[#4285F4]" />,
  atlassian: <SiAtlassian className="h-6 w-6 text-[#0052CC]" />,
  jira: <SiJira className="h-6 w-6 text-[#0052CC]" />,
  confluence: <SiConfluence className="h-6 w-6 text-[#172B4D]" />,
  slack: <SiSlack className="h-6 w-6 text-[#4A154B]" />,
};

const providerLabels: Record<string, string> = {
  google: "Google Drive",
  drive: "Google Drive",
  atlassian: "Jira & Confluence",
  jira: "Jira",
  confluence: "Confluence",
  slack: "Slack",
};

const providerNames: Record<string, string> = {
  google: "Google Drive",
  drive: "Google Drive",
  atlassian: "Atlassian",
  jira: "Jira",
  confluence: "Confluence",
  slack: "Slack",
};

interface IngestionSummary {
  totalSources: number;
  totalChunks: number;
  lastSyncAt: string | null;
  activeSyncJobs: Array<{ id: string; scopeId: string | null; connectorType: string | null; status: string }>;
}

interface ScopeWithAccount extends UserConnectorScope {
  account?: UserConnectorAccount;
}

// Chain SVG - subtle overlay, pointer-events: none
function ChainOverlay() {
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none select-none"
      aria-hidden
    >
      <svg
        className="absolute w-full h-full opacity-[0.06] dark:opacity-[0.04]"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern id="chain-dots" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="20" cy="20" r="1.5" fill="currentColor" className="text-foreground" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#chain-dots)" />
        {/* Central node */}
        <circle cx="50%" cy="45%" r="24" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground" />
        {/* Connector lines to corners */}
        <line x1="50%" y1="45%" x2="15%" y2="25%" stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground" />
        <line x1="50%" y1="45%" x2="85%" y2="25%" stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground" />
        <line x1="50%" y1="45%" x2="15%" y2="70%" stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground" />
        <line x1="50%" y1="45%" x2="85%" y2="70%" stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground" />
      </svg>
    </div>
  );
}

function IngestionStatusPanel({
  summary,
  activeJobProgress,
  onRetry,
}: {
  summary: IngestionSummary | null;
  activeJobProgress: { phase: string; processed: number; total: number | null; status?: string; error?: string } | null;
  onRetry?: () => void;
}) {
  const hasActiveJob = (summary?.activeSyncJobs?.length ?? 0) > 0;
  const isFailed = activeJobProgress?.status === "failed" || activeJobProgress?.status === "dead_letter";
  const showProgressBar = hasActiveJob && !isFailed;
  const showError = isFailed;

  if (!summary) return null;

  if (showError && activeJobProgress?.error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-destructive">Indexing failed</p>
                <p className="text-xs text-muted-foreground mt-1">{activeJobProgress.error}</p>
              </div>
            </div>
            {onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry} data-testid="button-retry-ingestion">
                Retry
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (showProgressBar) {
    const phaseLabel = activeJobProgress?.phase === "chunking" ? "Chunking" :
      activeJobProgress?.phase === "embedding" ? "Embedding" :
      activeJobProgress?.phase === "upserting" || activeJobProgress?.phase === "persisting" ? "Indexing" :
      "Indexing…";
    const percent = activeJobProgress?.total && activeJobProgress.total > 0
      ? Math.min(100, Math.round((activeJobProgress.processed / activeJobProgress.total) * 100))
      : null;

    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{phaseLabel}</p>
              {percent !== null ? (
                <Progress value={percent} className="h-1.5 mt-2" />
              ) : (
                <p className="text-xs text-muted-foreground mt-1">In progress…</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex items-center gap-4 text-sm text-muted-foreground">
      <span>Idle</span>
      <span>•</span>
      <span>{summary.totalSources} sources</span>
      <span>•</span>
      <span>{summary.totalChunks} chunks</span>
      <span>•</span>
      <span>
        Last sync: {summary.lastSyncAt
          ? formatDistanceToNow(new Date(summary.lastSyncAt), { addSuffix: true })
          : "Never"}
      </span>
    </div>
  );
}

function ConnectorCard({
  type,
  account,
  scopes,
  counts,
  lastSyncAt,
  isIndexing,
  onConnect,
  onDisconnect,
  onChunkIndex,
  onChunkIndexAll,
  connectPending,
  disconnectPending,
  chunkIndexPending,
}: {
  type: "google" | "atlassian" | "slack";
  account?: UserConnectorAccount;
  scopes: ScopeWithAccount[];
  counts: { sources: number; chunks: number };
  lastSyncAt: Date | string | null;
  isIndexing: boolean;
  onConnect: () => void;
  onDisconnect: (id: string) => void;
  onChunkIndex: (scopeId: string) => void;
  onChunkIndexAll?: () => void;
  connectPending: boolean;
  disconnectPending: boolean;
  chunkIndexPending: boolean;
}) {
  const metadata = account?.metadataJson as Record<string, unknown> | undefined;
  const email = metadata?.email as string | undefined;
  const displayName = metadata?.displayName as string | undefined;
  const identity = email || displayName || undefined;
  const connected = !!account && account.status === "connected";
  const hasScope = scopes.length > 0;
  const canChunkIndex = connected && hasScope && !isIndexing;

  const statusPill = () => {
    if (isIndexing) return { label: "Indexing", variant: "secondary" as const, icon: <Loader2 className="h-3 w-3 animate-spin" /> };
    if (account?.status === "error") return { label: "Error", variant: "destructive" as const, icon: <AlertCircle className="h-3 w-3" /> };
    if (account?.status === "expired") return { label: "Needs login", variant: "outline" as const, icon: <AlertCircle className="h-3 w-3" /> };
    if (connected) return { label: "Connected", variant: "default" as const, icon: <CheckCircle className="h-3 w-3 text-green-500" /> };
    return { label: "Needs login", variant: "outline" as const, icon: <XCircle className="h-3 w-3" /> };
  };

  const status = statusPill();

  return (
    <Card data-testid={`connector-${type}`} className="relative overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted/80 flex items-center justify-center flex-shrink-0 border border-border/50">
              {providerIcons[type] || providerIcons.google}
            </div>
            <div>
              <CardTitle className="text-base">{providerLabels[type]}</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {providerNames[type]}
              </CardDescription>
            </div>
          </div>
          <Badge variant={status.variant} className="flex items-center gap-1 gap-x-1">
            {status.icon}
            {status.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {identity && (
          <p className="text-xs text-muted-foreground truncate" title={identity}>
            {identity}
          </p>
        )}
        <div className="flex gap-4 text-xs">
          <span><strong>{counts.sources}</strong> docs</span>
          <span><strong>{counts.chunks}</strong> chunks</span>
          <span className="text-muted-foreground">
            Last sync: {lastSyncAt ? formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true }) : "Never"}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {!connected ? (
            <Button
              size="sm"
              onClick={onConnect}
              disabled={connectPending || isIndexing}
              data-testid={`button-connect-${type}`}
            >
              {connectPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <LinkIcon className="h-3 w-3" />}
              <span className="ml-1">Connect</span>
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDisconnect(account!.id)}
                disabled={disconnectPending || isIndexing}
                data-testid={`button-disconnect-${type}`}
              >
                <Unlink className="h-3 w-3" />
                <span className="ml-1">Disconnect</span>
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => scopes[0] && onChunkIndex(scopes[0].id)}
                disabled={!canChunkIndex || chunkIndexPending}
                data-testid={`button-chunk-index-${type}`}
                title={!hasScope ? "Configure scope first" : !connected ? "Connect first" : undefined}
              >
                {chunkIndexPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileStack className="h-3 w-3" />}
                <span className="ml-1">Chunk & Index</span>
              </Button>
            </>
          )}
        </div>
        {connected && !hasScope && (
          <p className="text-xs text-muted-foreground">
            <Link href={`/connect/${type}`} className="underline hover:text-foreground">Configure scope</Link> to enable Chunk & Index.
          </p>
        )}
        {!connected && (
          <div>
            <p className="text-xs text-muted-foreground">Connect first to enable Chunk & Index.</p>
            {type === "atlassian" && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <span>Redirect URI:</span>
                <code className="font-mono bg-muted px-1 rounded text-[11px] truncate max-w-[220px]">
                  {window.location.origin}/api/oauth/atlassian/callback
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(
                    `${window.location.origin}/api/oauth/atlassian/callback`
                  )}
                  title="Copy redirect URI"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ConnectorsPage() {
  const { toast } = useToast();
  const [triggeredScopeIds, setTriggeredScopeIds] = useState<Set<string>>(new Set());
  const oauthSimulatorEnabled = import.meta.env.VITE_OAUTH_SIMULATOR === "true";
  const activeJobProgressRef = useRef<{ phase: string; processed: number; total: number | null; status?: string; error?: string } | null>(null);
  const lastActiveScopeIdRef = useRef<string | null>(null);

  const { data: accounts, isLoading: accountsLoading } = useQuery<UserConnectorAccount[]>({
    queryKey: ["/api/user-connectors"],
  });

  const { data: scopes } = useQuery<UserConnectorScope[]>({
    queryKey: ["/api/user-connector-scopes"],
  });

  const { data: summary, refetch: refetchSummary } = useQuery<IngestionSummary>({
    queryKey: ["/api/admin/ingestion-summary"],
    refetchInterval: (query) => {
      const d = query.state.data;
      if (d?.activeSyncJobs?.length) return 1500;
      return 5000;
    },
  });

  // Poll active job progress when we have active jobs
  const activeScopeId = summary?.activeSyncJobs?.[0]?.scopeId;
  const { data: jobProgress } = useQuery({
    queryKey: ["/api/jobs/scope", activeScopeId],
    queryFn: async () => {
      if (!activeScopeId) return null;
      const res = await fetch(`/api/jobs/scope/${activeScopeId}/latest`, { credentials: "include" });
      if (!res.ok) return null;
      const json = await res.json();
      const stats = json.latestRun?.statsJson || {};
      return {
        phase: stats.stage || "indexing",
        processed: stats.sourcesUpserted ?? stats.chunksCreated ?? 0,
        total: stats.docsDiscovered ?? stats.discovered ?? null,
        status: json.job?.status,
        error: json.latestRun?.error || json.progress?.error,
      };
    },
    enabled: !!activeScopeId && (summary?.activeSyncJobs?.length ?? 0) > 0,
    refetchInterval: 1500,
  });

  const scopeIds = (scopes || []).map((s) => s.id);
  const scopeCountsResults = useQueries({
    queries: scopeIds.map((scopeId) => ({
      queryKey: ["/api/jobs/scope", scopeId, "counts"],
      queryFn: async () => {
        const res = await fetch(`/api/jobs/scope/${scopeId}/latest`, { credentials: "include" });
        if (!res.ok) return { scopeId, sources: 0, chunks: 0 };
        const json = await res.json();
        return { scopeId, ...(json.counts || { sources: 0, chunks: 0 }) };
      },
      enabled: !!scopeId,
    })),
  });
  const scopeCountsMap: Record<string, { sources: number; chunks: number }> = {};
  scopeCountsResults.forEach((r) => {
    const d = r.data as { scopeId: string; sources: number; chunks: number } | undefined;
    if (d) scopeCountsMap[d.scopeId] = { sources: d.sources, chunks: d.chunks };
  });

  useEffect(() => {
    if (jobProgress) {
      activeJobProgressRef.current = jobProgress;
      if (activeScopeId) lastActiveScopeIdRef.current = activeScopeId;
    }
  }, [jobProgress, activeScopeId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthSuccess = params.get("oauth_success");
    const oauthError = params.get("oauth_error");
    if (!oauthSuccess && !oauthError) return;

    if (oauthSuccess) {
      const providerName = providerLabels[oauthSuccess] || oauthSuccess;
      toast({
        title: "Connector connected",
        description: `${providerName} connected successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user-connectors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-connector-scopes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ingestion-summary"] });
      void refetchSummary();
    }

    if (oauthError) {
      const providerName = providerLabels[oauthError] || oauthError;
      toast({
        title: "Connection failed",
        description: `${providerName} needs login. Please reconnect.`,
        variant: "destructive",
      });
    }

    params.delete("oauth_success");
    params.delete("oauth_error");
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, [toast, refetchSummary]);

  const connectMutation = useMutation({
    mutationFn: async (type: string) => {
      const simulateQuery = oauthSimulatorEnabled ? "?simulate=true" : "";
      window.location.href = `/api/oauth/${type}${simulateQuery}`;
    },
    onError: (error) => {
      toast({
        title: "Connection failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/user-connectors/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Disconnected successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/user-connectors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-connector-scopes"] });
      refetchSummary();
    },
    onError: (error) => {
      toast({
        title: "Failed to disconnect",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const chunkIndexMutation = useMutation({
    mutationFn: async (scopeId: string) => {
      const res = await apiRequest("POST", `/api/sync/${scopeId}/async`);
      return res.json();
    },
    onSuccess: (_, scopeId) => {
      setTriggeredScopeIds((s) => new Set(s).add(scopeId));
      toast({ title: "Chunk & Index started", description: "Ingestion is running in the background.", duration: 3000 });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ingestion-summary"] });
    },
    onError: (error) => {
      toast({
        title: "Chunk & Index failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const chunkIndexAllMutation = useMutation({
    mutationFn: async (scopeIds: string[]) => {
      const results = await Promise.all(
        scopeIds.map((scopeId) =>
          apiRequest("POST", `/api/sync/${scopeId}/async`).then((r) => r.json())
        )
      );
      return results;
    },
    onSuccess: (_, scopeIds) => {
      scopeIds?.forEach((id) => setTriggeredScopeIds((s) => new Set(s).add(id)));
      toast({ title: "Chunk & Index All started", description: "Ingestion is running for all connected sources.", duration: 3000 });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ingestion-summary"] });
    },
    onError: (error) => {
      toast({
        title: "Chunk & Index All failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const providers: Array<"google" | "atlassian" | "slack"> = ["google", "atlassian", "slack"];
  const connectedScopes = (scopes || []).filter((s) => {
    const acc = accounts?.find((a) => a.id === s.accountId);
    return acc?.status === "connected";
  });
  const hasActiveJob = (summary?.activeSyncJobs?.length ?? 0) > 0;

  const getScopesByType = (type: string) => {
    const account = accounts?.find((a) => a.type === type);
    if (!account) return [];
    return (scopes || []).filter((s) => s.accountId === account.id).map((s) => ({ ...s, account }));
  };

  const getCountsForType = (type: string) => {
    const scopesForType = getScopesByType(type);
    if (scopesForType.length === 0) return { sources: 0, chunks: 0 };
    // Use scope counts when available; otherwise show 0 (summary is workspace-wide)
    const scopeCounts = scopeCountsMap;
    let sources = 0;
    let chunks = 0;
    for (const s of scopesForType) {
      const c = scopeCounts[s.id];
      if (c) {
        sources += c.sources;
        chunks += c.chunks;
      }
    }
    return { sources, chunks };
  };

  const getLastSyncForType = (type: string) => {
    const account = accounts?.find((a) => a.type === type);
    return account?.lastSyncAt ?? summary?.lastSyncAt ?? null;
  };

  const isIndexingType = (type: string) => {
    return (summary?.activeSyncJobs ?? []).some(
      (j) => j.connectorType === type || (type === "atlassian" && (j.connectorType === "atlassian" || j.connectorType === "jira" || j.connectorType === "confluence"))
    );
  };

  return (
    <Layout title="Connectors">
      <div className="p-6 max-w-5xl mx-auto space-y-6 relative">
        <ChainOverlay />

        <div className="relative z-10 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">External Connectors</h2>
            <p className="text-sm text-muted-foreground">
              Connect accounts and index content from Google Drive, Jira, Confluence, and Slack
            </p>
            <Link
              href="/admin/audit"
              className="text-xs text-muted-foreground hover:text-foreground mt-1 inline-flex items-center gap-1"
            >
              Connector actions are recorded in <span className="underline">Audit Logs</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          {connectedScopes.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => chunkIndexAllMutation.mutate(connectedScopes.map((s) => s.id))}
              disabled={chunkIndexAllMutation.isPending || hasActiveJob}
              data-testid="button-chunk-index-all"
            >
              {chunkIndexAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileStack className="h-4 w-4" />
              )}
              <span className="ml-2">Chunk & Index All</span>
            </Button>
          )}
        </div>

        {/* Ingestion Status Panel - no progress bar on initial load unless active */}
        <div className="relative z-10">
          <p className="text-xs font-medium text-muted-foreground mb-2">Ingestion Status</p>
          {summary ? (
            <IngestionStatusPanel
              summary={summary}
              activeJobProgress={jobProgress ?? activeJobProgressRef.current}
              onRetry={(activeScopeId || lastActiveScopeIdRef.current) ? () => chunkIndexMutation.mutate(activeScopeId || lastActiveScopeIdRef.current!) : undefined}
            />
          ) : (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <Skeleton className="h-4 w-48" />
            </div>
          )}
        </div>

        {accountsLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 relative z-10">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-48" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 relative z-10">
            {providers.map((type) => (
              <ConnectorCard
                key={type}
                type={type}
                account={accounts?.find((a) => a.type === type)}
                scopes={getScopesByType(type)}
                counts={getCountsForType(type)}
                lastSyncAt={getLastSyncForType(type)}
                isIndexing={isIndexingType(type)}
                onConnect={() => connectMutation.mutate(type)}
                onDisconnect={(id) => disconnectMutation.mutate(id)}
                onChunkIndex={(scopeId) => chunkIndexMutation.mutate(scopeId)}
                connectPending={connectMutation.isPending && connectMutation.variables === type}
                disconnectPending={disconnectMutation.isPending}
                chunkIndexPending={chunkIndexMutation.isPending}
              />
            ))}
          </div>
        )}

        {!accountsLoading && !accounts?.length && (
          <Card className="relative z-10">
            <CardContent className="py-12 text-center">
              <Plug className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No connectors connected</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Click Connect on a provider card to link your account. OAuth uses your configured .env keys.
              </p>
              <p className="text-xs text-muted-foreground">
                After connecting, configure scopes and use Chunk & Index to ingest content.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
