import { test, expect } from "@playwright/test";
import { mkdirSync } from "fs";

const ARTIFACTS_DIR = "playwright-artifacts";

test.beforeAll(() => {
  mkdirSync(`${ARTIFACTS_DIR}/before`, { recursive: true });
  mkdirSync(`${ARTIFACTS_DIR}/after`, { recursive: true });
});

test("admin smoke: chats list, chat detail (no broken reply links), evals page", async ({ page, request }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL as string;

  // Seed admin user
  const seedResponse = await request.post(`${baseURL}/api/seed`);
  expect([200, 201]).toContain(seedResponse.status());

  // Login
  const loginResponse = await page.request.post(`${baseURL}/api/auth/login`, {
    data: { email: "admin@tracepilot.com", password: "admin123" },
  });
  expect(loginResponse.status(), "admin login should succeed").toBe(200);

  // Navigate to admin chats
  await page.goto("/admin/chats");
  await expect(page.getByRole("heading", { name: "Chat Quality" }).first()).toBeVisible({ timeout: 10_000 });

  await page.screenshot({
    path: `${ARTIFACTS_DIR}/after/admin-chats-list.png`,
    fullPage: true,
  });

  // Click first chat if exists
  const chatLinks = page.locator('a[href^="/admin/chats/"]').filter({ hasNotText: "Back" });
  const chatLinkCount = await chatLinks.count();

  if (chatLinkCount > 0) {
    await chatLinks.first().click();
    await page.waitForLoadState("networkidle");

    await page.screenshot({
      path: `${ARTIFACTS_DIR}/after/admin-chat-detail.png`,
      fullPage: true,
    });

    // Verify no broken reply links (links to /admin/chats/:id/replies/ without a replyId)
    const replyLinks = page.locator('a[href*="/replies/"]');
    const replyLinkCount = await replyLinks.count();

    for (let i = 0; i < replyLinkCount; i++) {
      const href = await replyLinks.nth(i).getAttribute("href");
      if (href && href.includes("/replies/")) {
        // Extract the replyId part after /replies/
        const replyIdMatch = href.match(/\/replies\/([^/?#]*)/);
        const replyId = replyIdMatch?.[1] || "";
        // replyId should not be empty
        expect(replyId.length, `Reply link should have valid replyId: ${href}`).toBeGreaterThan(0);
      }
    }
  }

  // Navigate to evals page
  await page.goto("/admin/evals");
  await page.waitForLoadState("networkidle");

  // Evals page should load without errors
  const evalsHeading = page.getByText("Evaluation Dashboard");
  const evalsEmptyState = page.getByText("Evaluation Suites");
  const eitherVisible = await evalsHeading.isVisible().catch(() => false) ||
    await evalsEmptyState.isVisible().catch(() => false);
  expect(eitherVisible, "Evals page should show heading or suites section").toBeTruthy();

  await page.screenshot({
    path: `${ARTIFACTS_DIR}/after/admin-evals.png`,
    fullPage: true,
  });
});
