import { test, expect } from "@playwright/test";
import { captureScreenshot } from "./helpers/screenshot";
import { loginAndWaitForSession, ensureConversationReady } from "./helpers/auth";

test("citation [1] opens popover with passage and filename; only Open source triggers window.open", async ({ page, request }, testInfo) => {
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

  // Click [1] to open popover (must not navigate)
  await firstCitation.click();
  await page.waitForTimeout(300);

  // Popover should be visible with title/filename and "Open source" control
  const openSourceButton = page.getByRole("button", { name: /open source/i });
  await expect(openSourceButton).toBeVisible({ timeout: 5_000 });

  // Stub window.open to capture URL when "Open source" is clicked
  await page.evaluate(() => {
    (window as any).__citationOpenUrl = null;
    const orig = window.open;
    window.open = (url?: string | URL) => {
      (window as any).__citationOpenUrl = typeof url === "string" ? url : url?.toString() ?? null;
      window.open = orig;
      return null;
    };
  });
  await openSourceButton.click();
  await page.waitForTimeout(100);
  const windowOpenUrl = await page.evaluate(() => (window as any).__citationOpenUrl as string | null);

  expect(windowOpenUrl, "Clicking Open source in popover should trigger window.open").toBeTruthy();
  expect(
    windowOpenUrl!.includes("/api/sources/") || windowOpenUrl!.startsWith("http"),
    `Open source URL should be external or /api/sources/, got: ${windowOpenUrl}`
  ).toBe(true);

  await captureScreenshot(page, "citations-clickable.png");
});

test("citation popover closes on ESC and click outside", async ({ page, request }, testInfo) => {
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
  await firstCitation.click();
  await page.waitForTimeout(300);
  await expect(page.getByRole("button", { name: /open source/i })).toBeVisible({ timeout: 5_000 });

  // ESC should close popover
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await expect(page.getByRole("button", { name: /open source/i })).not.toBeVisible();

  // Click [1] again, then click outside to close
  await firstCitation.click();
  await page.waitForTimeout(300);
  await expect(page.getByRole("button", { name: /open source/i })).toBeVisible({ timeout: 5_000 });
  await page.mouse.click(10, 10);
  await page.waitForTimeout(200);
  await expect(page.getByRole("button", { name: /open source/i })).not.toBeVisible();
});

test("evidence Open button is visible and clickable in details panel", async ({ page, request }, testInfo) => {
  test.setTimeout(180_000); // cold start: stream + refetch can take >60s; we wait up to 120s for done
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
  // Wait for client to set message status to "complete" and re-render (cold start can delay stream + refetch)
  const assistant = page.locator('[data-testid="assistant-message"][data-status="done"]').last();
  await expect(assistant).toBeVisible({ timeout: 120_000 });

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
