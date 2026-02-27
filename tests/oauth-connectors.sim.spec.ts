import { test, expect } from "@playwright/test";
import { mkdir } from "fs/promises";

async function loginAsAdmin(page: import("@playwright/test").Page, request: import("@playwright/test").APIRequestContext, baseURL: string) {
  const seedResponse = await request.post(`${baseURL}/api/seed`);
  expect([200, 201]).toContain(seedResponse.status());

  const loginResponse = await page.request.post(`${baseURL}/api/auth/login`, {
    data: { email: "admin@fieldcopilot.com", password: "admin123" },
  });
  expect(loginResponse.status()).toBe(200);
}

test.describe("@manual OAuth simulator connectors", () => {
  test("@manual connects Google, Atlassian, and Slack in simulator mode", async ({ page, request }, testInfo) => {
    const baseURL = String(testInfo.project.use.baseURL || "http://127.0.0.1:5000");
    await mkdir("playwright-artifacts/oauth-sim", { recursive: true });
    await loginAsAdmin(page, request, baseURL);

    const providers = ["google", "atlassian", "slack"] as const;

    for (const provider of providers) {
      await page.goto("/admin/connectors");
      await expect(page).toHaveURL(/\/admin\/connectors/);

      await page.goto(`/api/oauth/${provider}?simulate=true`);
      await expect(page).toHaveURL(/\/admin\/connectors/);

      const card = page.getByTestId(`connector-${provider}`);
      await expect(card.getByText("Connected")).toBeVisible();
      await expect(card.getByText(new RegExp(`sim-${provider}@test\\.fieldcopilot\\.dev`, "i"))).toBeVisible();

      const chunkButton = page.getByTestId(`button-chunk-index-${provider}`);
      await expect(chunkButton).toBeVisible();
      await expect(chunkButton).toBeEnabled();

      await page.screenshot({
        path: `playwright-artifacts/oauth-sim/${provider}-connected.png`,
        fullPage: true,
      });
    }
  });
});
