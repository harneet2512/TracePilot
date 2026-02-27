import type { APIRequestContext, Page } from "@playwright/test";

export async function loginWithSessionCookies(page: Page, request: APIRequestContext, baseURL: string) {
  const resp = await request.post(`${baseURL}/api/auth/login`, {
    data: { email: "admin@fieldcopilot.com", password: "admin123" },
  });
  if (resp.status() !== 200) {
    throw new Error(`Login failed with status ${resp.status()}`);
  }
  const setCookie = resp.headers()["set-cookie"] || "";
  const session = /session=([^;]+)/.exec(setCookie)?.[1];
  const csrf = /_csrf=([^;]+)/.exec(setCookie)?.[1];
  if (!session || !csrf) {
    throw new Error("Missing auth cookies from login response");
  }
  await page.context().addCookies([
    { name: "session", value: session, url: baseURL, httpOnly: true, sameSite: "Lax" },
    { name: "_csrf", value: csrf, url: baseURL, httpOnly: false, sameSite: "Lax" },
  ]);
}
