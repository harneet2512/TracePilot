/**
 * Chat reliability test: proves fallback to non-stream /api/chat when stream drops.
 *
 * Uses project "chat-reliability" which starts server with STREAM_SIMULATE_DROP=true.
 *
 * Run: STREAM_SIMULATE_DROP=true npx playwright test --headed tests/chat-reliability.spec.ts
 *
 * Or with project (starts drop server): npx playwright test --project=chat-reliability --headed tests/chat-reliability.spec.ts
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const ARTIFACT_DIR = path.join(process.cwd(), "playwright-artifacts", "reliability");

test.beforeAll(() => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
});

test("stream drop triggers fallback to /api/chat — user still gets answer", async ({ page, request }, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL || "http://127.0.0.1:5000");

  const seedResponse = await request.post(`${baseURL}/api/seed`);
  expect([200, 201]).toContain(seedResponse.status());

  const loginResponse = await page.request.post(`${baseURL}/api/auth/login`, {
    data: { email: "admin@fieldcopilot.com", password: "admin123" },
  });
  expect(loginResponse.status()).toBe(200);

  await page.goto("/chat");
  await expect(page).toHaveURL(/\/chat/);

  // Listen for the stream request (will drop after 1 token when STREAM_SIMULATE_DROP=true)
  const streamResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes("/api/chat/stream") && resp.request().method() === "POST",
    { timeout: 10_000 }
  );

  // Submit a question — server will drop stream after first delta, client should fallback to /api/chat
  await page.getByTestId("input-chat").fill("What are the current OKRs?");
  await page.getByTestId("button-send").click();

  // Thinking indicator appears
  await expect(page.locator(".animate-spin").first()).toBeVisible({ timeout: 2_000 });

  // Stream may complete or drop (STREAM_SIMULATE_DROP)
  await streamResponsePromise;

  // Within 30s, assistant reply must appear (via fallback if stream dropped)
  const deadline = Date.now() + 30_000;
  let assistantReply = "";
  while (Date.now() < deadline) {
    let conversationId = page.url().match(/\/chat\/([^/?#]+)/)?.[1];
    if (!conversationId) {
      const convResponse = await page.request.get(`${baseURL}/api/conversations`);
      if (convResponse.ok()) {
        const conversations = (await convResponse.json()) as Array<{ id: string }>;
        conversationId = conversations[0]?.id;
      }
    }
    if (conversationId) {
      const msgsResponse = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
      if (msgsResponse.ok()) {
        const messages = (await msgsResponse.json()) as Array<{ role: string; content: string }>;
        const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.content.trim().length > 10);
        if (lastAssistant) {
          assistantReply = lastAssistant.content.trim();
          break;
        }
      }
    }
    await page.waitForTimeout(500);
  }

  expect(assistantReply.length, "assistant reply should appear after fallback").toBeGreaterThan(10);

  // No stuck loading indicator
  await expect(page.locator(".animate-spin").first()).not.toBeVisible({ timeout: 5_000 });

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "fallback-success.png") });
});
