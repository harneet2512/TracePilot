import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  Link as LinkIcon,
  Settings,
  RefreshCw,
  Unlink
} from "lucide-react";
import { SiGoogle, SiAtlassian, SiSlack } from "react-icons/si";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UserConnectorAccount } from "@shared/schema";
import { Link } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const providerIcons: Record<string, React.ReactNode> = {
  google: <SiGoogle className="h-6 w-6" />,
  atlassian: <SiAtlassian className="h-6 w-6" />,
  slack: <SiSlack className="h-6 w-6" />,
};

const providerLabels: Record<string, string> = {
  google: "Google Drive",
  atlassian: "Atlassian (Jira + Confluence)",
  slack: "Slack",
};

const providerDescriptions: Record<string, string> = {
  google: "Access and index files from your Google Drive",
  atlassian: "Connect to Jira issues and Confluence pages",
  slack: "Index messages from selected Slack channels",
};

const statusColors: Record<string, string> = {
  connected: "text-green-600 dark:text-green-400",
  expired: "text-yellow-600 dark:text-yellow-400",
  error: "text-red-600 dark:text-red-400",
};

const statusIcons: Record<string, React.ReactNode> = {
  connected: <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />,
  expired: <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />,
  error: <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />,
};

interface ProviderCardProps {
  type: "google" | "atlassian" | "slack";
  account?: UserConnectorAccount;
  onConnect: () => void;
  onDisconnect: (id: string) => void;
  onRefresh: (id: string) => void;
  isConnecting: boolean;
  isDisconnecting: boolean;
  isRefreshing: boolean;
}

function ProviderCard({
  type,
  account,
  onConnect,
  onDisconnect,
  onRefresh,
  isConnecting,
  isDisconnecting,
  isRefreshing,
}: ProviderCardProps) {
  const metadata = account?.metadataJson as Record<string, unknown> | undefined;
  const email = metadata?.email as string | undefined;
  const displayName = metadata?.displayName as string | undefined;

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "Never";
    return new Date(date).toLocaleString();
  };

  return (
    <Card data-testid={`provider-card-${type}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
              {providerIcons[type]}
            </div>
            <div>
              <CardTitle className="text-base">{providerLabels[type]}</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {providerDescriptions[type]}
              </CardDescription>
            </div>
          </div>
          {account && (
            <Badge
              variant={account.status === "connected" ? "secondary" : "outline"}
              className="flex-shrink-0"
            >
              {statusIcons[account.status]}
              <span className="ml-1 capitalize">{account.status}</span>
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {account ? (
          <>
            <div className="space-y-2 text-sm">
              {(email || displayName) && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Account</span>
                  <span className="font-medium">{email || displayName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Sync</span>
                <span>{formatDate(account.lastSyncAt)}</span>
              </div>
              {account.lastSyncError && (
                <div className="p-2 rounded-md bg-destructive/10 text-destructive text-xs">
                  {account.lastSyncError}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                asChild
                data-testid={`button-configure-${type}`}
              >
                <Link href={`/connect/${type}`}>
                  <Settings className="h-3 w-3 mr-1" />
                  Configure
                </Link>
              </Button>

              {account.status === "expired" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRefresh(account.id)}
                  disabled={isRefreshing}
                  data-testid={`button-refresh-${type}`}
                >
                  {isRefreshing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Refresh
                    </>
                  )}
                </Button>
              )}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isDisconnecting}
                    data-testid={`button-disconnect-${type}`}
                  >
                    {isDisconnecting ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Unlink className="h-3 w-3 mr-1" />
                        Disconnect
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect {providerLabels[type]}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove access to your {providerLabels[type]} data. Any indexed content will remain in the knowledge base.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDisconnect(account.id)}>
                      Disconnect
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        ) : (
          <Button
            onClick={onConnect}
            disabled={isConnecting}
            className="w-full"
            data-testid={`button-connect-${type}`}
          >
            {isConnecting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <LinkIcon className="h-4 w-4 mr-2" />
                Connect {providerLabels[type]}
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function ConnectPage() {
  const { toast } = useToast();

  const { data: accounts, isLoading } = useQuery<UserConnectorAccount[]>({
    queryKey: ["/api/user-connectors"],
  });

  const getAccountByType = (type: string) => {
    return accounts?.find((a) => a.type === type);
  };

  const connectMutation = useMutation({
    mutationFn: async (type: string) => {
      const res = await fetch(`/api/oauth/${type}`, { credentials: "include" });
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        throw new Error("Failed to get authorization URL");
      }
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
    },
    onError: (error) => {
      toast({
        title: "Failed to disconnect",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await apiRequest("POST", `/api/oauth/refresh/${accountId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Token refreshed successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/user-connectors"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to refresh token",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const providers: Array<"google" | "atlassian" | "slack"> = ["google", "atlassian", "slack"];

  return (
    <Layout title="Connect">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Connected Accounts</h2>
          <p className="text-sm text-muted-foreground">
            Connect your accounts to enable FieldCopilot to search and index your data
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-12 w-12 rounded-md" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-9 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {providers.map((type) => (
              <ProviderCard
                key={type}
                type={type}
                account={getAccountByType(type)}
                onConnect={() => connectMutation.mutate(type)}
                onDisconnect={(id) => disconnectMutation.mutate(id)}
                onRefresh={(id) => refreshMutation.mutate(id)}
                isConnecting={connectMutation.isPending && connectMutation.variables === type}
                isDisconnecting={disconnectMutation.isPending}
                isRefreshing={refreshMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
