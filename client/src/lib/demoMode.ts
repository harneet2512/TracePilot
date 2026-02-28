import type { User, Conversation } from "@shared/schema";
import demoResponsesData from "./demoResponses.json";

// Demo mode is enabled only via environment variable
export const isDemoMode = import.meta.env.VITE_DEMO_MODE === "true";

// Demo user conforming to the repo's User type (typeof users.$inferSelect)
export const demoUser: User = {
  id: "demo-00000000-0000-0000-0000-000000000001",
  workspaceId: "demo-ws-00000000-0000-0000-0000-000000000001",
  email: "demo@tracepilot.dev",
  passwordHash: null,
  role: "admin",
  createdAt: new Date(),
};

// Demo conversation conforming to the repo's Conversation type
export const demoConversation: Conversation = {
  id: "demo-conv-00000000-0000-0000-0000-000000000001",
  userId: demoUser.id,
  title: "Demo Conversation",
  summary: null,
  environment: null,
  model: null,
  modelConfigJson: null,
  retrievalConfigJson: null,
  entrypoint: null,
  appVersion: null,
  gitSha: null,
  finalOutcome: null,
  errorClass: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Structured logger for demo mode events
export function logDemoMode(event: string, detail: Record<string, unknown>): void {
  console.warn(`[DEMO_MODE] ${event}`, detail);
}

// Returns true only when demo mode is enabled AND the backend is unreachable
export function shouldFallbackToDemo(status: number | null, error?: unknown): boolean {
  if (!isDemoMode) return false;
  if (status === null || status === 404 || status === 405) return true;
  if (error instanceof TypeError) return true; // fetch network errors
  return false;
}

// Keyword-match query against demo responses
export function getDemoResponse(query: string): Record<string, unknown> {
  const q = query.toLowerCase();
  if (q.includes("okr") || q.includes("objective") || q.includes("q4")) {
    return demoResponsesData.okr;
  }
  if (q.includes("blocker") || q.includes("block") || q.includes("aws") || q.includes("incident")) {
    return demoResponsesData.blocker;
  }
  return demoResponsesData.default;
}
