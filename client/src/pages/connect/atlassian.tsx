import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  FolderKanban,
  FileText
} from "lucide-react";
import { SiJira, SiConfluence, SiAtlassian } from "react-icons/si";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UserConnectorAccount, UserConnectorScope } from "@shared/schema";
import { Link } from "wouter";

interface JiraProject {
  id: string;
  key: string;
  name: string;
}

interface ConfluenceSpace {
  id: string;
  key: string;
  name: string;
}

export default function AtlassianScopesPage() {
  const { toast } = useToast();

  const [syncMode, setSyncMode] = useState<"metadata_first" | "full" | "smart" | "on_demand">("smart");
  const [contentStrategy, setContentStrategy] = useState<"smart" | "full" | "on_demand">("smart");
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [selectedSpaces, setSelectedSpaces] = useState<string[]>([]);

  const { data: accounts, isLoading: accountsLoading } = useQuery<UserConnectorAccount[]>({
    queryKey: ["/api/user-connectors"],
  });

  const atlassianAccount = accounts?.find((a) => a.type === "atlassian");

  const { data: existingScope } = useQuery<UserConnectorScope>({
    queryKey: ["/api/user-connector-scopes", atlassianAccount?.id],
    enabled: !!atlassianAccount?.id,
  });

  const { data: projects, isLoading: projectsLoading, refetch: refetchProjects } = useQuery<JiraProject[]>({
    queryKey: ["/api/oauth/atlassian/projects"],
    enabled: !!atlassianAccount && atlassianAccount.status === "connected",
  });

  const { data: spaces, isLoading: spacesLoading, refetch: refetchSpaces } = useQuery<ConfluenceSpace[]>({
    queryKey: ["/api/oauth/atlassian/spaces"],
    enabled: !!atlassianAccount && atlassianAccount.status === "connected",
  });

  useEffect(() => {
    if (existingScope) {
      setSyncMode(existingScope.syncMode as typeof syncMode);
      setContentStrategy(existingScope.contentStrategy as typeof contentStrategy);
      const config = existingScope.scopeConfigJson as Record<string, unknown>;
      if (config?.jiraProjects && Array.isArray(config.jiraProjects)) {
        setSelectedProjects(config.jiraProjects as string[]);
      }
      if (config?.confluenceSpaces && Array.isArray(config.confluenceSpaces)) {
        setSelectedSpaces(config.confluenceSpaces as string[]);
      }
    }
  }, [existingScope]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!atlassianAccount) throw new Error("No Atlassian account connected");
      
      const data = {
        accountId: atlassianAccount.id,
        userId: atlassianAccount.userId,
        type: "atlassian" as const,
        syncMode,
        contentStrategy,
        scopeConfigJson: {
          jiraProjects: selectedProjects,
          confluenceSpaces: selectedSpaces,
        },
        exclusionsJson: {
          issueTypes: [],
          pageLabels: [],
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

  const toggleProject = (projectId: string) => {
    setSelectedProjects((prev) =>
      prev.includes(projectId)
        ? prev.filter((id) => id !== projectId)
        : [...prev, projectId]
    );
  };

  const toggleSpace = (spaceId: string) => {
    setSelectedSpaces((prev) =>
      prev.includes(spaceId)
        ? prev.filter((id) => id !== spaceId)
        : [...prev, spaceId]
    );
  };

  if (accountsLoading) {
    return (
      <Layout title="Atlassian Settings">
        <div className="p-6 max-w-3xl mx-auto">
          <Skeleton className="h-64 w-full" />
        </div>
      </Layout>
    );
  }

  if (!atlassianAccount) {
    return (
      <Layout title="Atlassian Settings">
        <div className="p-6 max-w-3xl mx-auto">
          <Card>
            <CardContent className="py-12 text-center">
              <SiAtlassian className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Atlassian Not Connected</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Connect your Atlassian account first to configure sync settings.
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

  const metadata = atlassianAccount.metadataJson as Record<string, unknown>;

  return (
    <Layout title="Atlassian Settings">
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/connect">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h2 className="text-lg font-semibold">Atlassian Configuration</h2>
            <p className="text-sm text-muted-foreground">
              Connected as {metadata?.email as string || "Unknown"}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sync Settings</CardTitle>
            <CardDescription>
              Configure how FieldCopilot syncs your Jira and Confluence content
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Content Selection</CardTitle>
            <CardDescription>
              Choose which Jira projects and Confluence spaces to index
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="jira">
              <TabsList className="mb-4">
                <TabsTrigger value="jira" className="gap-2">
                  <SiJira className="h-3 w-3" />
                  Jira Projects
                </TabsTrigger>
                <TabsTrigger value="confluence" className="gap-2">
                  <SiConfluence className="h-3 w-3" />
                  Confluence Spaces
                </TabsTrigger>
              </TabsList>

              <TabsContent value="jira">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-muted-foreground">
                    {selectedProjects.length} project(s) selected
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchProjects()}
                    disabled={projectsLoading}
                  >
                    {projectsLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Refresh
                      </>
                    )}
                  </Button>
                </div>

                {projectsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : projects && projects.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-auto">
                    {projects.map((project) => (
                      <div
                        key={project.id}
                        className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                        onClick={() => toggleProject(project.id)}
                        data-testid={`project-item-${project.id}`}
                      >
                        <Checkbox
                          checked={selectedProjects.includes(project.id)}
                          onCheckedChange={() => toggleProject(project.id)}
                        />
                        <FolderKanban className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{project.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">({project.key})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    <FolderKanban className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No Jira projects found</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="confluence">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-muted-foreground">
                    {selectedSpaces.length} space(s) selected
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchSpaces()}
                    disabled={spacesLoading}
                  >
                    {spacesLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Refresh
                      </>
                    )}
                  </Button>
                </div>

                {spacesLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : spaces && spaces.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-auto">
                    {spaces.map((space) => (
                      <div
                        key={space.id}
                        className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                        onClick={() => toggleSpace(space.id)}
                        data-testid={`space-item-${space.id}`}
                      >
                        <Checkbox
                          checked={selectedSpaces.includes(space.id)}
                          onCheckedChange={() => toggleSpace(space.id)}
                        />
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{space.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">({space.key})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No Confluence spaces found</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
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
