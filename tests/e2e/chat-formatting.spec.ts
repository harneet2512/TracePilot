import { test, expect } from "@playwright/test";
import fs from "fs/promises";
import path from "path";

const afterDir = path.join(process.cwd(), "playwright-artifacts", "after");

test("chat formatting is clean and stable", async ({ page, request }) => {
  await fs.mkdir(afterDir, { recursive: true });

  await request.post("/api/seed");
  const loginResponse = await page.request.post("/api/auth/login", {
    data: { email: "admin@tracepilot.com", password: "admin123" },
  });
  expect(loginResponse.status()).toBe(200);

  await page.goto("/chat");
  await page.getByTestId("input-chat").fill("What are our Q4 OKRs for the AI search project?");
  await page.getByTestId("button-send").click();
  await page.waitForTimeout(6000);

  const conversationId = page.url().match(/\/chat\/([^/?#]+)/)?.[1];
  expect(conversationId).toBeTruthy();

  // Ensure one non-streamed response is persisted in this conversation.
  await page.request.post("/api/chat", {
    data: {
      message: "What are our Q4 OKRs for the AI search project?",
      conversationId,
      conversationHistory: [],
    },
  });

  const messagesResponse = await page.request.get(`/api/conversations/${conversationId!}/messages`);
  expect(messagesResponse.ok()).toBeTruthy();
  const messages = (await messagesResponse.json()) as Array<{ role: string; content: string }>;
  const assistant = [...messages].reverse().find((m) => m.role === "assistant" && m.content.trim().length > 0);
  const answer = assistant?.content ?? "";

  expect(answer.includes("—")).toBeFalsy();
  expect(answer.includes("**")).toBeFalsy();
  expect(answer.includes("•")).toBeFalsy();

  const hasBullets = /(?:^|\n)-\s+/.test(answer);
  if (hasBullets) {
    expect(answer).toMatch(/\n\n-\s+/);
  }

  await page.screenshot({ path: path.join(afterDir, "chat_okrs.png"), fullPage: true });
});
