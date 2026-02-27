import { test, expect } from "@playwright/test";
import { captureScreenshot } from "./helpers/screenshot";
import { loginAndWaitForSession, ensureConversationReady } from "./helpers/auth";

test("Q4 answer contains no garbage text or robotic preambles", async ({ page, request }, testInfo) => {
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
  const answerText: string = response.answer_text || response.answer || "";

  // No PDF placeholder chunks
  expect(answerText).not.toContain("[PDF Document");

  // No long numeric arrays (25+ consecutive digit groups)
  expect(answerText).not.toMatch(/(\d+\s+){25,}/);

  // No robotic preambles
  expect(answerText.toLowerCase()).not.toContain("i cross-checked");
  expect(answerText.toLowerCase()).not.toContain("i kept this grounded");
  expect(answerText.toLowerCase()).not.toContain("grounded in the supporting documents");

  // No raw JSON or metadata keys in the answer
  expect(answerText).not.toContain("chunkId");
  expect(answerText).not.toContain("sourceVersionId");
  expect(answerText).not.toContain("metadataJson");

  // No "Structured report" or "Retrieved evidence" labels in main answer
  expect(answerText).not.toMatch(/^Structured report/im);
  expect(answerText).not.toMatch(/^Retrieved evidence/im);

  // Answer should be enterprise style: narrative + bullets + follow-up question
  const bulletCount = (answerText.match(/^[-•]\s+.+$/gm) || []).length;
  expect(bulletCount, `Answer should have >=2 bullets, got ${bulletCount}`).toBeGreaterThanOrEqual(2);
  // Answer should contain a question mark (follow-up offer)
  expect(answerText, "Answer should contain a follow-up question").toContain("?");

  await captureScreenshot(page, "q4-no-garbage.png");
});
