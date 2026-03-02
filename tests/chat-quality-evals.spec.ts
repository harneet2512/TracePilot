import { test, expect } from "@playwright/test";
import fs from "fs/promises";
import path from "path";

const afterDir = path.join(process.cwd(), "playwright-artifacts", "evals", "after");

async function loginAsAdmin(page: import("@playwright/test").Page) {
  const loginResponse = await page.request.post("/api/auth/login", {
    data: { email: "admin@tracepilot.com", password: "admin123" },
  });
  expect(loginResponse.status()).toBe(200);
}

test("chat quality and chat detail show eval signals", async ({ page }) => {
  await fs.mkdir(afterDir, { recursive: true });
  await loginAsAdmin(page);

  await page.goto("/admin/chats");
  await expect(page.getByRole("heading", { name: "Chat Quality" }).first()).toBeVisible();

  const hasEmptyState = await page.getByText("No quality data yet").isVisible().catch(() => false);
  if (hasEmptyState) {
    const seedButton = page.getByRole("button", { name: "Seed Demo Data" });
    await expect(seedButton).toBeVisible();
    await seedButton.click();
    await expect(page.getByText("Demo data seeded")).toBeVisible({ timeout: 30_000 });
  } else {
    await expect(page.getByText("Recent Chats")).toBeVisible();
  }

  const rows = page.locator("table tbody tr");
  await expect(rows.first()).toBeVisible({ timeout: 20_000 });
  const rowCount = await rows.count();
  let clicked = false;
  for (let i = 0; i < rowCount; i += 1) {
    const row = rows.nth(i);
    const repliesText = (await row.locator("td").nth(3).innerText()).trim();
    if (Number(repliesText) > 0) {
      await row.locator("a[href^='/admin/chats/']").first().click();
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    await rows.first().locator("a[href^='/admin/chats/']").first().click();
  }

  await expect(page.getByRole("heading", { name: "Chat Detail" }).first()).toBeVisible();
  const hasBadges = await page.getByText("hallucination risk").first().isVisible().catch(() => false)
    || await page.getByText("citation mismatch").first().isVisible().catch(() => false)
    || await page.getByText("low-evidence check").first().isVisible().catch(() => false);
  expect(hasBadges).toBeTruthy();

  const evalDrawerButton = page.getByRole("button", { name: "View eval details" }).first();
  if (await evalDrawerButton.isVisible().catch(() => false)) {
    await evalDrawerButton.click();
    await expect(page.getByText("Reply Eval Explainability")).toBeVisible();
    await expect(page.getByText("Retrieved chunks", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Reasons")).toBeVisible();
  }

  const replyDetailLink = page.getByRole("link", { name: "View Reply Details" }).first();
  if (await replyDetailLink.isVisible().catch(() => false)) {
    await replyDetailLink.click();
    await expect(page.getByRole("heading", { name: "Reply Detail" }).first()).toBeVisible();
    const hasEnterpriseCard = await page.getByText("8) Enterprise Eval Pack").isVisible().catch(() => false);
    const hasEnterpriseEmpty = await page.getByText("No enterprise eval artifact yet.").isVisible().catch(() => false);
    expect(hasEnterpriseCard || hasEnterpriseEmpty).toBeTruthy();
  } else {
    await expect(page.getByText("Conversation Timeline")).toBeVisible();
  }

  await page.screenshot({
    path: path.join(afterDir, "chat-quality-and-detail.png"),
    fullPage: true,
  });
});
