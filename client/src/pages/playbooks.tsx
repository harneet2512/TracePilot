import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { Plus, FileText, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Playbook {
  id: string;
  title: string;
  status: "draft" | "active" | "completed" | "archived";
  createdAt: string;
  updatedAt: string;
}

export default function PlaybooksPage() {
  const [, setLocation] = useLocation();

  const { data: playbooks, isLoading } = useQuery<Playbook[]>({
    queryKey: ["/api/playbooks"],
    queryFn: async () => {
      const res = await fetch("/api/playbooks");
      if (!res.ok) throw new Error("Failed to fetch playbooks");
      return res.json();
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/10 text-green-600 dark:text-green-400";
      case "completed":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
      case "archived":
        return "bg-gray-500/10 text-gray-600 dark:text-gray-400";
      default:
        return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
    }
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Playbooks</h1>
            <p className="text-muted-foreground">Incident response playbooks</p>
          </div>
          <Button onClick={() => setLocation("/playbooks/new")}>
            <Plus className="w-4 h-4 mr-2" />
            New Playbook
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : playbooks && playbooks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {playbooks.map((playbook) => (
              <Card
                key={playbook.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setLocation(`/playbooks/${playbook.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg">{playbook.title}</CardTitle>
                    <Badge variant="outline" className={getStatusColor(playbook.status)}>
                      {playbook.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>
                      {formatDistanceToNow(new Date(playbook.updatedAt), { addSuffix: true })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No playbooks yet</p>
              <Button onClick={() => setLocation("/playbooks/new")}>
                <Plus className="w-4 h-4 mr-2" />
                Create First Playbook
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}

