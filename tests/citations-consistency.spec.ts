import { test, expect } from "@playwright/test";
import { captureScreenshot } from "./helpers/screenshot";
import { ensureConversationReady, loginAndWaitForSession } from "./helpers/auth";

test("Q2 citation chips map to evidence and are clickable", async ({ page, request }, testInfo) => {
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
  await loginAndWaitForSession(page, request, baseURL);
  await ensureConversationReady(page, baseURL);

  const streamDone = page.waitForResponse(
    (r) => r.url().includes("/api/chat/stream") && r.request().method() === "POST",
    { timeout: 120_000 },
  );
  await page.getByTestId("input-chat").fill("Are there any blockers for the AI search launch?");
  await page.getByTestId("button-send").click();
  await streamDone;
  await page.waitForTimeout(12_000);

  const assistant = page.locator('[data-testid="assistant-message"]').last();
  await expect(assistant).toBeVisible({ timeout: 60_000 });

  const detailsToggle = assistant.locator('[data-testid="details-toggle"]');
  if (await detailsToggle.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await detailsToggle.click();
    await page.waitForTimeout(700);
  }

  const evidenceCards = assistant.locator('[data-testid="evidence-card"]');
  const evidenceCount = await evidenceCards.count();
  expect(evidenceCount, "Evidence list should contain at least one source").toBeGreaterThan(0);

  const evidenceTitles: string[] = [];
  for (let i = 0; i < evidenceCount; i++) {
    const title = (await evidenceCards.nth(i).locator("span.font-medium").first().textContent())?.trim();
    if (title) evidenceTitles.push(title);
  }
  expect(new Set(evidenceTitles).size, "Evidence items should be unique").toBe(evidenceTitles.length);

  const chips = assistant.locator('[data-testid="summary-row"] [data-testid="citation-chip"]');
  const chipCount = await chips.count();
  expect(chipCount, "Summary should expose citation chips").toBeGreaterThan(0);

  for (let i = 0; i < chipCount; i++) {
    const text = (await chips.nth(i).textContent()) || "";
    const idx = Number((text.match(/\[(\d+)\]/)?.[1] || ""));
    expect(Number.isFinite(idx), `Chip text should include numeric index: ${text}`).toBe(true);
    expect(idx).toBeGreaterThanOrEqual(1);
    expect(idx).toBeLessThanOrEqual(evidenceCount);
  }

  const firstChip = chips.first();
  const href = await firstChip.getAttribute("href");
  expect(
    href && (href.startsWith("http") || href.includes("/api/sources/")),
    `Citation chip href should resolve to source URL, got: ${href}`,
  ).toBeTruthy();
  const popupPromise = page.waitForEvent("popup", { timeout: 10_000 }).catch(() => null);
  await firstChip.click();
  const popup = await popupPromise;
  if (popup) await popup.close();

  await captureScreenshot(page, "citations-consistency-q2.png");
});
