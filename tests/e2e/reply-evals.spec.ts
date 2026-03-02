import { test, expect } from "@playwright/test";
import fs from "fs/promises";
import path from "path";

const afterDir = path.join(process.cwd(), "playwright-artifacts", "after");

test("reply cards expose eval visibility and CTA", async ({ page, request }) => {
  await fs.mkdir(afterDir, { recursive: true });

  await request.post("/api/seed");
  const loginResponse = await page.request.post("/api/auth/login", {
    data: { email: "admin@tracepilot.com", password: "admin123" },
  });
  expect(loginResponse.status()).toBe(200);

  await page.goto("/chat");
  await page.getByTestId("input-chat").fill("Hi");
  await page.getByTestId("button-send").click();
  await page.waitForTimeout(4000);

  const conversationId = page.url().match(/\/chat\/([^/?#]+)/)?.[1];
  expect(conversationId).toBeTruthy();

  // Ensure one non-streamed reply gets artifact capture.
  await page.request.post("/api/chat", {
    data: { message: "Hi", conversationId, conversationHistory: [] },
  });

  // Poll until chat detail exposes at least one reply artifact.
  const deadline = Date.now() + 15000;
  let hasReply = false;
  while (Date.now() < deadline) {
    const detail = await page.request.get(`/api/admin/chats/${conversationId}`);
    if (detail.ok()) {
      const payload = (await detail.json()) as { replies?: unknown[] };
      if ((payload.replies?.length ?? 0) > 0) {
        hasReply = true;
        break;
      }
    }
    await page.waitForTimeout(1000);
  }
  expect(hasReply).toBeTruthy();

  await page.goto(`/admin/chats/${conversationId}`);
  await page.waitForTimeout(2500);

  const hasEvalsSection = await page.getByText("Evals").first().isVisible().catch(() => false);
  const hasEmptyState = await page.getByText("No evals for this reply yet.").first().isVisible().catch(() => false);
  const hasRunButton = await page.getByRole("button", { name: "Run eval on this reply" }).first().isVisible().catch(() => false);
  expect(hasEvalsSection || (hasEmptyState && hasRunButton)).toBeTruthy();

  await page.screenshot({ path: path.join(afterDir, "reply_evals.png"), fullPage: true });
});
