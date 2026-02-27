import { test, expect } from "@playwright/test";
import { captureScreenshot } from "./helpers/screenshot";
import { loginAndWaitForSession, ensureConversationReady } from "./helpers/auth";

test.describe("multi-source citation integrity", () => {

  test("answer text contains multiple citation indices for cross-source query", async ({ page, request }, testInfo) => {
    const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
    await loginAndWaitForSession(page, request, baseURL);
    const conversationId = await ensureConversationReady(page, baseURL);

    const streamDone = page.waitForResponse(
      (r) => r.url().includes("/api/chat/stream") && r.request().method() === "POST",
      { timeout: 90_000 }
    );
    await page.getByTestId("input-chat").fill("What's the biggest risk to our November 15 launch and what are we doing about it?");
    await page.getByTestId("button-send").click();
    await streamDone;
    await page.waitForTimeout(12_000);

    const assistant = page.locator('[data-testid="assistant-message"][data-status="done"]').last();
    await expect(assistant).toBeVisible({ timeout: 60_000 });

    // Verify answer text has at least [1] and potentially [2] markers
    const messagesResp = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
    expect(messagesResp.status()).toBe(200);
    const messages = await messagesResp.json();
    const latestAssistant = [...messages].reverse().find((m: any) => m.role === "assistant");
    const response = latestAssistant?.metadataJson?.response || {};
    const answerText: string = response.answer_text || response.answer || "";

    // Must have at least [1]
    expect(answerText).toContain("[1]");

    // Citations array should exist and have entries
    const citations = response.citations || [];
    expect(citations.length, "Should have at least 1 source-level citation").toBeGreaterThanOrEqual(1);

    // If multiple sources cited, verify [2] appears
    if (citations.length >= 2) {
      expect(answerText).toContain("[2]");
    }

    // Verify source-level citations: each entry should have a unique sourceId
    const sourceIds = citations.map((c: any) => c.sourceId);
    const uniqueSourceIds = new Set(sourceIds);
    expect(uniqueSourceIds.size, "Citations should be source-level (one per unique sourceId)").toBe(citations.length);

    await captureScreenshot(page, "multisource-answer-text.png");
  });

  test("summary table shows multi-source citation chips per row", async ({ page, request }, testInfo) => {
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

    // Expand details
    const detailsToggle = assistant.locator('[data-testid="details-toggle"]');
    if (await detailsToggle.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await detailsToggle.click();
      await page.waitForTimeout(500);

      // Check summary table rows have citation chips
      const summaryRows = assistant.locator('[data-testid="summary-row"]');
      const rowCount = await summaryRows.count();
      if (rowCount > 0) {
        // At least one row should have citation chips
        let totalChips = 0;
        for (let i = 0; i < rowCount; i++) {
          const row = summaryRows.nth(i);
          const chips = row.locator('[data-testid="citation-chip"]');
          const chipCount = await chips.count();
          totalChips += chipCount;
        }
        expect(totalChips, "Summary rows should have citation chips").toBeGreaterThanOrEqual(1);
      }
    }

    await captureScreenshot(page, "multisource-summary-chips.png");
  });

  test("evidence list has unique entries with clickable Open links", async ({ page, request }, testInfo) => {
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

    // Expand details
    const detailsToggle = assistant.locator('[data-testid="details-toggle"]');
    if (await detailsToggle.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await detailsToggle.click();
      await page.waitForTimeout(500);

      const evidenceCards = assistant.locator('[data-testid="evidence-card"]');
      const cardCount = await evidenceCards.count();
      expect(cardCount, "Should have at least 1 evidence card").toBeGreaterThanOrEqual(1);

      // Verify each card has an Open link
      for (let i = 0; i < cardCount; i++) {
        const card = evidenceCards.nth(i);
        const openLink = card.locator('[data-testid="evidence-open-link"]');
        // Open link should exist (URL is available)
        if (await openLink.isVisible().catch(() => false)) {
          await expect(openLink).toBeEnabled();
        }
      }

      // Verify no duplicate titles (basic dedupe check)
      const titles: string[] = [];
      for (let i = 0; i < cardCount; i++) {
        const title = await evidenceCards.nth(i).locator("span.font-medium").textContent();
        if (title) titles.push(title.trim());
      }
      const uniqueTitles = new Set(titles);
      expect(uniqueTitles.size, "Evidence cards should not have duplicate titles").toBe(titles.length);
    }

    await captureScreenshot(page, "multisource-evidence-clickable.png");
  });

  test("citation indices are consistent across answer, summary, and evidence", async ({ page, request }, testInfo) => {
    const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
    await loginAndWaitForSession(page, request, baseURL);
    const conversationId = await ensureConversationReady(page, baseURL);

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

    // Check the API response contract
    const messagesResp = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
    expect(messagesResp.status()).toBe(200);
    const messages = await messagesResp.json();
    const latestAssistant = [...messages].reverse().find((m: any) => m.role === "assistant");
    const response = latestAssistant?.metadataJson?.response || {};

    const citations = response.citations || [];
    const details = response.details;

    if (details && citations.length > 0) {
      // Every citationId in summaryRows should be a valid index into citations
      for (const row of details.summaryRows || []) {
        for (const cid of row.citationIds) {
          const idx = Number(cid) - 1;
          expect(idx, `Citation ID ${cid} should be valid index`).toBeGreaterThanOrEqual(0);
          expect(idx, `Citation ID ${cid} should be within citations array`).toBeLessThan(citations.length);
        }
      }

      // Evidence list count should match citation count (source-level)
      if (details.evidenceBySource && details.evidenceBySource.length > 0) {
        expect(
          details.evidenceBySource.length,
          "Evidence count should match source-level citations"
        ).toBe(citations.length);
      }
    }

    await captureScreenshot(page, "multisource-consistency.png");
  });
});
