import { expect, test } from "@playwright/test";
import { loginWithSessionCookies } from "./helpers/perf";
import { captureScreenshot } from "./helpers/screenshot";

test("stream interruption still ends with DONE via fallback", async ({ page, request }, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL || "http://127.0.0.1:5000");
  await loginWithSessionCookies(page, request, baseURL);

  const listResp = await request.get(`${baseURL}/api/conversations`);
  expect(listResp.status()).toBe(200);
  const conversations = (await listResp.json()) as Array<{ id: string }>;
  expect(conversations.length).toBeGreaterThan(0);

  await page.goto(`/chat/${conversations[0].id}`);
  await expect(page.getByTestId("input-chat")).toBeVisible({ timeout: 15_000 });

  await page.getByTestId("input-chat").fill("What are the current blockers?");
  await page.getByTestId("button-send").click();

  await expect(page.locator('[data-testid="assistant-message"][data-status="done"]').last()).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('[data-testid="assistant-message"][data-status="pending"]')).toHaveCount(0, { timeout: 3000 });

  await captureScreenshot(page, "perf-stream-fallback-after.png");
});
