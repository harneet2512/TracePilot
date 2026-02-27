import { test, expect } from "@playwright/test";
import { captureScreenshot } from "./helpers/screenshot";
import { loginAndWaitForSession, ensureConversationReady } from "./helpers/auth";

test("answer style: Q8 narrative + bullets + offer and multi-source", async ({ page, request }, testInfo) => {
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
  await loginAndWaitForSession(page, request, baseURL);
  const conversationId = await ensureConversationReady(page, baseURL);

  const streamDone = page.waitForResponse(
    (r) => r.url().includes("/api/chat/stream") && r.request().method() === "POST",
    { timeout: 90_000 }
  );

  await page.getByTestId("input-chat").fill(
    "What's the biggest risk to our November 15 launch and what are we doing about it?"
  );
  await page.getByTestId("button-send").click();
  await streamDone;
  await page.waitForTimeout(12_000);

  const assistant = page.locator('[data-testid="assistant-message"][data-status="done"]').last();
  await expect(assistant).toBeVisible({ timeout: 60_000 });

  // Fetch answer from backend
  const messagesResp = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
  expect(messagesResp.status()).toBe(200);
  const messages = await messagesResp.json();
  const latestAssistant = [...messages].reverse().find((m: any) => m.role === "assistant");
  const response = latestAssistant?.metadataJson?.response || {};
  const cardText = String(response.answer_text || response.answer || "");

  await captureScreenshot(page, "q8.png");

  const trimmed = cardText.trim();
  const firstLine = trimmed.split(/\r?\n/).find((line) => line.trim().length > 0) || "";
  const narrativeBlock = trimmed.split(/\n-\s/)[0] || trimmed.slice(0, 500);
  const sentenceCount = (narrativeBlock.match(/[.!?](\s|$)/g) || []).length;
  const bulletCount = (trimmed.match(/(^|\n)-\s+/g) || []).length;
  const tail = trimmed.slice(-120);

  expect(
    /^key facts/i.test(firstLine),
    `Response must not start with KEY FACTS. First line: ${firstLine}`
  ).toBe(false);
  expect(sentenceCount, "Response should begin with narrative (>=2 sentences)").toBeGreaterThanOrEqual(2);
  expect(bulletCount, "Response should include >=2 bullets").toBeGreaterThanOrEqual(2);
  expect(
    /\?\s*$/.test(trimmed) || /(want me to|do you want|would you like|shall i|can i)/i.test(tail),
    "Response should end with a helpful question/offer"
  ).toBe(true);
  expect(/[\u2014\u2013]/.test(trimmed), "Response must not contain em/en dashes").toBe(false);

  // No numeric array garbage
  expect(/(\d+\s+){15,}/.test(trimmed), "No long numeric runs in answer").toBe(false);

  // Multi-source check
  const sourceIds = (response.sources_used || response.sources || [])
    .map((s: any) => s.sourceId || s.id)
    .filter(Boolean);
  expect(new Set(sourceIds).size, "Q8 should include >=2 unique sources").toBeGreaterThanOrEqual(2);
});
