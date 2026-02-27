import { test, expect } from "@playwright/test";

test("eval regression cockpit smoke", async ({ page }) => {
  // Assumes authenticated admin session in local dev.
  await page.goto("/admin/evals");
  await expect(page.getByText("Eval Regression Cockpit")).toBeVisible();
  await expect(page.getByText("Release Gate Summary")).toBeVisible();
  await expect(page.getByText("Regressed Cases")).toBeVisible();
  await expect(page.getByText("Trends")).toBeVisible();

  const firstDrilldown = page.locator("a[href*='/admin/evals/runs/'][href*='/cases/']").first();
  if (await firstDrilldown.count()) {
    await firstDrilldown.click();
    await expect(page.getByText("Case Explainability")).toBeVisible();
    await expect(page.getByText("Why Regressed")).toBeVisible();
    await expect(page.getByText("Metric Breakdown")).toBeVisible();
  }
});
