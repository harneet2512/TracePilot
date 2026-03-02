import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const ARTIFACT_DIR = path.join(process.cwd(), "playwright-artifacts", "enterprise-after");

test.beforeAll(() => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
});

test("single send produces exactly one user and one assistant message, one chat POST", async ({
  page,
}, testInfo) => {
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

  let postCount = 0;
  await page.route("**/api/chat**", (route) => {
    if (route.request().method() === "POST") {
      postCount++;
    }
    route.continue();
  });

  await page.getByTestId("input-chat").fill("Who is responsible for the AWS blocker?");
  await page.getByTestId("button-send").click();

  await expect(
    page.locator('[data-testid="assistant-message"][data-status="done"]').first()
  ).toBeVisible({ timeout: 90_000 });

  const userBubbles = page.locator('[data-testid="user-message"]');
  const assistantBubbles = page.locator('[data-testid="assistant-message"]');
  const userCount = await userBubbles.count();
  const assistantCount = await assistantBubbles.count();

  expect(userCount, "Exactly one user message").toBe(1);
  expect(assistantCount, "Exactly one assistant message").toBe(1);
  expect(postCount, "Exactly one POST to /api/chat or /api/chat/stream").toBe(1);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "no-duplicate.png") });
});
