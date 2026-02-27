import { expect, test } from "@playwright/test";
import { loginWithSessionCookies } from "./helpers/perf";
import { captureScreenshot } from "./helpers/screenshot";

test("switching tabs rapidly does not freeze UI", async ({ page, request }, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL || "http://127.0.0.1:5000");
  await loginWithSessionCookies(page, request, baseURL);

  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/admin/observability");
  await expect(page.getByRole("tab", { name: "Chat" })).toBeVisible({ timeout: 20_000 });

  const tabs = ["Chat", "Retrieval", "Citations", "Sync"];
  const startedAt = Date.now();
  for (let i = 0; i < 10; i++) {
    await page.getByRole("tab", { name: tabs[i % tabs.length] }).click();
  }
  const elapsed = Date.now() - startedAt;

  await captureScreenshot(page, "perf-tabs-after.png");
  expect(pageErrors).toEqual([]);
  expect(elapsed, `10 tab switches should stay responsive; got ${elapsed}ms`).toBeLessThan(5000);
});
