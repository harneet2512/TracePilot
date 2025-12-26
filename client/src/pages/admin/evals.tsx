import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  BarChart3,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  FileText,
  AlertCircle,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { EvalSuite, EvalRun } from "@shared/schema";

interface EvalCaseResult {
  id: string;
  type: string;
  prompt: string;
  passed: boolean;
  reason?: string;
}

interface EvalRunWithSuite extends EvalRun {
  suite?: EvalSuite;
}

function LatestRunFailures({ results }: { results: EvalCaseResult[] }) {
  const failures = results.filter((r) => !r.passed);
  
  if (!failures.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Latest Run Failures</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <CheckCircle className="h-10 w-10 text-green-600 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              All test cases passed!
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Latest Run Failures</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Case ID</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Prompt</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {failures.map((result) => (
              <TableRow key={result.id}>
                <TableCell className="font-mono text-xs">{result.id}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-xs">
                    {result.type}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-xs truncate">{result.prompt}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {result.reason || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function EvalDashboardCards({ run }: { run: EvalRunWithSuite | null }) {
  if (!run?.summaryJson) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const summary = run.summaryJson as { total: number; passed: number; failed: number; passRate: number };

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Cases
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{summary.total}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Passed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="text-2xl font-semibold">{summary.passed}</span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Failed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-600" />
            <span className="text-2xl font-semibold">{summary.failed}</span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Pass Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="text-2xl font-semibold">
              {(summary.passRate * 100).toFixed(1)}%
            </div>
            <Progress value={summary.passRate * 100} className="h-2" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function EvalsPage() {
  const [selectedSuiteId, setSelectedSuiteId] = useState<string>("");
  const [selectedRun, setSelectedRun] = useState<EvalRunWithSuite | null>(null);
  const [showResultsDialog, setShowResultsDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: suites, isLoading: suitesLoading } = useQuery<EvalSuite[]>({
    queryKey: ["/api/eval-suites"],
  });

  const { data: runs, isLoading: runsLoading } = useQuery<EvalRunWithSuite[]>({
    queryKey: ["/api/eval-runs"],
  });

  const latestRun = runs?.find((r) => r.finishedAt) || null;

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await apiRequest("POST", "/api/eval-suites", json);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Suite uploaded", description: "Evaluation suite created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/eval-suites"] });
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Invalid JSON format",
        variant: "destructive",
      });
    },
  });

  const runMutation = useMutation({
    mutationFn: async (suiteId: string) => {
      const res = await apiRequest("POST", `/api/eval-suites/${suiteId}/run`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Evaluation started", description: "Check back for results" });
      queryClient.invalidateQueries({ queryKey: ["/api/eval-runs"] });
    },
    onError: (error) => {
      toast({
        title: "Run failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  const results = selectedRun?.resultsJson as EvalCaseResult[] | null;

  return (
    <Layout title="Evaluations">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Evaluation Dashboard</h2>
            <p className="text-sm text-muted-foreground">
              Upload test suites and monitor evaluation results
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".json"
              onChange={handleFileUpload}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
              data-testid="button-upload-suite"
            >
              {uploadMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Upload Suite
            </Button>
          </div>
        </div>

        <EvalDashboardCards run={latestRun} />

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="text-base">Evaluation Suites</CardTitle>
              <Select value={selectedSuiteId} onValueChange={setSelectedSuiteId}>
                <SelectTrigger className="w-[200px]" data-testid="select-suite">
                  <SelectValue placeholder="Select suite" />
                </SelectTrigger>
                <SelectContent>
                  {suites?.map((suite) => (
                    <SelectItem key={suite.id} value={suite.id}>
                      {suite.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {suitesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !suites?.length ? (
                <div className="text-center py-8">
                  <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No evaluation suites uploaded. Upload a JSON file to get started.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {suites.map((suite) => {
                    const suiteJson = suite.jsonText ? JSON.parse(suite.jsonText) as { cases: unknown[] } : { cases: [] };
                    return (
                      <div
                        key={suite.id}
                        className="flex items-center justify-between gap-4 p-3 rounded-md border"
                        data-testid={`suite-item-${suite.id}`}
                      >
                        <div>
                          <p className="font-medium text-sm">{suite.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {suiteJson.cases?.length || 0} test cases
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => runMutation.mutate(suite.id)}
                          disabled={runMutation.isPending}
                          data-testid={`button-run-${suite.id}`}
                        >
                          {runMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <Play className="h-3 w-3 mr-1" />
                              Run
                            </>
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Runs</CardTitle>
            </CardHeader>
            <CardContent>
              {runsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !runs?.length ? (
                <div className="text-center py-8">
                  <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No evaluation runs yet. Run a suite to see results.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {runs.slice(0, 5).map((run) => {
                    const summary = run.summaryJson as { passRate: number; passed: number; failed: number } | null;
                    return (
                      <div
                        key={run.id}
                        className="flex items-center justify-between gap-4 p-3 rounded-md border cursor-pointer hover:bg-accent/30"
                        onClick={() => {
                          setSelectedRun(run);
                          setShowResultsDialog(true);
                        }}
                        data-testid={`run-item-${run.id}`}
                      >
                        <div>
                          <p className="font-medium text-sm">{run.suite?.name || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(run.startedAt).toLocaleString()}
                          </p>
                        </div>
                        {run.finishedAt && summary ? (
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={summary.passRate >= 0.8 ? "default" : "destructive"}
                              className="text-xs"
                            >
                              {(summary.passRate * 100).toFixed(0)}%
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {summary.passed}/{summary.passed + summary.failed}
                            </span>
                          </div>
                        ) : (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {latestRun?.resultsJson && Array.isArray(latestRun.resultsJson) && (
          <LatestRunFailures results={latestRun.resultsJson as EvalCaseResult[]} />
        )}

        <Dialog open={showResultsDialog} onOpenChange={setShowResultsDialog}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Evaluation Run Results</DialogTitle>
            </DialogHeader>
            {selectedRun && results && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Status</TableHead>
                    <TableHead>Case ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Prompt</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result) => (
                    <TableRow key={result.id}>
                      <TableCell>
                        {result.passed ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{result.id}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {result.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm">
                        {result.prompt}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {result.reason || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
