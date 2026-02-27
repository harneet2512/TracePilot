import { test, expect } from "@playwright/test";
import { mkdirSync } from "fs";
import { loginAndWaitForSession, ensureConversationReady } from "./helpers/auth";

const DIR = "playwright-artifacts/evidence-before";
const QUERIES = [
  { name: "q2", text: "Are there any blockers for the AI search launch?" },
  { name: "q4", text: "Who is responsible for fixing the AWS blocker and when is the deadline?" },
  { name: "q8", text: "What's the biggest risk to our November 15 launch and what are we doing about it?" },
  { name: "q5", text: "What's our 2025 product roadmap?" },
  { name: "hi", text: "Hi" },
];

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  mkdirSync(DIR, { recursive: true });
});

test("capture before-fix evidence screenshots for required queries", async ({ page, request }, testInfo) => {
  test.setTimeout(240_000);
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
  await loginAndWaitForSession(page, request, baseURL);
  await ensureConversationReady(page, baseURL);

  for (const item of QUERIES) {
    const streamDone = page.waitForResponse(
      (r) => r.url().includes("/api/chat/stream") && r.request().method() === "POST",
      { timeout: 90_000 }
    );
    await page.getByTestId("input-chat").fill(item.text);
    await page.getByTestId("button-send").click();
    await streamDone;
    await page.waitForTimeout(12_000);

    const assistant = page.locator('[data-testid="assistant-message"][data-status="done"]').last();
    await expect(assistant).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: `${DIR}/${item.name}.png`, fullPage: true });
  }
});
