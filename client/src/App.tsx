import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import ChatPage from "@/pages/chat";
import SourceViewerPage from "@/pages/sources/[sourceId]";
import ConnectorsPage from "@/pages/admin/connectors";
import IngestPage from "@/pages/admin/ingest";
import PoliciesPage from "@/pages/admin/policies";
import AuditPage from "@/pages/admin/audit";
import EvalsPage from "@/pages/admin/evals";
import { Loader2 } from "lucide-react";

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
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/chat">
        {() => <ProtectedRoute component={ChatPage} />}
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
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
