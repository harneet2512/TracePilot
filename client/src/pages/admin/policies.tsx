import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  ShieldCheck,
  Save,
  AlertCircle,
  CheckCircle,
  Loader2,
  Trash2,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Policy, PolicyYaml } from "@shared/schema";

const DEFAULT_POLICY = `roles:
  admin:
    tools:
      - jira.create_issue
      - jira.update_issue
      - slack.post_message
      - confluence.upsert_page
  member:
    tools:
      - jira.create_issue
      - slack.post_message

toolConstraints:
  jira.create_issue:
    allowedProjects:
      - ABC
      - OPS
    requireApproval: true
  slack.post_message:
    allowedChannels:
      - "#ops"
      - "#product"
    requireApproval: true
  confluence.upsert_page:
    allowedSpaces:
      - ENG
      - OPS
    requireApproval: true`;

function PolicyPreview({ yamlText }: { yamlText: string }) {
  const [parsed, setParsed] = useState<PolicyYaml | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      // Simple YAML parsing (would use a proper parser in production)
      const lines = yamlText.split("\n");
      let inRoles = false;
      let inToolConstraints = false;
      let currentRole = "";
      let currentTool = "";
      const roles: Record<string, { tools: string[] }> = {};
      const toolConstraints: Record<string, any> = {};

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "roles:") {
          inRoles = true;
          inToolConstraints = false;
        } else if (trimmed === "toolConstraints:") {
          inRoles = false;
          inToolConstraints = true;
        } else if (inRoles && trimmed.match(/^\w+:$/)) {
          currentRole = trimmed.slice(0, -1);
          roles[currentRole] = { tools: [] };
        } else if (inRoles && trimmed.startsWith("- ")) {
          const tool = trimmed.slice(2);
          if (currentRole && roles[currentRole]) {
            roles[currentRole].tools.push(tool);
          }
        } else if (inToolConstraints && trimmed.match(/^[\w.]+:$/)) {
          currentTool = trimmed.slice(0, -1);
          toolConstraints[currentTool] = {};
        }
      }

      setParsed({ roles, toolConstraints });
      setError(null);
    } catch (e) {
      setError("Invalid YAML syntax");
      setParsed(null);
    }
  }, [yamlText]);

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-600 text-sm">
        <AlertCircle className="h-4 w-4" />
        {error}
      </div>
    );
  }

  if (!parsed) {
    return <Skeleton className="h-32 w-full" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-green-600 text-sm">
        <CheckCircle className="h-4 w-4" />
        Valid policy configuration
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-medium">Roles</h4>
        {Object.entries(parsed.roles).map(([role, config]) => (
          <div key={role} className="space-y-1">
            <Badge variant="secondary">{role}</Badge>
            <div className="flex flex-wrap gap-1 ml-2">
              {config.tools.map((tool) => (
                <Badge key={tool} variant="outline" className="text-xs">
                  {tool}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>

      {parsed.toolConstraints && Object.keys(parsed.toolConstraints).length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Tool Constraints</h4>
          {Object.entries(parsed.toolConstraints).map(([tool, constraints]) => (
            <div key={tool} className="text-xs text-muted-foreground">
              <span className="font-mono">{tool}</span>: configured
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PoliciesPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newPolicyName, setNewPolicyName] = useState("");
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [yamlText, setYamlText] = useState("");
  const { toast } = useToast();

  const { data: policies, isLoading } = useQuery<Policy[]>({
    queryKey: ["/api/policies"],
  });

  useEffect(() => {
    if (editingPolicy) {
      setYamlText(editingPolicy.yamlText);
    }
  }, [editingPolicy]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/policies", {
        name: newPolicyName,
        yamlText: DEFAULT_POLICY,
        isActive: false,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Policy created" });
      setIsDialogOpen(false);
      setNewPolicyName("");
      queryClient.invalidateQueries({ queryKey: ["/api/policies"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to create policy",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, yamlText, isActive }: { id: string; yamlText?: string; isActive?: boolean }) => {
      const res = await apiRequest("PATCH", `/api/policies/${id}`, { yamlText, isActive });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Policy updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/policies"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to update policy",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/policies/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Policy deleted" });
      setEditingPolicy(null);
      queryClient.invalidateQueries({ queryKey: ["/api/policies"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to delete policy",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (!editingPolicy) return;
    updateMutation.mutate({ id: editingPolicy.id, yamlText });
  };

  const handleToggleActive = (policy: Policy) => {
    updateMutation.mutate({ id: policy.id, isActive: !policy.isActive });
  };

  return (
    <Layout title="Policies">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Policy Management</h2>
            <p className="text-sm text-muted-foreground">
              Define role permissions and tool constraints
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-policy">
                <Plus className="h-4 w-4 mr-2" />
                New Policy
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Policy</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Policy Name</Label>
                  <Input
                    placeholder="Default Policy"
                    value={newPolicyName}
                    onChange={(e) => setNewPolicyName(e.target.value)}
                    data-testid="input-policy-name"
                  />
                </div>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!newPolicyName.trim() || createMutation.isPending}
                  className="w-full"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Create
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Policies</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {isLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : !policies?.length ? (
                  <div className="text-center py-6">
                    <ShieldCheck className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No policies defined
                    </p>
                  </div>
                ) : (
                  policies.map((policy) => (
                    <div
                      key={policy.id}
                      className={`p-3 rounded-md border cursor-pointer transition-colors ${
                        editingPolicy?.id === policy.id
                          ? "border-primary bg-accent/50"
                          : "hover:bg-accent/30"
                      }`}
                      onClick={() => setEditingPolicy(policy)}
                      data-testid={`policy-item-${policy.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">{policy.name}</span>
                        <div className="flex items-center gap-2">
                          {policy.isActive && (
                            <Badge variant="secondary" className="text-xs">
                              Active
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            {editingPolicy ? (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-base">{editingPolicy.name}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Created {new Date(editingPolicy.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={editingPolicy.isActive}
                        onCheckedChange={() => handleToggleActive(editingPolicy)}
                        data-testid="switch-policy-active"
                      />
                      <Label className="text-sm">Active</Label>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(editingPolicy.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label>YAML Configuration</Label>
                      <Textarea
                        value={yamlText}
                        onChange={(e) => setYamlText(e.target.value)}
                        className="font-mono text-xs min-h-[400px]"
                        data-testid="textarea-policy-yaml"
                      />
                      <Button
                        onClick={handleSave}
                        disabled={updateMutation.isPending}
                        data-testid="button-save-policy"
                      >
                        {updateMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        Save Changes
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Label>Preview</Label>
                      <div className="border rounded-md p-4 min-h-[400px] bg-muted/30">
                        <PolicyPreview yamlText={yamlText} />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <ShieldCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">Select a policy</h3>
                  <p className="text-sm text-muted-foreground">
                    Choose a policy from the list to view and edit
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
