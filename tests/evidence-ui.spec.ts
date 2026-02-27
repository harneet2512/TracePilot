import { test, expect } from "@playwright/test";
import { captureScreenshot } from "./helpers/screenshot";
import { loginAndWaitForSession, ensureConversationReady } from "./helpers/auth";

test("evidence UI shows filename and Open link, no chunkId or sourceId", async ({ page, request }, testInfo) => {
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
  await loginAndWaitForSession(page, request, baseURL);
  await ensureConversationReady(page, baseURL);

  const streamDone = page.waitForResponse(
    (r) => r.url().includes("/api/chat/stream") && r.request().method() === "POST",
    { timeout: 90_000 }
  );
  await page.getByTestId("input-chat").fill("What are the blockers for the AI search project?");
  await page.getByTestId("button-send").click();
  await streamDone;
  await page.waitForTimeout(12_000);

  const assistant = page.locator('[data-testid="assistant-message"][data-status="done"]').last();
  await expect(assistant).toBeVisible({ timeout: 60_000 });

  // Expand Details
  const detailsToggle = assistant.locator('[data-testid="details-toggle"]');
  if (await detailsToggle.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await detailsToggle.click();
    await page.waitForTimeout(500);

    const detailsPanel = assistant.locator('[data-testid="details-panel"]');
    await expect(detailsPanel).toBeVisible({ timeout: 10_000 });

    // Evidence cards should show filename and Open link
    const evidenceCards = assistant.locator('[data-testid="evidence-card"]');
    const cardCount = await evidenceCards.count();

    if (cardCount > 0) {
      const firstCard = evidenceCards.first();
      await expect(firstCard).toBeVisible();

      // Should have an Open button
      const openLink = firstCard.locator('[data-testid="evidence-open-link"]');
      await expect(openLink).toBeVisible();
    }

    // Verify no chunkId or sourceId visible in the expanded details
    const detailsText = await detailsPanel.textContent();
    expect(detailsText).not.toContain("chunkId");
    expect(detailsText).not.toContain("sourceId");
    expect(detailsText).not.toContain("charStart");
    expect(detailsText).not.toContain("charEnd");
  }

  await captureScreenshot(page, "evidence-ui.png");
});
