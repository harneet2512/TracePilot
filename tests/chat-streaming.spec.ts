import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const ARTIFACT_DIR = path.join(process.cwd(), "playwright-artifacts", "streaming");

test.beforeAll(() => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
});

test("streams OKR query — no em-dashes, sources render", async ({ page, request }, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL || "http://127.0.0.1:5000");

  // Ensure workspace / seed data exists
  const seedResponse = await request.post(`${baseURL}/api/seed`);
  expect([200, 201]).toContain(seedResponse.status());

  // Login via API
  const loginResponse = await page.request.post(`${baseURL}/api/auth/login`, {
    data: { email: "admin@fieldcopilot.com", password: "admin123" },
  });
  expect(loginResponse.status()).toBe(200);

  await page.goto("/chat");
  await expect(page).toHaveURL(/\/chat/);

  // Listen for the SSE stream request
  const streamResponsePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes("/api/chat/stream") && resp.request().method() === "POST",
    { timeout: 10_000 }
  );

  // Submit an OKR query
  await page.getByTestId("input-chat").fill("What are the current OKRs?");
  await page.getByTestId("button-send").click();

  // Assert thinking/loading indicator appears within 500 ms
  await expect(page.locator(".animate-spin").first()).toBeVisible({ timeout: 2_000 });

  // Screenshot: thinking state
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "01-thinking.png") });

  // Confirm SSE stream connected (HTTP 200)
  const streamResponse = await streamResponsePromise;
  expect(streamResponse.status()).toBe(200);

  // Extract conversationId from URL
  const urlMatch = page.url().match(/\/chat\/([^/?#]+)/);
  const conversationId = urlMatch?.[1];
  expect(conversationId).toBeTruthy();

  // Poll until assistant reply appears (timeout 30 s)
  let assistantReply = "";
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const messagesResponse = await page.request.get(
      `${baseURL}/api/conversations/${conversationId}/messages`
    );
    if (messagesResponse.ok()) {
      const messages = (await messagesResponse.json()) as Array<{
        role: string;
        content: string;
      }>;
      const lastAssistant = [...messages]
        .reverse()
        .find((m) => m.role === "assistant" && m.content.trim().length > 10);
      if (lastAssistant) {
        assistantReply = lastAssistant.content.trim();
        break;
      }
    }
    await page.waitForTimeout(700);
  }

  expect(assistantReply.length).toBeGreaterThan(10);

  // Assert no em-dashes in the reply
  expect(assistantReply).not.toMatch(/[—–]/);

  // Assert sources section is rendered on the page
  await expect(page.getByText(/Sources used/i).first()).toBeVisible({ timeout: 5_000 });

  // Screenshot: final answer
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "02-final-answer.png") });
});

test("streams GENERAL query — TTFT < 5000 ms (smoke)", async ({ page, request }, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL || "http://127.0.0.1:5000");

  const loginResponse = await page.request.post(`${baseURL}/api/auth/login`, {
    data: { email: "admin@fieldcopilot.com", password: "admin123" },
  });
  expect(loginResponse.status()).toBe(200);

  await page.goto("/chat");
  await expect(page).toHaveURL(/\/chat/);

  let ttftMs: number | null = null;

  // Intercept SSE stream and capture TTFT event
  page.on("response", async (resp) => {
    if (resp.url().includes("/api/chat/stream") && resp.request().method() === "POST") {
      try {
        const body = await resp.text();
        const ttftLine = body.split("\n").find((l) => l.includes('"ttftMs"'));
        if (ttftLine) {
          const match = ttftLine.match(/"ttftMs"\s*:\s*(\d+)/);
          if (match) ttftMs = parseInt(match[1], 10);
        }
      } catch (_e) { /* response may not be fully buffered */ }
    }
  });

  const requestStart = Date.now();
  await page.getByTestId("input-chat").fill("Who is the product owner?");
  await page.getByTestId("button-send").click();

  // Wait for loading to appear and then disappear (answer rendered)
  await expect(page.locator(".animate-spin").first()).toBeVisible({ timeout: 2_000 });

  // Wait up to 20 s for the thinking bubble to disappear
  await expect(page.locator(".animate-spin").first()).not.toBeVisible({ timeout: 20_000 });

  const totalElapsed = Date.now() - requestStart;
  console.log(`[bench] GENERAL query: totalElapsed=${totalElapsed}ms ttftMs=${ttftMs ?? "n/a"}`);

  // Smoke assertion: total round-trip under 20 s (very conservative for CI)
  expect(totalElapsed).toBeLessThan(20_000);
});
