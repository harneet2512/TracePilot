import { expect, test } from "@playwright/test";
import { loginWithSessionCookies } from "./helpers/perf";
import { captureScreenshot } from "./helpers/screenshot";

test("deleting chat removes it from UI within 1s", async ({ page, request }, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL || "http://127.0.0.1:5000");
  await loginWithSessionCookies(page, request, baseURL);

  const listResp = await request.get(`${baseURL}/api/conversations`);
  expect(listResp.status()).toBe(200);
  const conversations = (await listResp.json()) as Array<{ id: string }>;
  expect(conversations.length).toBeGreaterThan(1);
  const chatId = conversations[0].id;

  await page.goto(`/chat/${chatId}`);
  await expect(page.getByTestId("input-chat")).toBeVisible({ timeout: 15_000 });

  const row = page.locator('[class*="group flex items-center"]').first();
  await row.hover();
  await row.getByRole("button").click();

  const startedAt = Date.now();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).not.toHaveURL(new RegExp(`/chat/${chatId}`), { timeout: 1000 });
  const elapsed = Date.now() - startedAt;

  await captureScreenshot(page, "perf-delete-after.png");
  expect(elapsed, `Delete should complete within 1s; got ${elapsed}ms`).toBeLessThanOrEqual(1000);
});
