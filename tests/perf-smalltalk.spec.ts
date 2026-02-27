import { expect, test } from "@playwright/test";
import { loginWithSessionCookies } from "./helpers/perf";
import { captureScreenshot } from "./helpers/screenshot";

test("smalltalk hi renders assistant message within 1s", async ({ page, request }, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL || "http://127.0.0.1:5000");
  await loginWithSessionCookies(page, request, baseURL);

  const listResp = await request.get(`${baseURL}/api/conversations`);
  expect(listResp.status()).toBe(200);
  const conversations = (await listResp.json()) as Array<{ id: string }>;
  expect(conversations.length).toBeGreaterThan(0);

  await page.goto(`/chat/${conversations[0].id}`);
  await expect(page.getByTestId("input-chat")).toBeVisible({ timeout: 15_000 });

  const startedAt = Date.now();
  await page.getByTestId("input-chat").fill("Hi");
  await page.getByTestId("button-send").click();
  await expect(page.locator('[data-testid="assistant-message"][data-status="done"]').last()).toBeVisible({ timeout: 10_000 });
  const elapsed = Date.now() - startedAt;

  await captureScreenshot(page, "perf-smalltalk-after.png");
  expect(elapsed, `Smalltalk should complete within 1s, got ${elapsed}ms`).toBeLessThanOrEqual(1000);
});
