import type { Page, APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * API-first login: returns a CSRF token for subsequent mutating requests.
 * Uses the Playwright APIRequestContext which automatically manages cookies.
 */
export async function loginAndGetCsrf(
  request: APIRequestContext,
  baseURL: string,
): Promise<string> {
  const loginResp = await request.post(`${baseURL}/api/auth/login`, {
    data: { email: "admin@fieldcopilot.com", password: "admin123" },
  });
  expect(loginResp.status()).toBe(200);
  const loginBody = await loginResp.json();
  const csrf: string = loginBody.csrfToken;
  expect(csrf, "Login response must include csrfToken").toBeTruthy();
  return csrf;
}

/**
 * Browser-based login + session setup (for UI tests).
 */
export async function loginAndWaitForSession(
  page: Page,
  request: APIRequestContext,
  baseURL: string,
): Promise<void> {
  try {
    const seedResp = await Promise.race([
      request.post(`${baseURL}/api/seed`),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("seed timeout")), 8_000)
      ),
    ]);
    expect([200, 201]).toContain(seedResp.status());
  } catch {
    // Seed may hang if DB pool is exhausted; proceed with login.
  }

  const loginResp = await page.request.post(`${baseURL}/api/auth/login`, {
    data: { email: "admin@fieldcopilot.com", password: "admin123" },
  });
  expect(loginResp.status()).toBe(200);

  const healthResp = await page.request.get(`${baseURL}/api/health`);
  expect(healthResp.status()).toBe(200);
}

export async function ensureConversationReady(
  page: Page,
  baseURL: string,
): Promise<string> {
  await page.goto("/chat");
  await expect(page.getByTestId("input-chat")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "New Chat" }).first().click();
  await expect(page.getByTestId("input-chat")).toBeVisible({ timeout: 10_000 });
  await page.waitForURL(/\/chat\/[^/]+/, { timeout: 15_000 });
  const convId = page.url().match(/\/chat\/([^/?#]+)/)?.[1];
  expect(convId).toBeTruthy();
  return convId!;
}
