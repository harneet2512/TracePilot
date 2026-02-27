import { test, expect } from "@playwright/test";
import { captureScreenshot } from "./helpers/screenshot";
import { loginAndWaitForSession, ensureConversationReady } from "./helpers/auth";

test("main chat bubble contains no JSON dumps or debug content", async ({ page, request }, testInfo) => {
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
  await loginAndWaitForSession(page, request, baseURL);
  const conversationId = await ensureConversationReady(page, baseURL);

  const streamDone = page.waitForResponse(
    (r) => r.url().includes("/api/chat/stream") && r.request().method() === "POST",
    { timeout: 90_000 }
  );
  await page.getByTestId("input-chat").fill("What are the blockers for the AI search launch?");
  await page.getByTestId("button-send").click();
  await streamDone;
  await page.waitForTimeout(12_000);

  const assistant = page.locator('[data-testid="assistant-message"][data-status="done"]').last();
  await expect(assistant).toBeVisible({ timeout: 60_000 });

  // Get the main answer bubble text (not the details panel)
  const mainContent = assistant.locator('[data-testid="assistant-message-content"]');
  await expect(mainContent).toBeVisible({ timeout: 10_000 });
  const mainText = await mainContent.textContent();

  // Verify no debug labels appear in the visible message (collapsed details are hidden)
  expect(mainText).not.toContain("Structured report");
  expect(mainText).not.toContain("Structured blocks");
  expect(mainText).not.toContain("Retrieved evidence");
  expect(mainText).not.toContain("Citation mapping");

  // Verify no raw internal IDs appear in the main bubble text
  // (chunkId / sourceId / sourceVersionId should never be in the answer)
  const messagesResp = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
  expect(messagesResp.status()).toBe(200);
  const messages = await messagesResp.json();
  const latestAssistant = [...messages].reverse().find((m: any) => m.role === "assistant");
  const response = latestAssistant?.metadataJson?.response || {};
  const answerText: string = response.answer_text || response.answer || "";

  expect(answerText).not.toContain("chunkId");
  expect(answerText).not.toContain("sourceId");
  expect(answerText).not.toContain("sourceVersionId");
  expect(answerText).not.toMatch(/^\s*\{/m); // No raw JSON object opening

  // Verify the response no longer includes details_blocks or retrieved_chunks at top level
  expect(response).not.toHaveProperty("details_blocks");
  expect(response).not.toHaveProperty("retrieved_chunks");

  await captureScreenshot(page, "no-json-dump.png");
});
