import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Plug, CheckCircle, XCircle, AlertCircle, Loader2, Trash2 } from "lucide-react";
import { SiJira, SiSlack, SiConfluence } from "react-icons/si";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Connector } from "@shared/schema";

const connectorIcons: Record<string, React.ReactNode> = {
  jira: <SiJira className="h-6 w-6" />,
  slack: <SiSlack className="h-6 w-6" />,
  confluence: <SiConfluence className="h-6 w-6" />,
};

const connectorLabels: Record<string, string> = {
  jira: "Jira",
  slack: "Slack",
  confluence: "Confluence",
};

const statusColors: Record<string, string> = {
  connected: "text-green-600",
  disconnected: "text-muted-foreground",
  error: "text-red-600",
};

const statusIcons: Record<string, React.ReactNode> = {
  connected: <CheckCircle className="h-4 w-4 text-green-600" />,
  disconnected: <XCircle className="h-4 w-4 text-muted-foreground" />,
  error: <AlertCircle className="h-4 w-4 text-red-600" />,
};

interface ConnectorFormData {
  type: "jira" | "slack" | "confluence";
  name: string;
  baseUrl?: string;
  email?: string;
  apiToken?: string;
  botToken?: string;
}

function ConnectorForm({
  onSubmit,
  isPending,
}: {
  onSubmit: (data: ConnectorFormData) => void;
  isPending: boolean;
}) {
  const [type, setType] = useState<"jira" | "slack" | "confluence">("jira");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [botToken, setBotToken] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      type,
      name,
      baseUrl: type !== "slack" ? baseUrl : undefined,
      email: type !== "slack" ? email : undefined,
      apiToken: type !== "slack" ? apiToken : undefined,
      botToken: type === "slack" ? botToken : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Connector Type</Label>
        <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
          <SelectTrigger data-testid="select-connector-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="jira">Jira</SelectItem>
            <SelectItem value="slack">Slack</SelectItem>
            <SelectItem value="confluence">Confluence</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          placeholder="My Jira Instance"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          data-testid="input-connector-name"
        />
      </div>

      {type !== "slack" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="baseUrl">Base URL</Label>
            <Input
              id="baseUrl"
              placeholder="https://yourcompany.atlassian.net"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              required
              data-testid="input-connector-baseurl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-testid="input-connector-email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiToken">API Token</Label>
            <Input
              id="apiToken"
              type="password"
              placeholder="Enter API token"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              required
              data-testid="input-connector-apitoken"
            />
          </div>
        </>
      )}

      {type === "slack" && (
        <div className="space-y-2">
          <Label htmlFor="botToken">Bot Token</Label>
          <Input
            id="botToken"
            type="password"
            placeholder="xoxb-..."
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            required
            data-testid="input-connector-bottoken"
          />
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Creating...
          </>
        ) : (
          <>
            <Plus className="h-4 w-4 mr-2" />
            Create Connector
          </>
        )}
      </Button>
    </form>
  );
}

export default function ConnectorsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: connectors, isLoading } = useQuery<Connector[]>({
    queryKey: ["/api/connectors"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: ConnectorFormData) => {
      const res = await apiRequest("POST", "/api/connectors", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Connector created", description: "The connector has been added" });
      setIsDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to create connector",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/connectors/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Connector deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to delete connector",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/connectors/${id}/test`);
      return res.json();
    },
    onSuccess: (data, id) => {
      toast({
        title: data.success ? "Connection successful" : "Connection failed",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/connectors"] });
    },
    onError: (error) => {
      toast({
        title: "Test failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  return (
    <Layout title="Connectors">
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">External Connectors</h2>
            <p className="text-sm text-muted-foreground">
              Manage connections to Jira, Slack, and Confluence
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-connector">
                <Plus className="h-4 w-4 mr-2" />
                Add Connector
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Connector</DialogTitle>
              </DialogHeader>
              <ConnectorForm
                onSubmit={(data) => createMutation.mutate(data)}
                isPending={createMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
        ) : !connectors?.length ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Plug className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No connectors configured</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add a connector to enable actions like creating Jira issues or
                posting to Slack.
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Connector
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {connectors.map((connector) => (
              <Card key={connector.id} data-testid={`connector-${connector.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                        {connectorIcons[connector.type]}
                      </div>
                      <div>
                        <CardTitle className="text-base">{connector.name}</CardTitle>
                        <CardDescription className="text-xs">
                          {connectorLabels[connector.type]}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    {statusIcons[connector.status]}
                    <span className={`text-sm capitalize ${statusColors[connector.status]}`}>
                      {connector.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testMutation.mutate(connector.id)}
                      disabled={testMutation.isPending}
                      data-testid={`button-test-${connector.id}`}
                    >
                      {testMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Test"
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(connector.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-${connector.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
