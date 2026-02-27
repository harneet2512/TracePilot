import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const ARTIFACT_DIR = path.join(process.cwd(), "playwright-artifacts", "enterprise-after");

test.beforeAll(() => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
});

test("details panel is collapsed by default, expands on toggle click", async ({
  page,
}, testInfo) => {
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");

  const loginResp = await page.request.post(`${baseURL}/api/auth/login`, {
    data: { email: "admin@fieldcopilot.com", password: "admin123" },
  });
  expect(loginResp.status()).toBe(200);
  const loginBody = await loginResp.json();
  const csrf: string = loginBody.csrfToken;

  const convResp = await page.request.post(`${baseURL}/api/conversations`, {
    headers: { "x-csrf-token": csrf, "Content-Type": "application/json" },
  });
  expect(convResp.status()).toBe(200);
  const conv = await convResp.json();

  await page.goto(`/chat/${conv.id}`);
  await expect(page.getByTestId("input-chat")).toBeVisible({ timeout: 15_000 });

  await page.getByTestId("input-chat").fill("Who owns the AWS blocker?");
  await page.getByTestId("button-send").click();

  await expect(
    page.locator('[data-testid="assistant-message"][data-status="done"]').first()
  ).toBeVisible({ timeout: 90_000 });

  const detailsToggle = page.locator('[data-testid="details-toggle"]').first();
  const detailsPanel = page.locator('[data-testid="details-panel"]').first();

  // Details panel should be collapsed by default
  await expect(detailsPanel).not.toBeVisible();

  // Click to expand
  await detailsToggle.click();
  await expect(detailsPanel).toBeVisible({ timeout: 3_000 });

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "details-collapsed.png") });
});
