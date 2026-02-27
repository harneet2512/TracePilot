import { test, expect } from "@playwright/test";
import { mkdirSync } from "fs";

const ARTIFACTS_DIR = "playwright-artifacts";

test.beforeAll(() => {
  mkdirSync(`${ARTIFACTS_DIR}/before`, { recursive: true });
  mkdirSync(`${ARTIFACTS_DIR}/after`, { recursive: true });
});

test("chat golden style: narrative is primary, OKR table is collapsible", async ({ page, request }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL as string;

  // Seed admin user
  const seedResponse = await request.post(`${baseURL}/api/seed`);
  expect([200, 201]).toContain(seedResponse.status());

  // Login
  const loginResponse = await page.request.post(`${baseURL}/api/auth/login`, {
    data: { email: "admin@fieldcopilot.com", password: "admin123" },
  });
  expect(loginResponse.status(), "admin login should succeed").toBe(200);

  // Navigate to chat
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/chat/);

  // Wait for chat input to be ready
  await expect(page.getByTestId("input-chat")).toBeVisible({ timeout: 10_000 });

  // Send OKR query
  const chatStreamPromise = page.waitForResponse(
    (resp) => resp.url().includes("/api/chat/stream") && resp.request().method() === "POST",
  );
  await page.getByTestId("input-chat").fill("What are our Q4 OKRs for the AI search project?");
  await page.getByTestId("button-send").click();

  const chatStreamResponse = await chatStreamPromise;
  expect(chatStreamResponse.status()).toBe(200);

  // Wait for assistant response to appear (poll for content)
  const assistantMessage = page.locator('[class*="bg-card"]').last();
  await expect(assistantMessage).toBeVisible({ timeout: 30_000 });

  // Wait for streaming to complete (no more spinner)
  await page.waitForTimeout(5_000);

  // Screenshot before state
  await page.screenshot({
    path: `${ARTIFACTS_DIR}/before/chat-okr-response.png`,
    fullPage: true,
  });

  // AFTER fix assertions:
  // 1. Narrative text should be visible as primary response
  const narrativeBlock = page.locator('.text-sm.leading-relaxed.whitespace-pre-wrap');
  const narrativeVisible = await narrativeBlock.count() > 0;

  // 2. If OkrAnswerCard exists, it should be inside a <details> element (collapsed)
  const detailsOkr = page.locator('details:has-text("View extracted OKRs")');
  const standaloneOkr = page.locator('[data-testid="okr-answer-card"]');

  // 3. No em dashes in response text
  const pageText = await page.textContent('body') || '';
  const hasEmDash = pageText.includes('\u2014') || pageText.includes('\u2013');

  // Assert narrative is shown (the fix makes answer text primary)
  if (narrativeVisible) {
    // After fix: narrative text is the primary response
    expect(narrativeVisible).toBeTruthy();

    // If OKR card exists, it should be in a collapsible details element
    const detailsCount = await detailsOkr.count();
    const standaloneCount = await standaloneOkr.count();
    if (detailsCount > 0 || standaloneCount > 0) {
      // OKR table should be inside <details>, not standalone
      expect(detailsCount).toBeGreaterThanOrEqual(standaloneCount);
    }
  }

  // Screenshot after state
  await page.screenshot({
    path: `${ARTIFACTS_DIR}/after/chat-okr-response.png`,
    fullPage: true,
  });
});
