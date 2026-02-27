import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs/promises";

const beforeDir = path.join(process.cwd(), "playwright-artifacts", "before");

async function ensureBeforeDir() {
  await fs.mkdir(beforeDir, { recursive: true });
}

test("capture before screenshots for chat/admin issues", async ({ page, request }) => {
  await ensureBeforeDir();

  const seedResponse = await request.post("/api/seed");
  expect([200, 201]).toContain(seedResponse.status());

  const loginResponse = await page.request.post("/api/auth/login", {
    data: { email: "admin@fieldcopilot.com", password: "admin123" },
  });
  expect(loginResponse.status()).toBe(200);

  await page.goto("/chat");
  await expect(page).toHaveURL(/\/chat/);

  await page.getByTestId("input-chat").fill("What are our Q4 OKRs for the AI search project?");
  await page.getByTestId("button-send").click();

  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(beforeDir, "chat_okrs.png"), fullPage: true });

  await page.goto("/admin/evals");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(beforeDir, "admin_evals.png"), fullPage: true });

  await page.goto("/admin/chats");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(beforeDir, "admin_chat_quality.png"), fullPage: true });

  const firstChatLink = page.locator('a[href^="/admin/chats/"]').first();
  await expect(firstChatLink).toBeVisible({ timeout: 15000 });
  await firstChatLink.click();
  await expect(page).toHaveURL(/\/admin\/chats\/[^/]+$/);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(beforeDir, "reply_evals.png"), fullPage: true });
});
