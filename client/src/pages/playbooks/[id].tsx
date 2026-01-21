import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, CheckCircle2, Circle, AlertTriangle, Wrench, Shield } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface PlaybookItem {
  id: string;
  orderIndex: number;
  kind: "sop_step" | "checklist" | "action_draft" | "ppe" | "shutdown";
  title: string;
  content: string | null;
  citationsJson: Array<{
    sourceId: string;
    sourceVersionId?: string;
    chunkId: string;
    charStart?: number;
    charEnd?: number;
  }> | null;
  dataJson: Record<string, unknown> | null;
  isCompleted: boolean;
}

interface Playbook {
  id: string;
  title: string;
  incidentText: string;
  status: string;
  items: PlaybookItem[];
  createdAt: string;
  updatedAt: string;
}

export default function PlaybookDetailPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const playbookId = params.id;

  const { data: playbook, isLoading } = useQuery<Playbook>({
    queryKey: ["/api/playbooks", playbookId],
    enabled: !!playbookId,
    queryFn: async () => {
      const res = await fetch(`/api/playbooks/${playbookId}`);
      if (!res.ok) throw new Error("Failed to fetch playbook");
      return res.json();
    },
  });

  const getKindIcon = (kind: string) => {
    switch (kind) {
      case "ppe":
        return <Shield className="w-5 h-5" />;
      case "shutdown":
        return <AlertTriangle className="w-5 h-5" />;
      case "action_draft":
        return <Wrench className="w-5 h-5" />;
      default:
        return <CheckCircle2 className="w-5 h-5" />;
    }
  };

  const getKindColor = (kind: string) => {
    switch (kind) {
      case "ppe":
        return "bg-orange-500/10 text-orange-600 dark:text-orange-400";
      case "shutdown":
        return "bg-red-500/10 text-red-600 dark:text-red-400";
      case "action_draft":
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400";
      default:
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-96" />
        </div>
      </Layout>
    );
  }

  if (!playbook) {
    return (
      <Layout>
        <div className="p-6">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Playbook not found</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setLocation("/playbooks")}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Playbooks
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/playbooks")}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold">{playbook.title}</h1>
              <p className="text-muted-foreground">
                Updated {formatDistanceToNow(new Date(playbook.updatedAt), { addSuffix: true })}
              </p>
            </div>
          </div>
          <Badge variant="outline">{playbook.status}</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Incident Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{playbook.incidentText}</p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Playbook Steps</h2>
          {playbook.items && playbook.items.length > 0 ? (
            <div className="space-y-4">
              {playbook.items.map((item) => (
                <Card key={item.id}>
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-md ${getKindColor(item.kind)}`}>
                        {getKindIcon(item.kind)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <CardTitle className="text-lg">{item.title}</CardTitle>
                          <Badge variant="outline" className={getKindColor(item.kind)}>
                            {item.kind}
                          </Badge>
                        </div>
                        {item.content && (
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {item.content}
                          </p>
                        )}
                      </div>
                      {item.kind === "checklist" && (
                        <Checkbox checked={item.isCompleted} disabled />
                      )}
                    </div>
                  </CardHeader>
                  {item.citationsJson && item.citationsJson.length > 0 && (
                    <CardContent>
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Citations:</p>
                        <div className="flex flex-wrap gap-2">
                          {item.citationsJson.map((citation, idx) => (
                            <Badge
                              key={idx}
                              variant="secondary"
                              className="text-xs cursor-pointer hover:bg-accent"
                              onClick={() => {
                                // In production, would open source viewer with highlight
                                console.log("Citation clicked:", citation);
                              }}
                            >
                              Source {citation.sourceId.slice(0, 8)}
                              {citation.sourceVersionId && ` v${citation.sourceVersionId.slice(0, 8)}`}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  )}
                  {item.kind === "action_draft" && item.dataJson && (
                    <CardContent>
                      <div className="p-3 bg-muted rounded-md">
                        <p className="text-xs font-medium mb-2">Action Draft:</p>
                        <pre className="text-xs overflow-auto">
                          {JSON.stringify(item.dataJson, null, 2)}
                        </pre>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No steps generated yet
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}

