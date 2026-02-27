import { test, expect } from "@playwright/test";

test("admin chat quality drilldown smoke", async ({ page }) => {
  // This smoke test assumes an authenticated admin session in local dev.
  await page.goto("/admin/chats");
  await expect(page.getByText("Chat Quality")).toBeVisible();

  // Open the first chat row if available.
  const firstChatLink = page.locator("a[href^='/admin/chats/']").first();
  if (await firstChatLink.count()) {
    await firstChatLink.click();
    await expect(page.getByText("Chat Detail")).toBeVisible();

    const replyDetailLink = page.locator("a[href*='/replies/']").first();
    if (await replyDetailLink.count()) {
      await replyDetailLink.click();
      await expect(page.getByText("Reply Detail")).toBeVisible();
      await expect(page.getByText("Retrieval Evidence")).toBeVisible();
      await expect(page.getByText("Claim-based Grounding")).toBeVisible();
    }
  }
});
