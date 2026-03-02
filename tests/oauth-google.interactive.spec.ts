import { test, expect } from "@playwright/test";
import { mkdir } from "fs/promises";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";

async function waitForEnter(message: string): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    await rl.question(`${message}\n`);
  } finally {
    rl.close();
  }
}

test("@manual interactive real Google OAuth verification", async ({ page, request }, testInfo) => {
  test.skip(Boolean(testInfo.project.use.headless), "Run this test in headed mode only.");

  const baseURL = String(testInfo.project.use.baseURL || "http://127.0.0.1:5000");
  await mkdir("playwright-artifacts/oauth-real", { recursive: true });

  const seedResponse = await request.post(`${baseURL}/api/seed`);
  expect([200, 201]).toContain(seedResponse.status());

  const loginResponse = await page.request.post(`${baseURL}/api/auth/login`, {
    data: { email: "admin@tracepilot.com", password: "admin123" },
  });
  expect(loginResponse.status()).toBe(200);

  await page.goto("/admin/connectors");
  await expect(page).toHaveURL(/\/admin\/connectors/);

  const disconnectGoogle = page.getByTestId("button-disconnect-google");
  if (await disconnectGoogle.count()) {
    await disconnectGoogle.click();
    await expect(page.getByTestId("button-connect-google")).toBeVisible();
  }

  await page.getByTestId("button-connect-google").click();
  await page.waitForURL(/accounts\.google\.com|oauth2|consent/i, { timeout: 30_000 });

  await waitForEnter(
    "PAUSED: Google login or consent detected. Please complete login and consent in the open browser window. Then return to terminal and press Enter to continue.",
  );

  await expect(page).toHaveURL(/\/admin\/connectors/, { timeout: 180_000 });

  const card = page.getByTestId("connector-google");
  await expect(card.getByText("Connected")).toBeVisible();
  await expect(card.locator("p.text-xs.text-muted-foreground").first()).toContainText(/@|\S+/);
  await expect(page.getByTestId("button-chunk-index-google")).toBeEnabled();

  await page.screenshot({
    path: "playwright-artifacts/oauth-real/google-connected.png",
    fullPage: true,
  });
});
