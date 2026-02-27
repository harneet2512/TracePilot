import { expect, type APIRequestContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import { ensureConversationReady, loginAndWaitForSession } from "./auth";

export const CITATION_QUERIES = {
  q2: "Are there any blockers for the AI search launch?",
  q4: "Who is responsible for fixing the AWS blocker and when is the deadline?",
  q8: "What's the biggest risk to our November 15 launch and what are we doing about it?",
} as const;

export type ChatResponsePayload = Record<string, any>;

export async function runCitationQuery(params: {
  page: Page;
  request: APIRequestContext;
  testInfo: TestInfo;
  query: string;
}): Promise<{
  assistant: Locator;
  response: ChatResponsePayload;
  conversationId: string;
}> {
  const { page, request, testInfo, query } = params;
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
  await loginAndWaitForSession(page, request, baseURL);
  const conversationId = await ensureConversationReady(page, baseURL);

  const streamDone = page.waitForResponse((r) => {
    if (r.request().method() !== "POST") return false;
    const url = r.url();
    return url.includes("/api/chat/stream") || url.endsWith("/api/chat");
  }, { timeout: 120_000 });
  await page.getByTestId("input-chat").fill(query);
  await page.getByTestId("button-send").click();
  await streamDone;
  await page.waitForTimeout(10_000);

  const assistant = page.locator('[data-testid="assistant-message"][data-status="done"]').last();
  await expect(assistant).toBeVisible({ timeout: 60_000 });

  const detailsToggle = assistant.locator('[data-testid="details-toggle"]');
  if (await detailsToggle.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await detailsToggle.click();
    await page.waitForTimeout(600);
  }

  const messagesResp = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
  expect(messagesResp.status()).toBe(200);
  const messages = await messagesResp.json();
  const latestAssistant = [...messages].reverse().find((m: any) => m.role === "assistant");
  const response = latestAssistant?.metadataJson?.response || {};

  return { assistant, response, conversationId };
}

export function extractMarkers(answerText: string): string[] {
  return [...(answerText || "").matchAll(/\[(\d+)\]/g)].map((m) => m[1]);
}

