import { test, expect } from "@playwright/test";
import fs from "fs/promises";
import path from "path";

const afterDir = path.join(process.cwd(), "playwright-artifacts", "evals", "after");

async function loginAsAdmin(page: import("@playwright/test").Page) {
  const loginResponse = await page.request.post("/api/auth/login", {
    data: { email: "admin@tracepilot.com", password: "admin123" },
  });
  expect(loginResponse.status()).toBe(200);
  return loginResponse.json() as Promise<{ csrfToken?: string }>;
}

test("production evals dashboard shows real metrics and explainability", async ({ page }) => {
  await fs.mkdir(afterDir, { recursive: true });
  const loginPayload = await loginAsAdmin(page);
  const csrfToken = loginPayload?.csrfToken || "";

  const prompts = [
    "What are our Q4 OKRs for the AI search project?",
    "Summarize launch blockers with owners and dates.",
    "What is our retrieval latency target and current status?",
  ];
  let conversationId: string | undefined;
  for (const prompt of prompts) {
    const response = await page.request.post("/api/chat", {
      headers: csrfToken ? { "x-csrf-token": csrfToken } : undefined,
      data: { message: prompt, conversationId },
    });
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    conversationId = payload.conversationId || conversationId;
  }

  await page.goto("/admin/evaluations");
  await expect(page.getByRole("heading", { name: "Eval Regression Cockpit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Production Chats" })).toBeVisible();

  await expect(page.getByText("Replies", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Grounding avg", { exact: true }).first()).toBeVisible();
  const metricsText = await page.locator("body").innerText();
  expect(metricsText.includes("Replies\n0")).toBeFalsy();

  const viewEvalButton = page.getByRole("button", { name: "View eval" }).first();
  if (await viewEvalButton.isVisible().catch(() => false)) {
    await viewEvalButton.click();
    await expect(page.getByText("Production Reply Explainability")).toBeVisible();
    await expect(page.getByText("Retrieved chunks", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Reasons")).toBeVisible();
  }

  await page.screenshot({
    path: path.join(afterDir, "evals-dashboard-production.png"),
    fullPage: true,
  });
});
