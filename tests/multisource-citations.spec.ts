import { test, expect } from "@playwright/test";
import { captureScreenshot } from "./helpers/screenshot";
import { loginAndWaitForSession, ensureConversationReady } from "./helpers/auth";

test("Q2 uses multi-source citations with deduped sources", async ({ page, request }, testInfo) => {
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
  await loginAndWaitForSession(page, request, baseURL);
  const conversationId = await ensureConversationReady(page, baseURL);

  const streamDone = page.waitForResponse(
    (r) => r.url().includes("/api/chat/stream") && r.request().method() === "POST",
    { timeout: 90_000 }
  );
  await page.getByTestId("input-chat").fill("Are there any blockers for the AI search launch?");
  await page.getByTestId("button-send").click();
  await streamDone;
  await page.waitForTimeout(12_000);
  await captureScreenshot(page, "multisource-q2.png");

  const assistant = page.locator('[data-testid="assistant-message"][data-status="done"]').last();
  await expect(assistant).toBeVisible({ timeout: 60_000 });

  // Inline citations should render as clickable links
  const inlineCitationLinks = assistant.locator('[data-testid="inline-citation-link"]');
  await expect(inlineCitationLinks.first()).toBeVisible({ timeout: 15_000 });
  expect(await inlineCitationLinks.count()).toBeGreaterThanOrEqual(2);

  // Validate backend contract
  const messagesResp = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
  expect(messagesResp.status()).toBe(200);
  const messages = await messagesResp.json();
  const latestAssistant = [...messages].reverse().find((m: any) => m.role === "assistant");
  const response = latestAssistant?.metadataJson?.response || {};
  const sources = response.sources_used?.length ? response.sources_used : (response.sources || []);
  const ids = sources.map((s: any) => String(s.sourceId || s.id || "")).filter(Boolean);

  // Must have at least 2 unique sources for a blocker query
  const uniqueIds = new Set(ids);
  expect(uniqueIds.size, "Q2 should include >=2 unique sources").toBeGreaterThanOrEqual(2);

  // No duplicate sourceIds
  expect(uniqueIds.size, "sources_used must be deduped (no duplicate sourceIds)").toBe(ids.length);

  // Should include Engineering AllHands and JIRA Infra
  const titles = sources.map((s: any) => String(s.title || "").toLowerCase());
  const hasAllHands = titles.some((t: string) => /allhands|all_hands|engineering.*oct/i.test(t));
  const hasJira = titles.some((t: string) => /jira|infra.*1247/i.test(t));
  expect(hasAllHands || hasJira, "Q2 should cite AllHands or JIRA blocker doc").toBe(true);
});
