import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Loader2,
  Save,
  RefreshCw,
  Hash,
  Lock
} from "lucide-react";
import { SiSlack } from "react-icons/si";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { normalizeScopes, saveScope } from "@/lib/scopes";
import type { UserConnectorAccount, UserConnectorScope } from "@shared/schema";
import { Link } from "wouter";
import { SyncProgress } from "@/components/SyncProgress";

interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  num_members?: number;
}

export default function SlackScopesPage() {
  const { toast } = useToast();

  const [syncMode, setSyncMode] = useState<"metadata_first" | "full" | "smart" | "on_demand">("smart");
  const [contentStrategy, setContentStrategy] = useState<"smart" | "full" | "on_demand">("smart");
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [includeThreads, setIncludeThreads] = useState(true);

  const { data: accounts, isLoading: accountsLoading } = useQuery<UserConnectorAccount[]>({
    queryKey: ["/api/user-connectors"],
  });

  const slackAccount = accounts?.find((a) => a.type === "slack");

  const { data: scopes } = useQuery<UserConnectorScope[]>({
    queryKey: ["/api/user-connector-scopes", slackAccount?.id],
    enabled: !!slackAccount?.id,
  });

  const existingScope = normalizeScopes(scopes);

  const { data: channels, isLoading: channelsLoading, refetch: refetchChannels } = useQuery<SlackChannel[]>({
    queryKey: ["/api/oauth/slack/channels"],
    enabled: !!slackAccount && slackAccount.status === "connected",
  });

  useEffect(() => {
    if (existingScope) {
      setSyncMode((existingScope.syncMode as typeof syncMode) || "full");
      setContentStrategy((existingScope.contentStrategy as typeof contentStrategy) || "smart");
      const config = existingScope.scopeConfigJson as Record<string, unknown>;
      if (config?.channels && Array.isArray(config.channels)) {
        setSelectedChannels(config.channels as string[]);
      }
    }
  }, [existingScope]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!slackAccount) throw new Error("No Slack account connected");

      const data = {
        accountId: slackAccount.id,
        userId: slackAccount.userId,
        type: "slack" as const,
        syncMode,
        contentStrategy,
        scopeConfigJson: {
          channels: selectedChannels,
        },
        exclusionsJson: {},
      };

      await saveScope({
        existingScopeId: existingScope?.id,
        data,
      });
    },
    onSuccess: () => {
      toast({ title: "Settings saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/user-connector-scopes"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to save settings",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const toggleChannel = (channelId: string) => {
    setSelectedChannels((prev) =>
      prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId]
    );
  };

  if (accountsLoading) {
    return (
      <Layout title="Slack Settings">
        <div className="p-6 max-w-3xl mx-auto">
          <Skeleton className="h-64 w-full" />
        </div>
      </Layout>
    );
  }

  if (!slackAccount) {
    return (
      <Layout title="Slack Settings">
        <div className="p-6 max-w-3xl mx-auto">
          <Card>
            <CardContent className="py-12 text-center">
              <SiSlack className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Slack Not Connected</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Connect your Slack workspace first to configure sync settings.
              </p>
              <Button asChild>
                <Link href="/connect">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Connect
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const metadata = slackAccount.metadataJson as Record<string, unknown>;

  return (
    <Layout title="Slack Settings">
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/connect">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h2 className="text-lg font-semibold">Slack Configuration</h2>
            <p className="text-sm text-muted-foreground">
              Connected to {metadata?.team as string || "Unknown workspace"}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sync Settings</CardTitle>
            <CardDescription>
              Configure how FieldCopilot syncs your Slack messages
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Sync Mode</Label>
              <Select value={syncMode} onValueChange={(v) => setSyncMode(v as typeof syncMode)}>
                <SelectTrigger data-testid="select-sync-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="metadata_first">Metadata First (Fastest)</SelectItem>
                  <SelectItem value="smart">Smart (Recommended)</SelectItem>
                  <SelectItem value="full">Full Content</SelectItem>
                  <SelectItem value="on_demand">On Demand</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Content Strategy</Label>
              <Select value={contentStrategy} onValueChange={(v) => setContentStrategy(v as typeof contentStrategy)}>
                <SelectTrigger data-testid="select-content-strategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="smart">Smart Extraction</SelectItem>
                  <SelectItem value="full">Full Text</SelectItem>
                  <SelectItem value="on_demand">On Demand</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Checkbox
                id="includeThreads"
                checked={includeThreads}
                onCheckedChange={(checked) => setIncludeThreads(checked === true)}
              />
              <Label htmlFor="includeThreads" className="text-sm cursor-pointer">
                Include thread replies
              </Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base">Channels to Index</CardTitle>
                <CardDescription>
                  Select which channels to include in your knowledge base
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchChannels()}
                disabled={channelsLoading}
                data-testid="button-refresh-channels"
              >
                {channelsLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Refresh
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {channelsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : channels && channels.length > 0 ? (
              <>
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    <strong>Workspace Knowledge:</strong> Only public channels can be indexed as workspace-wide knowledge.
                    Private channels are automatically filtered out for security.
                  </p>
                </div>
                <div className="space-y-2 max-h-64 overflow-auto">
                  {channels.filter(ch => !ch.is_private).map((channel) => (
                    <div
                      key={channel.id}
                      className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                      onClick={() => toggleChannel(channel.id)}
                      data-testid={`channel-item-${channel.id}`}
                    >
                      <Checkbox
                        checked={selectedChannels.includes(channel.id)}
                        onCheckedChange={() => toggleChannel(channel.id)}
                      />
                      <Hash className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm flex-1">{channel.name}</span>
                      {channel.num_members && (
                        <Badge variant="secondary" className="text-xs">
                          {channel.num_members} members
                        </Badge>
                      )}
                    </div>
                  ))}
                  {channels.filter(ch => !ch.is_private).length === 0 && (
                    <div className="text-center py-6 text-sm text-muted-foreground">
                      <Hash className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No public channels found.</p>
                      <p className="text-xs mt-1">Only public channels can be indexed as workspace knowledge.</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-6 text-sm text-muted-foreground">
                <Hash className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No channels found or channel listing not available.</p>
              </div>
            )}

            {selectedChannels.length > 0 && (
              <p className="text-xs text-muted-foreground mt-4">
                {selectedChannels.length} public channel(s) selected
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" asChild>
            <Link href="/connect">Cancel</Link>
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-settings"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Settings
              </>
            )}
          </Button>
        </div>

        {/* Sync Progress */}
        {existingScope?.id && (
          <SyncProgress scopeId={existingScope.id} />
        )}
      </div>
    </Layout>
  );
}
