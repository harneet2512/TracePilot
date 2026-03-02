import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const ARTIFACT_DIR = path.join(process.cwd(), "playwright-artifacts", "enterprise-after");

test.beforeAll(() => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
});

test("debug panel is not visible and answer has no raw JSON", async ({ page }, testInfo) => {
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");

  const loginResp = await page.request.post(`${baseURL}/api/auth/login`, {
    data: { email: "admin@tracepilot.com", password: "admin123" },
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

  await page.getByTestId("input-chat").fill("What are the current OKRs?");
  await page.getByTestId("button-send").click();

  await expect(
    page.locator('[data-testid="assistant-message"][data-status="done"]').first()
  ).toBeVisible({ timeout: 90_000 });

  const debugPanel = page.locator('[data-testid="debug-panel"]');
  await expect(debugPanel).not.toBeVisible();

  const answerContent = page.locator('[data-testid="assistant-message-content"]').first();
  await expect(answerContent).toBeVisible();
  const text = await answerContent.textContent();
  expect(text).not.toMatch(/\{\"/);
  expect(text).not.toMatch(/structured_report/);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "no-debug.png") });
});
