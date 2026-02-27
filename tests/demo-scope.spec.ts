import { test, expect } from "@playwright/test";
import { captureScreenshot } from "./helpers/screenshot";
import { loginAndWaitForSession, ensureConversationReady } from "./helpers/auth";

const GOLDEN_TITLES_NORMALIZED = [
  "q4_2024_okrs",
  "ai_search_architecture",
  "engineering_allhands_oct28_2024",
  "product_roadmap_2025",
  "jira_infra-1247_aws_eu_blocker",
  "jira-infra-1247_aws_eu_blocker",
  "team_quick_reference_guide",
];

function normalizeTitle(t: string): string {
  return (t || "")
    .toLowerCase()
    .replace(/\.(md|pdf|docx?|txt|html?)$/i, "")
    .replace(/[_\-]+/g, "_")
    .replace(/\s+/g, "_")
    .trim();
}

function isGoldenTitle(title: string): boolean {
  const norm = normalizeTitle(title);
  if (!norm) return false;
  return GOLDEN_TITLES_NORMALIZED.some((g) => norm.startsWith(g) || g.startsWith(norm));
}

test("demo scope filters sources to golden docs only (Q4)", async ({ page, request }, testInfo) => {
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
  await loginAndWaitForSession(page, request, baseURL);
  const conversationId = await ensureConversationReady(page, baseURL);

  const streamDone = page.waitForResponse(
    (r) => r.url().includes("/api/chat/stream") && r.request().method() === "POST",
    { timeout: 90_000 }
  );
  await page.getByTestId("input-chat").fill("Who is responsible for fixing the AWS blocker and when is the deadline?");
  await page.getByTestId("button-send").click();
  await streamDone;
  await page.waitForTimeout(12_000);

  const assistant = page.locator('[data-testid="assistant-message"][data-status="done"]').last();
  await expect(assistant).toBeVisible({ timeout: 60_000 });
  await captureScreenshot(page, "demo-scope-q4.png");

  const messagesResp = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
  expect(messagesResp.status()).toBe(200);
  const messages = await messagesResp.json();
  const latestAssistant = [...messages].reverse().find((m: any) => m.role === "assistant");
  const response = latestAssistant?.metadataJson?.response || {};
  const sourcesUsed = response.sources_used || response.sources || [];
  const titles = sourcesUsed.map((s: any) => String(s.title || s.label || ""));

  for (const title of titles) {
    expect(isGoldenTitle(title), `Non-golden source leaked: "${title}"`).toBe(true);
    expect(/\.ipynb$/i.test(title), `Notebook source leaked: ${title}`).toBe(false);
    expect(/\.xml$/i.test(title), `XML source leaked: ${title}`).toBe(false);
    expect(/resume|cv|linkedin|portfolio|bio|elsevier/i.test(title), `Personal/unrelated source leaked: ${title}`).toBe(false);
  }
});
