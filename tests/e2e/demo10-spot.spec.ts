import { test, expect } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";

const SCREENSHOT_DIR = join(process.cwd(), "playwright-artifacts", "demo10");

const DEMO_QUERIES = [
  {
    key: "q2_blockers",
    text: "Are there any blockers for the AI search launch?",
    expectMultiSource: true,
  },
  {
    key: "q4_owner_deadline",
    text: "Who is responsible for fixing the AWS blocker and when is the deadline?",
    expectOwnerDate: true,
  },
  {
    key: "q8_biggest_risk",
    text: "What's the biggest risk to our November 15 launch and what are we doing about it?",
    expectMultiSource: true,
  },
];

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

for (const query of DEMO_QUERIES) {
  test(`demo10 spot check: ${query.key}`, async ({ page, request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string;

    const seedResponse = await request.post(`${baseURL}/api/seed`);
    expect([200, 201]).toContain(seedResponse.status());

    const loginResponse = await page.request.post(`${baseURL}/api/auth/login`, {
      data: { email: "admin@fieldcopilot.com", password: "admin123" },
    });
    expect(loginResponse.status()).toBe(200);

    await page.goto("/chat");
    await expect(page).toHaveURL(/\/chat/);

    const chatStreamPromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/chat/stream") && resp.request().method() === "POST",
    );
    await page.getByTestId("input-chat").fill(query.text);
    await page.getByTestId("button-send").click();

    const chatStreamResponse = await chatStreamPromise;
    expect(chatStreamResponse.status()).toBe(200);

    // Wait for assistant message to appear
    const deadline = Date.now() + 30_000;
    let answerVisible = false;
    while (Date.now() < deadline) {
      const assistantBubbles = page.locator('[data-testid="assistant-message"]');
      if ((await assistantBubbles.count()) > 0) {
        answerVisible = true;
        break;
      }
      await page.waitForTimeout(1000);
    }
    expect(answerVisible, "assistant message should appear").toBeTruthy();

    // Wait for streaming to complete
    await page.waitForTimeout(3000);

    // Check: inline citations [N] are clickable
    const inlineCitations = page.locator('[data-testid="inline-citation-link"]');
    const citationCount = await inlineCitations.count();
    expect(citationCount, "should have inline citation links").toBeGreaterThan(0);

    // Check: Details panel collapsed by default
    const detailsToggle = page.locator('[data-testid="details-toggle"]');
    if (await detailsToggle.count() > 0) {
      const detailsPanel = page.locator('[data-testid="details-panel"]');
      const isPanelVisible = await detailsPanel.isVisible().catch(() => false);
      expect(isPanelVisible, "Details panel should be collapsed by default").toBeFalsy();

      // Expand details
      await detailsToggle.click();
      await page.waitForTimeout(500);

      // Check: Summary table has rows
      const summaryRows = page.locator('[data-testid="summary-row"]');
      const rowCount = await summaryRows.count();
      if (rowCount > 0) {
        // Check: citation chips exist in summary rows
        const chips = page.locator('[data-testid="citation-chip"]');
        const chipCount = await chips.count();
        expect(chipCount, "summary rows should have citation chips").toBeGreaterThan(0);
      }

      // Check: evidence "Open" links exist
      const openLinks = page.locator('[data-testid="source-open-link"]');
      const openCount = await openLinks.count();
      expect(openCount, "should have evidence Open links").toBeGreaterThan(0);
    }

    await page.screenshot({
      path: join(SCREENSHOT_DIR, `${query.key}.png`),
      fullPage: true,
    });
  });
}
