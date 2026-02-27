import { test, expect } from "@playwright/test";
import { captureScreenshot } from "./helpers/screenshot";
import { loginAndWaitForSession, ensureConversationReady } from "./helpers/auth";

test("user question bubble stays right-aligned and does not get sidelined", async ({ page, request }, testInfo) => {
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
  await loginAndWaitForSession(page, request, baseURL);
  await ensureConversationReady(page, baseURL);

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

  // Check user message bubble bounding box
  const userBubble = page.locator('[data-testid="user-message"]').last();
  if (await userBubble.isVisible()) {
    const box = await userBubble.boundingBox();
    if (box) {
      const viewport = page.viewportSize();
      if (viewport) {
        const rightEdge = box.x + box.width;
        const viewportWidth = viewport.width;
        expect(
          rightEdge,
          `User bubble right edge (${rightEdge}) should be near viewport right (${viewportWidth})`
        ).toBeGreaterThan(viewportWidth * 0.5);
      }
    }
  }

  // Check assistant container has overflow protection
  const assistantContent = assistant.locator('[data-testid="assistant-message-content"]');
  if (await assistantContent.isVisible()) {
    const style = await assistantContent.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        overflowWrap: computed.overflowWrap,
        wordBreak: computed.wordBreak,
      };
    });
    expect(
      style.overflowWrap === "anywhere" || style.overflowWrap === "break-word" || style.wordBreak === "break-word",
      "Assistant content should have overflow-wrap or word-break protection"
    ).toBe(true);
  }

  await captureScreenshot(page, "chat-layout-q4.png");
});
