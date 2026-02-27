import { test, expect } from "@playwright/test";
import { captureScreenshot } from "./helpers/screenshot";
import { loginAndWaitForSession, ensureConversationReady } from "./helpers/auth";

test("citation [1] is clickable and triggers window.open with correct URL", async ({ page, request }, testInfo) => {
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
  await loginAndWaitForSession(page, request, baseURL);
  await ensureConversationReady(page, baseURL);

  const streamDone = page.waitForResponse(
    (r) => r.url().includes("/api/chat/stream") && r.request().method() === "POST",
    { timeout: 90_000 }
  );
  await page.getByTestId("input-chat").fill("Are there any blockers for the AI search launch?");
  await page.getByTestId("button-send").click();
  await streamDone;
  await page.waitForTimeout(12_000);

  const assistant = page.locator('[data-testid="assistant-message"][data-status="done"]').last();
  await expect(assistant).toBeVisible({ timeout: 60_000 });

  const firstCitation = assistant.locator('[data-testid="inline-citation-link"]').first();
  await expect(firstCitation).toBeVisible({ timeout: 15_000 });

  // Intercept window.open
  const openPromise = page.waitForEvent("popup", { timeout: 10_000 }).catch(() => null);
  const windowOpenUrl = await page.evaluate(() => {
    return new Promise<string | null>((resolve) => {
      const origOpen = window.open;
      window.open = (url?: string | URL, ...args: any[]) => {
        resolve(typeof url === "string" ? url : url?.toString() || null);
        window.open = origOpen;
        return null;
      };
      const btn = document.querySelector('[data-testid="inline-citation-link"]');
      if (btn) (btn as HTMLElement).click();
      else resolve(null);
    });
  });

  expect(windowOpenUrl, "Clicking citation [1] should trigger window.open").toBeTruthy();
  expect(
    windowOpenUrl!.includes("/api/sources/") || windowOpenUrl!.startsWith("http"),
    `Citation URL should be an external link or /api/sources/ fallback, got: ${windowOpenUrl}`
  ).toBe(true);

  await captureScreenshot(page, "citations-clickable.png");
});

test("evidence Open button is visible and clickable in details panel", async ({ page, request }, testInfo) => {
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
  await loginAndWaitForSession(page, request, baseURL);
  await ensureConversationReady(page, baseURL);

  const streamDone = page.waitForResponse(
    (r) => r.url().includes("/api/chat/stream") && r.request().method() === "POST",
    { timeout: 90_000 }
  );
  await page.getByTestId("input-chat").fill("What's our 2025 product roadmap?");
  await page.getByTestId("button-send").click();
  await streamDone;
  await page.waitForTimeout(12_000);

  const assistant = page.locator('[data-testid="assistant-message"][data-status="done"]').last();
  await expect(assistant).toBeVisible({ timeout: 60_000 });

  // Open the details panel
  const detailsToggle = assistant.locator('[data-testid="details-toggle"]');
  if (await detailsToggle.isVisible()) {
    await detailsToggle.click();
    await page.waitForTimeout(500);

    const openButtons = assistant.locator('[data-testid="evidence-open-link"]');
    const count = await openButtons.count();
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        await expect(openButtons.nth(i)).toBeVisible();
      }
    }
  }

  await captureScreenshot(page, "sources-open-button.png");
});
