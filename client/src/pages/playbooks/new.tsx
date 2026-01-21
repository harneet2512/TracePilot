import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function NewPlaybookPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [incidentText, setIncidentText] = useState("");

  const createMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch("/api/playbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentText: text }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create playbook");
      }
      return res.json();
    },
    onSuccess: (playbook) => {
      toast({
        title: "Playbook created",
        description: "Your playbook has been generated successfully.",
      });
      setLocation(`/playbooks/${playbook.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!incidentText.trim()) {
      toast({
        title: "Error",
        description: "Please enter incident text",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(incidentText);
  };

  return (
    <Layout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Create New Playbook</h1>
          <p className="text-muted-foreground">
            Describe an incident to generate a response playbook
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Incident Description</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="incidentText">Describe the incident</Label>
                <Textarea
                  id="incidentText"
                  placeholder="e.g., Equipment failure in production line 3, requires immediate shutdown and safety protocol activation..."
                  value={incidentText}
                  onChange={(e) => setIncidentText(e.target.value)}
                  rows={10}
                  className="font-mono text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Generate Playbook
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/playbooks")}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

