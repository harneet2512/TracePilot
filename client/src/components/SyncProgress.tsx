import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface ProgressData {
    phase: string;
    processedSources: number;
    totalSources: number | null;
    processedChunks: number;
    totalChunksEstimate: number | null;
    etaSeconds: number | null;
    startedAt: string | null;
    error: string | null;
}

interface JobData {
    id: string;
    status: "pending" | "running" | "completed" | "failed" | "dead_letter";
    connectorType: string;
    createdAt: string;
    completedAt?: string;
}

interface LatestRunData {
    status: string;
    error?: string;
    statsJson?: any;
}

interface SyncProgressResponse {
    job: JobData | null;
    latestRun: LatestRunData | null;
    progress: ProgressData | null;
    counts: { sources: number; chunks: number };
}

// Get user-friendly connector name
const getConnectorName = (type: string) => {
    const names: Record<string, string> = {
        google: "Google Drive",
        atlassian: "Atlassian",
        slack: "Slack",
        jira: "Jira",
        confluence: "Confluence",
        drive: "Google Drive",
    };
    return names[type] || type;
};

export function SyncProgress({ scopeId }: { scopeId: string }) {
    const { toast } = useToast();
    const [prevStatus, setPrevStatus] = useState<string | null>(null);
    const lastToastTimeRef = useRef<number>(0);

    const { data, isLoading } = useQuery<SyncProgressResponse>({
        queryKey: ["sync-progress", scopeId],
        queryFn: async () => {
            const url = `/api/jobs/scope/${scopeId}/latest`;
            console.log(`[SyncProgress] Fetching: ${url}`);
            console.log(`[SyncProgress] scopeId: ${scopeId}`);

            const res = await fetch(url);
            if (!res.ok) throw new Error("Failed to fetch job");
            const json = await res.json();

            // Log response for debugging
            console.log(`[SyncProgress] Response:`, {
                jobId: json.job?.id,
                status: json.job?.status,
                accountId: json.job?.inputJson?.accountId,
                workspaceId: json.job?.workspaceId,
                counts: json.counts
            });

            // Map backend stats to frontend progress structure
            const stats = json.run?.statsJson || {};
            const progress: ProgressData = {
                phase: stats.stage || json.job?.status || "unknown",
                processedSources: stats.sourcesUpserted || stats.processed || 0,
                totalSources: stats.docsDiscovered || stats.discovered || null,
                processedChunks: stats.chunksCreated || 0,
                totalChunksEstimate: null,
                etaSeconds: stats.etaSeconds || null,
                startedAt: json.run?.startedAt || null,
                error: json.run?.error || null
            };

            return { ...json, progress };
        },
        refetchInterval: (query) => {
            const d = query.state.data;
            if (!d?.job) return 3000;
            if (["completed", "failed", "dead_letter"].includes(d.job.status)) return 10000;
            return 1500;
        }
    });

    const formatEta = (seconds: number | null) => {
        if (!seconds || seconds < 0) return null;
        if (seconds < 60) return `~${Math.round(seconds)} seconds`;
        if (seconds < 3600) return `~${Math.round(seconds / 60)} minute${Math.round(seconds / 60) > 1 ? 's' : ''}`;
        return `~${Math.round(seconds / 3600)} hour${Math.round(seconds / 3600) > 1 ? 's' : ''}`;
    };

    const formatEtaShort = (seconds: number | null) => {
        if (!seconds || seconds < 0) return null;
        if (seconds < 60) return `${Math.round(seconds)}s`;
        if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
        return `${Math.round(seconds / 3600)}h`;
    };

    // Toast notifications on status changes
    useEffect(() => {
        if (!data?.job) return;

        const currentStatus = data.job.status;
        const connectorName = getConnectorName(data.job.connectorType);
        const eta = formatEta(data.progress?.etaSeconds ?? null);
        const now = Date.now();

        // Sync STARTED (idle/pending → running)
        if (prevStatus && prevStatus !== "running" && currentStatus === "running") {
            toast({
                title: `🔄 Syncing ${connectorName}`,
                description: eta ? `Processing... ${eta} remaining` : "Sync in progress...",
            });
            lastToastTimeRef.current = now;
        }

        // Sync COMPLETED (running → completed)
        if (prevStatus === "running" && currentStatus === "completed") {
            const stats = data.latestRun?.statsJson?.output || data.latestRun?.statsJson || {};
            const sources = (stats.sourcesCreated || 0) + (stats.sourcesUpdated || 0);
            const chunks = stats.chunksCreated || 0;
            toast({
                title: `✅ ${connectorName} sync complete`,
                description: `Processed ${sources} sources, ${chunks} chunks`,
                duration: 5000,
            });
        }

        // Sync FAILED (running → failed/dead_letter)
        if (prevStatus === "running" && (currentStatus === "failed" || currentStatus === "dead_letter")) {
            toast({
                title: `❌ ${connectorName} sync failed`,
                description: data.latestRun?.error || data.progress?.error || "An error occurred during sync",
                variant: "destructive",
                duration: 7000,
            });
        }

        // Periodic progress update (every 10 seconds during sync)
        if (currentStatus === "running" && eta && prevStatus === "running") {
            if (now - lastToastTimeRef.current > 10000) {
                const processed = data.progress?.processedSources || 0;
                const total = data.progress?.totalSources;
                const progressText = total ? `${processed}/${total} items...` : `${processed} items...`;
                toast({
                    title: `🔄 Syncing ${connectorName}`,
                    description: `${progressText} ${eta} remaining`,
                });
                lastToastTimeRef.current = now;
            }
        }

        // Update previous status
        if (currentStatus !== prevStatus) {
            setPrevStatus(currentStatus);
        }
    }, [data?.job?.status, data?.progress?.etaSeconds, data?.progress?.processedSources, prevStatus, toast]);

    if (isLoading) return <div className="animate-pulse h-16 bg-muted/20 rounded-lg" />;
    if (!data?.job) return <div className="text-muted-foreground text-sm">No sync history.</div>;

    const { job, progress, counts, latestRun } = data;

    const getPhaseLabel = (phase: string) => {
        const labels: Record<string, string> = {
            queued: "Queued",
            listing: "Listing resources...",
            fetching: "Fetching content...",
            chunking: "Creating chunks...",
            embedding: "Generating embeddings...",
            upserting: "Saving to database...",
            persisting: "Saving to database...",
            done: "Completed",
            error: "Error",
            unknown: job.status === "running" ? "Processing..." : job.status
        };
        return labels[phase] || phase;
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "pending": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
            case "running": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
            case "completed": return "bg-green-500/10 text-green-500 border-green-500/20";
            case "failed":
            case "dead_letter": return "bg-red-500/10 text-red-500 border-red-500/20";
            default: return "bg-gray-500/10 text-gray-500";
        }
    };

    const getIcon = (status: string) => {
        switch (status) {
            case "pending": return <Clock className="w-4 h-4" />;
            case "running": return <Loader2 className="w-4 h-4 animate-spin" />;
            case "completed": return <CheckCircle className="w-4 h-4" />;
            case "failed":
            case "dead_letter": return <XCircle className="w-4 h-4" />;
            default: return null;
        }
    };

    const progressPercent = progress?.totalSources && progress.totalSources > 0
        ? Math.min(100, Math.round((progress.processedSources / progress.totalSources) * 100))
        : null;

    return (
        <div className="space-y-3 p-4 rounded-lg border bg-card">
            {/* Header with status */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {getIcon(job.status)}
                    <Badge variant="outline" className={getStatusColor(job.status)}>
                        {getPhaseLabel(progress?.phase || "unknown")}
                    </Badge>
                </div>
                {progress?.etaSeconds && job.status === "running" && (
                    <span className="text-xs text-muted-foreground">
                        ETA: {formatEtaShort(progress.etaSeconds)}
                    </span>
                )}
            </div>

            {/* Progress bar for running jobs */}
            {job.status === "running" && progressPercent !== null && (
                <div className="space-y-1">
                    <Progress value={progressPercent} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{progress?.processedSources || 0}/{progress?.totalSources || '?'} sources</span>
                        <span>{progressPercent}%</span>
                    </div>
                </div>
            )}

            {/* Stats */}
            <div className="flex gap-4 text-sm">
                <div className="flex flex-col">
                    <span className="text-muted-foreground text-xs">Sources</span>
                    <span className="font-medium">{counts.sources}</span>
                </div>
                <div className="flex flex-col">
                    <span className="text-muted-foreground text-xs">Chunks</span>
                    <span className="font-medium">{counts.chunks}</span>
                </div>
                {job.completedAt && (
                    <div className="flex flex-col">
                        <span className="text-muted-foreground text-xs">Last Synced</span>
                        <span className="font-medium">{formatDistanceToNow(new Date(job.completedAt))} ago</span>
                    </div>
                )}
            </div>

            {/* Debug Info */}
            <div className="mt-4 p-3 rounded-md bg-muted/50 border border-border">
                <div className="text-xs font-medium text-muted-foreground mb-2">Debug Info</div>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div>
                        <span className="text-muted-foreground">scopeId:</span>
                        <span className="ml-2 text-foreground">{scopeId}</span>
                    </div>
                    <div>
                        <span className="text-muted-foreground">accountId:</span>
                        <span className="ml-2 text-foreground">{(job as any)?.inputJson?.accountId || 'N/A'}</span>
                    </div>
                    <div>
                        <span className="text-muted-foreground">workspaceId:</span>
                        <span className="ml-2 text-foreground">{(job as any)?.workspaceId || 'N/A'}</span>
                    </div>
                    <div>
                        <span className="text-muted-foreground">jobId:</span>
                        <span className="ml-2 text-foreground">{job?.id?.substring(0, 8) || 'N/A'}</span>
                    </div>
                </div>
            </div>

            {/* Error display */}
            {(job.status === "failed" || job.status === "dead_letter") && (progress?.error || latestRun?.error) && (
                <div className="flex items-start gap-2 p-2 rounded bg-red-500/10 text-red-500 text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{progress?.error || latestRun?.error}</span>
                </div>
            )}
        </div>
    );
}

