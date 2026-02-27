import { test, expect } from "@playwright/test";
import { mkdirSync } from "fs";
import { loginAndWaitForSession, ensureConversationReady } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

const DIR = "playwright-artifacts/greeting";

test.beforeAll(() => {
  mkdirSync(DIR, { recursive: true });
});

test("Hi greeting: no bullets, no Details, short response, exactly one question", async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
  await loginAndWaitForSession(page, request, baseURL);
  await ensureConversationReady(page, baseURL);

  const streamDone = page.waitForResponse(
    (r) => r.url().includes("/api/chat/stream") && r.request().method() === "POST",
    { timeout: 60_000 }
  );
  await page.getByTestId("input-chat").fill("Hi");
  await page.getByTestId("button-send").click();
  await streamDone;

  const assistantMsg = page.locator('[data-testid="assistant-message"][data-status="done"]').last();
  await expect(assistantMsg).toBeVisible({ timeout: 60_000 });

  const contentEl = assistantMsg.getByTestId("assistant-message-content");

  // No list items (<li>) inside the assistant message
  const liCount = await contentEl.locator("li").count();
  expect(liCount).toBe(0);

  // Assistant message length is short (< 350 chars)
  const text = (await contentEl.textContent()) || "";
  expect(text.length).toBeLessThan(350);

  // Details toggle does NOT exist (not rendered when no evidence)
  const detailsToggleCount = await assistantMsg.getByTestId("details-toggle").count();
  expect(detailsToggleCount).toBe(0);

  // Response contains exactly ONE question mark (avoid double "How can I help?")
  const questionCount = (text.match(/\?/g) || []).length;
  expect(questionCount).toBe(1);

  await page.screenshot({
    path: `${DIR}/hi-response.png`,
    fullPage: true,
  });
});
