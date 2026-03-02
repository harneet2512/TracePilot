import { test, expect } from "@playwright/test";
import fs from "fs/promises";
import path from "path";

const afterDir = path.join(process.cwd(), "playwright-artifacts", "after");

test("admin evals page shows runs or valid empty state", async ({ page, request }) => {
  await fs.mkdir(afterDir, { recursive: true });

  await request.post("/api/seed");
  const loginResponse = await page.request.post("/api/auth/login", {
    data: { email: "admin@tracepilot.com", password: "admin123" },
  });
  expect(loginResponse.status()).toBe(200);

  await page.request.post("/api/admin/seed-demo-eval");

  await page.goto("/admin/evals");
  await page.waitForTimeout(3000);

  const hasRuns = await page.getByText("Recent Runs").first().isVisible().catch(() => false);
  const hasEmptyState = await page.getByText("No eval runs yet").first().isVisible().catch(() => false);
  expect(hasRuns || hasEmptyState).toBeTruthy();

  await page.screenshot({ path: path.join(afterDir, "admin_evals.png"), fullPage: true });
});
