import { test, expect } from "@playwright/test";
import fs from "fs/promises";
import path from "path";

const afterDir = path.join(process.cwd(), "playwright-artifacts", "evals", "after");

async function loginAsAdmin(page: import("@playwright/test").Page) {
  const loginResponse = await page.request.post("/api/auth/login", {
    data: { email: "admin@fieldcopilot.com", password: "admin123" },
  });
  expect(loginResponse.status()).toBe(200);
}

test("evals cockpit shows selectable runs and explainability", async ({ page }) => {
  await fs.mkdir(afterDir, { recursive: true });
  await loginAsAdmin(page);

  await page.goto("/admin/evals");
  await expect(page.getByRole("heading", { name: "Eval Regression Cockpit" }).first()).toBeVisible();

  if (await page.getByText("No eval runs yet").isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Seed Demo Run" }).first().click();
    await expect(page.getByText("Demo run seeded")).toBeVisible({ timeout: 30_000 });
  }

  const runSelector = page.getByRole("combobox").first();
  await expect(runSelector).toBeVisible();
  await runSelector.click();
  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible();
  if ((await options.count()) > 1) {
    await options.nth(1).click();
  } else {
    await options.first().click();
  }

  await expect(page.getByRole("button", { name: "Run Enterprise Eval Pack" }).first()).toBeVisible();
  await expect(page.getByText("Run Detail", { exact: true }).first()).toBeVisible();
  await expect(page.locator("[data-testid='regressed-cases-section']")).toBeVisible();

  const allText = await page.locator("body").innerText();
  expect(allText.includes("0.0% / 0 tokens / 0 latency")).toBeFalsy();

  const drilldownButton = page.getByRole("button", { name: "Drilldown" }).first();
  if (await drilldownButton.isVisible().catch(() => false)) {
    await drilldownButton.click();
    await expect(page.getByRole("heading", { name: "Case Explainability" })).toBeVisible();
    await expect(page.getByText("Current Explainability Artifacts")).toBeVisible();
    await expect(page.getByText("Retrieval / citations / claims / rationale")).toBeVisible();
  }

  await page.screenshot({
    path: path.join(afterDir, "evals-cockpit.png"),
    fullPage: true,
  });
});
