import { Switch, Route, Redirect, useLocation } from "wouter";
import { useEffect, useRef } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import ChatPage from "@/pages/chat";
import GoogleScopesPage from "@/pages/connect/google";
import AtlassianScopesPage from "@/pages/connect/atlassian";
import SlackScopesPage from "@/pages/connect/slack";
import SourceViewerPage from "@/pages/sources/[sourceId]";
import ConnectorsPage from "@/pages/admin/connectors";
import IngestPage from "@/pages/admin/ingest";
import PoliciesPage from "@/pages/admin/policies";
import AuditPage from "@/pages/admin/audit";
import EvalsPage from "@/pages/admin/evals";
import EvalCaseDrilldownPage from "@/pages/admin/eval-case-drilldown";
import ObservabilityPage from "@/pages/admin/observability";
import AdminChatsOverviewPage from "@/pages/admin/chats";
import AdminChatDetailPage from "@/pages/admin/chat-detail";
import AdminReplyDetailPage from "@/pages/admin/reply-detail";
import PlaybooksPage from "@/pages/playbooks";
import NewPlaybookPage from "@/pages/playbooks/new";
import PlaybookDetailPage from "@/pages/playbooks/[id]";
import VoicePage from "@/pages/voice";
import { Loader2 } from "lucide-react";
import { perfEnd, perfStart } from "@/lib/perf";
import { PerfOverlay } from "@/components/PerfOverlay";

function ProtectedRoute({ component: Component, adminOnly = false }: { component: React.ComponentType; adminOnly?: boolean }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (adminOnly && user.role !== "admin") {
    return <Redirect to="/chat" />;
  }

  return <Component />;
}

function Router() {
  const [location] = useLocation();
  const navStartRef = useRef<number>(0);

  useEffect(() => {
    navStartRef.current = perfStart(`route:navigate:${location}`);
    const id = window.setTimeout(() => {
      perfEnd("render", `route:navigate:${location}`, navStartRef.current);
    }, 0);
    return () => window.clearTimeout(id);
  }, [location]);

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/chat/:conversationId">
        {() => <ProtectedRoute component={ChatPage} />}
      </Route>
      <Route path="/chat">
        {() => <ProtectedRoute component={ChatPage} />}
      </Route>
      <Route path="/connect">
        {() => <Redirect to="/admin/connectors" />}
      </Route>
      <Route path="/connect/google">
        {() => <ProtectedRoute component={GoogleScopesPage} />}
      </Route>
      <Route path="/connect/atlassian">
        {() => <ProtectedRoute component={AtlassianScopesPage} />}
      </Route>
      <Route path="/connect/slack">
        {() => <ProtectedRoute component={SlackScopesPage} />}
      </Route>
      <Route path="/sources/:sourceId">
        {() => <ProtectedRoute component={SourceViewerPage} />}
      </Route>
      <Route path="/admin/connectors">
        {() => <ProtectedRoute component={ConnectorsPage} adminOnly />}
      </Route>
      <Route path="/admin/ingest">
        {() => <ProtectedRoute component={IngestPage} adminOnly />}
      </Route>
      <Route path="/admin/policies">
        {() => <ProtectedRoute component={PoliciesPage} adminOnly />}
      </Route>
      <Route path="/admin/audit">
        {() => <ProtectedRoute component={AuditPage} adminOnly />}
      </Route>
      <Route path="/admin/evals">
        {() => <ProtectedRoute component={EvalsPage} adminOnly />}
      </Route>
      <Route path="/admin/evaluations">
        {() => <ProtectedRoute component={EvalsPage} adminOnly />}
      </Route>
      <Route path="/admin/evals/runs/:runId/cases/:resultId">
        {() => <ProtectedRoute component={EvalCaseDrilldownPage} adminOnly />}
      </Route>
      <Route path="/admin/chats">
        {() => <ProtectedRoute component={AdminChatsOverviewPage} adminOnly />}
      </Route>
      <Route path="/admin/chat-quality">
        {() => <ProtectedRoute component={AdminChatsOverviewPage} adminOnly />}
      </Route>
      <Route path="/admin/chats/:chatId">
        {() => <ProtectedRoute component={AdminChatDetailPage} adminOnly />}
      </Route>
      <Route path="/admin/chats/:chatId/replies/:replyId">
        {() => <ProtectedRoute component={AdminReplyDetailPage} adminOnly />}
      </Route>
      <Route path="/admin/observability">
        {() => <ProtectedRoute component={ObservabilityPage} adminOnly />}
      </Route>
      <Route path="/playbooks">
        {() => <ProtectedRoute component={PlaybooksPage} />}
      </Route>
      <Route path="/playbooks/new">
        {() => <ProtectedRoute component={NewPlaybookPage} />}
      </Route>
      <Route path="/playbooks/:id">
        {() => <ProtectedRoute component={PlaybookDetailPage} />}
      </Route>
      <Route path="/voice">
        {() => <ProtectedRoute component={VoicePage} />}
      </Route>
      <Route path="/">
        {() => <Redirect to="/chat" />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <Toaster />
            <Router />
            <PerfOverlay />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
