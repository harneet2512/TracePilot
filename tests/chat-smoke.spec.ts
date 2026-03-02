import { test, expect } from "@playwright/test";

test("chat smoke keeps OpenAI response path working", async ({ page, request }, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL || "http://127.0.0.1:5000");

  const seedResponse = await request.post(`${baseURL}/api/seed`);
  expect([200, 201]).toContain(seedResponse.status());

  const loginResponse = await page.request.post(`${baseURL}/api/auth/login`, {
    data: { email: "admin@tracepilot.com", password: "admin123" },
  });
  expect(loginResponse.status()).toBe(200);

  await page.goto("/chat");
  await expect(page).toHaveURL(/\/chat/);

  const streamResponsePromise = page.waitForResponse((resp) =>
    resp.url().includes("/api/chat/stream") && resp.request().method() === "POST",
  );

  await page.getByTestId("input-chat").fill("Say hello in one sentence.");
  await page.getByTestId("button-send").click();

  const streamResponse = await streamResponsePromise;
  expect(streamResponse.status()).toBe(200);

  const urlMatch = page.url().match(/\/chat\/([^/?#]+)/);
  const conversationId = urlMatch?.[1];
  expect(conversationId).toBeTruthy();

  let assistantReply = "";
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const messagesResponse = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
    if (messagesResponse.ok()) {
      const messages = (await messagesResponse.json()) as Array<{ role: string; content: string }>;
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.content.trim().length > 0);
      if (lastAssistant) {
        assistantReply = lastAssistant.content.trim();
        break;
      }
    }
    await page.waitForTimeout(700);
  }

  expect(assistantReply.length).toBeGreaterThan(0);
  await expect(page.getByText(assistantReply.slice(0, Math.min(assistantReply.length, 24)), { exact: false }).first()).toBeVisible();
});
