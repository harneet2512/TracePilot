import { test, expect } from "@playwright/test";
import { mkdirSync } from "fs";
import { ensureConversationReady, loginAndWaitForSession } from "./helpers/auth";

const DIR = "playwright-artifacts/regression-after";

function countSentences(text: string): number {
  return text
    .split(/[.!?]+/g)
    .map((v) => v.trim())
    .filter(Boolean).length;
}

test.beforeAll(() => {
  mkdirSync(DIR, { recursive: true });
});

test("smalltalk invariant: Hi is brief, no retrieval artifacts, and fast", async ({ page, request }, testInfo) => {
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
  await loginAndWaitForSession(page, request, baseURL);
  const conversationId = await ensureConversationReady(page, baseURL);

  const started = Date.now();
  const streamDone = page.waitForResponse(
    (r) =>
      (r.url().includes("/api/chat/stream") || r.url().endsWith("/api/chat")) &&
      r.request().method() === "POST",
    { timeout: 60_000 },
  );
  await page.getByTestId("input-chat").fill("Hi");
  await page.getByTestId("button-send").click();
  await streamDone;
  const elapsedMs = Date.now() - started;

  const assistant = page.locator('[data-testid="assistant-message"][data-status="done"]').last();
  await expect(assistant).toBeVisible({ timeout: 30_000 });
  const content = assistant.getByTestId("assistant-message-content");
  const text = ((await content.textContent()) || "").trim();

  expect(countSentences(text)).toBeGreaterThanOrEqual(1);
  expect(countSentences(text)).toBeLessThanOrEqual(2);
  expect((text.match(/\n-\s/g) || []).length).toBe(0);
  expect((text.match(/\[\d+\]/g) || []).length).toBe(0);
  await expect(assistant.getByTestId("details-toggle")).toHaveCount(0);
  expect(elapsedMs, "smalltalk response should be fast").toBeLessThan(8_000);

  const messagesResp = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
  expect(messagesResp.status()).toBe(200);
  const messages = await messagesResp.json();
  const latestAssistant = [...messages].reverse().find((m: any) => m.role === "assistant");
  const response = latestAssistant?.metadataJson?.response || {};
  expect((response.citations || []).length).toBe(0);
  expect((response.sources || []).length).toBe(0);
  expect(response.details == null || Object.keys(response.details || {}).length === 0).toBe(true);

  await page.screenshot({ path: `${DIR}/after_1_hi.png`, fullPage: true });
});
