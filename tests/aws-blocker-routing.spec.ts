import { test, expect } from "@playwright/test";
import { captureScreenshot } from "./helpers/screenshot";
import { loginAndWaitForSession, ensureConversationReady } from "./helpers/auth";

test("Q4: AWS blocker query routes to Jira INFRA-1247 and Engineering AllHands", async ({ page, request }, testInfo) => {
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

  const messagesResp = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
  expect(messagesResp.status()).toBe(200);
  const messages = await messagesResp.json();
  const latestAssistant = [...messages].reverse().find((m: any) => m.role === "assistant");
  const response = latestAssistant?.metadataJson?.response || {};
  const sourcesUsed = response.sources_used?.length ? response.sources_used : (response.sources || []);
  const titles = sourcesUsed.map((s: any) => String(s.title || "").toLowerCase());

  // MUST include Jira INFRA-1247
  const hasJira = titles.some((t: string) => /jira|infra.?1247|aws.?eu.?blocker/i.test(t));
  expect(hasJira, `Q4 sources must include Jira INFRA-1247. Got: ${titles.join(", ")}`).toBe(true);

  // MUST include Engineering AllHands
  const hasAllHands = titles.some((t: string) => /allhands|all.?hands|engineering.*oct/i.test(t));
  expect(hasAllHands, `Q4 sources must include Engineering AllHands. Got: ${titles.join(", ")}`).toBe(true);

  // MUST NOT include Team Quick Reference or OKRs as primary sources
  const hasTeamGuide = titles.some((t: string) => /team.?quick.?reference/i.test(t));
  const hasOkrs = titles.some((t: string) => /q4.?2024.?okr/i.test(t));
  expect(hasTeamGuide, `Q4 sources should NOT include Team Quick Reference. Got: ${titles.join(", ")}`).toBe(false);
  expect(hasOkrs, `Q4 sources should NOT include Q4 OKRs. Got: ${titles.join(", ")}`).toBe(false);

  // Answer must have at least 2 bullet lines
  const answerText = response.answer_text || response.answer || "";
  const bulletCount = (answerText.match(/^-\s+.+$/gm) || []).length;
  expect(bulletCount, `Q4 answer must have >=2 bullets, got ${bulletCount}`).toBeGreaterThanOrEqual(2);

  // Inline citations should be present
  const inlineCitations = assistant.locator('[data-testid="inline-citation-link"]');
  await expect(inlineCitations.first()).toBeVisible({ timeout: 15_000 });
  expect(await inlineCitations.count()).toBeGreaterThanOrEqual(1);

  await captureScreenshot(page, "q4-aws-blocker-routing.png");
});

test("Q8: biggest risk query includes blocker docs", async ({ page, request }, testInfo) => {
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
  await loginAndWaitForSession(page, request, baseURL);
  const conversationId = await ensureConversationReady(page, baseURL);

  const streamDone = page.waitForResponse(
    (r) => r.url().includes("/api/chat/stream") && r.request().method() === "POST",
    { timeout: 90_000 }
  );
  await page.getByTestId("input-chat").fill("What's the biggest risk to our November 15 launch and what are we doing about it?");
  await page.getByTestId("button-send").click();
  await streamDone;
  await page.waitForTimeout(12_000);

  const assistant = page.locator('[data-testid="assistant-message"][data-status="done"]').last();
  await expect(assistant).toBeVisible({ timeout: 60_000 });

  const messagesResp = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
  expect(messagesResp.status()).toBe(200);
  const messages = await messagesResp.json();
  const latestAssistant = [...messages].reverse().find((m: any) => m.role === "assistant");
  const response = latestAssistant?.metadataJson?.response || {};
  const sourcesUsed = response.sources_used?.length ? response.sources_used : (response.sources || []);
  const titles = sourcesUsed.map((s: any) => String(s.title || "").toLowerCase());

  // Should include at least one blocker-related source
  const hasBlockerDoc = titles.some((t: string) =>
    /jira|infra.?1247|allhands|all.?hands|blocker/i.test(t)
  );
  expect(hasBlockerDoc, `Q8 should cite a blocker-related doc. Got: ${titles.join(", ")}`).toBe(true);

  // At least 2 unique sources
  const uniqueIds = new Set(sourcesUsed.map((s: any) => s.sourceId || s.id));
  expect(uniqueIds.size, "Q8 should have >=2 sources").toBeGreaterThanOrEqual(2);

  await captureScreenshot(page, "q8-risk-routing.png");
});
