import { test, expect } from "@playwright/test";
import fs from "fs/promises";
import path from "path";

const afterDir = path.join(process.cwd(), "playwright-artifacts", "after");

test("admin chat quality shows metrics or empty state guidance", async ({ page, request }) => {
  await fs.mkdir(afterDir, { recursive: true });

  await request.post("/api/seed");
  const loginResponse = await page.request.post("/api/auth/login", {
    data: { email: "admin@tracepilot.com", password: "admin123" },
  });
  expect(loginResponse.status()).toBe(200);

  await page.goto("/admin/chats");
  await page.waitForTimeout(2500);

  const headingVisible = await page.getByRole("heading", { name: "Chat Quality" }).first().isVisible().catch(() => false);
  expect(headingVisible).toBeTruthy();

  const hasMetrics = await page.getByText("P95 Latency").first().isVisible().catch(() => false);
  const hasEmptyState = await page.getByText("No quality data yet").first().isVisible().catch(() => false);
  expect(hasMetrics || hasEmptyState).toBeTruthy();

  await page.screenshot({ path: path.join(afterDir, "admin_chat_quality.png"), fullPage: true });
});
