import { test, expect } from "@playwright/test";
import { mkdirSync } from "fs";
import { loginAndWaitForSession, ensureConversationReady } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

const DIR = "playwright-artifacts/enterprise-style";

const QUERIES = [
  "What are our Q4 OKRs for the AI search project?",
  "Are there any blockers for the AI search launch?",
  "What vector database are we using and why?",
  "What's the biggest risk to our November 15 launch and what are we doing about it?",
];

function fileSafe(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
}

test.beforeAll(() => {
  mkdirSync(DIR, { recursive: true });
});

test("enterprise answer style is enforced for all key query types", async ({ page, request }, testInfo) => {
  test.setTimeout(300_000);
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
  await loginAndWaitForSession(page, request, baseURL);
  const conversationId = await ensureConversationReady(page, baseURL);

  for (const query of QUERIES) {
    const beforeMessagesResp = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
    expect(beforeMessagesResp.status()).toBe(200);
    const beforeMessages = await beforeMessagesResp.json();
    const beforeAssistantCount = beforeMessages.filter((m: any) => m.role === "assistant").length;

    const streamDone = page.waitForResponse(
      (r) => r.url().includes("/api/chat/stream") && r.request().method() === "POST",
      { timeout: 60_000 }
    );
    await page.getByTestId("input-chat").fill(query);
    await page.getByTestId("button-send").click();
    await streamDone;

    const assistantMsg = page.locator('[data-testid="assistant-message"][data-status="done"]').last();
    await expect(assistantMsg).toBeVisible({ timeout: 60_000 });
    await expect(assistantMsg).toBeVisible();

    const contentEl = assistantMsg.getByTestId("assistant-message-content");
    const liCount = await contentEl.locator("li").count();
    expect(liCount).toBeGreaterThanOrEqual(2);

    // Get text from the answer content only (first child div), not the Details collapsible
    const textDiv = contentEl.locator("> div").first();
    const text = (await textDiv.textContent()) || "";
    expect(text.length).toBeGreaterThan(20);

    const firstLine = text.split(/\r?\n/).find((line: string) => line.trim().length > 0) || "";
    expect(/^(#{1,6}|key facts|blockers\s*&\s*risks|summary:)/i.test(firstLine)).toBe(false);

    const beforeBullets = text.split(/\n-/)[0] || "";
    const sentenceCount = (beforeBullets.match(/[.!?](\s|$)/g) || []).length;
    expect(sentenceCount).toBeGreaterThanOrEqual(1);

    expect(text).not.toMatch(/KEY FACTS|Blockers & Risks|###/i);
    expect(text).not.toMatch(/^\s*\|.*\|\s*$/m);
    expect(text.trim().endsWith("?")).toBe(true);

    await page.screenshot({
      path: `${DIR}/${fileSafe(query)}.png`,
      fullPage: true,
    });
  }
});
