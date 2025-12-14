import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ArrowLeft,
  Folder,
  Loader2,
  Save,
  RefreshCw
} from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UserConnectorAccount, UserConnectorScope } from "@shared/schema";
import { Link, useLocation } from "wouter";

interface FolderItem {
  id: string;
  name: string;
  mimeType: string;
}

export default function GoogleScopesPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [syncMode, setSyncMode] = useState<"metadata_first" | "full" | "smart" | "on_demand">("smart");
  const [contentStrategy, setContentStrategy] = useState<"smart" | "full" | "on_demand">("smart");
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [excludePatterns, setExcludePatterns] = useState<string[]>([]);

  const { data: accounts, isLoading: accountsLoading } = useQuery<UserConnectorAccount[]>({
    queryKey: ["/api/user-connectors"],
  });

  const googleAccount = accounts?.find((a) => a.type === "google");

  const { data: existingScope } = useQuery<UserConnectorScope>({
    queryKey: ["/api/user-connector-scopes", googleAccount?.id],
    enabled: !!googleAccount?.id,
  });

  const { data: folders, isLoading: foldersLoading, refetch: refetchFolders } = useQuery<FolderItem[]>({
    queryKey: ["/api/oauth/google/folders"],
    enabled: !!googleAccount && googleAccount.status === "connected",
  });

  useEffect(() => {
    if (existingScope) {
      setSyncMode(existingScope.syncMode as typeof syncMode);
      setContentStrategy(existingScope.contentStrategy as typeof contentStrategy);
      const config = existingScope.scopeConfigJson as Record<string, unknown>;
      if (config?.folders && Array.isArray(config.folders)) {
        setSelectedFolders(config.folders as string[]);
      }
      const exclusions = existingScope.exclusionsJson as Record<string, unknown>;
      if (exclusions?.patterns && Array.isArray(exclusions.patterns)) {
        setExcludePatterns(exclusions.patterns as string[]);
      }
    }
  }, [existingScope]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!googleAccount) throw new Error("No Google account connected");
      
      const data = {
        accountId: googleAccount.id,
        userId: googleAccount.userId,
        type: "google" as const,
        syncMode,
        contentStrategy,
        scopeConfigJson: {
          folders: selectedFolders,
          includeSharedDrives: false,
        },
        exclusionsJson: {
          patterns: excludePatterns,
          fileTypes: [],
        },
      };
      
      if (existingScope) {
        await apiRequest("PATCH", `/api/user-connector-scopes/${existingScope.id}`, data);
      } else {
        await apiRequest("POST", "/api/user-connector-scopes", data);
      }
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

  const toggleFolder = (folderId: string) => {
    setSelectedFolders((prev) =>
      prev.includes(folderId)
        ? prev.filter((id) => id !== folderId)
        : [...prev, folderId]
    );
  };

  if (accountsLoading) {
    return (
      <Layout title="Google Drive Settings">
        <div className="p-6 max-w-3xl mx-auto">
          <Skeleton className="h-64 w-full" />
        </div>
      </Layout>
    );
  }

  if (!googleAccount) {
    return (
      <Layout title="Google Drive Settings">
        <div className="p-6 max-w-3xl mx-auto">
          <Card>
            <CardContent className="py-12 text-center">
              <SiGoogle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Google Drive Not Connected</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Connect your Google Drive account first to configure sync settings.
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

  const metadata = googleAccount.metadataJson as Record<string, unknown>;

  return (
    <Layout title="Google Drive Settings">
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/connect">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h2 className="text-lg font-semibold">Google Drive Configuration</h2>
            <p className="text-sm text-muted-foreground">
              Connected as {metadata?.email as string || "Unknown"}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sync Settings</CardTitle>
            <CardDescription>
              Configure how FieldCopilot syncs your Google Drive content
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
              <p className="text-xs text-muted-foreground">
                {syncMode === "metadata_first" && "Index file metadata first, fetch content when needed"}
                {syncMode === "smart" && "Automatically decide based on file type and size"}
                {syncMode === "full" && "Download and index all file content immediately"}
                {syncMode === "on_demand" && "Only index content when explicitly requested"}
              </p>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base">Folders to Index</CardTitle>
                <CardDescription>
                  Select which folders to include in your knowledge base
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchFolders()}
                disabled={foldersLoading}
                data-testid="button-refresh-folders"
              >
                {foldersLoading ? (
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
            {foldersLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : folders && folders.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-auto">
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                    onClick={() => toggleFolder(folder.id)}
                    data-testid={`folder-item-${folder.id}`}
                  >
                    <Checkbox
                      checked={selectedFolders.includes(folder.id)}
                      onCheckedChange={() => toggleFolder(folder.id)}
                    />
                    <Folder className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{folder.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-sm text-muted-foreground">
                <Folder className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No folders found or folder listing not available.</p>
                <p className="text-xs mt-1">All accessible files will be indexed.</p>
              </div>
            )}

            {selectedFolders.length > 0 && (
              <p className="text-xs text-muted-foreground mt-4">
                {selectedFolders.length} folder(s) selected
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
      </div>
    </Layout>
  );
}
