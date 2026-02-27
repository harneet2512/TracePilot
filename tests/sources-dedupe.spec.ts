import { test, expect } from "@playwright/test";
import { mkdirSync } from "fs";
import { loginAndWaitForSession, ensureConversationReady } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

const DIR = "playwright-artifacts/sources";

test.beforeAll(() => {
  mkdirSync(DIR, { recursive: true });
});

test("sources_used are unique by sourceId and titles are not duplicated", async ({ page, request }, testInfo) => {
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
  await loginAndWaitForSession(page, request, baseURL);
  const conversationId = await ensureConversationReady(page, baseURL);

  const beforeMessagesResp = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
  expect(beforeMessagesResp.status()).toBe(200);
  const beforeMessages = await beforeMessagesResp.json();
  const beforeAssistantCount = beforeMessages.filter((m: any) => m.role === "assistant").length;

  const streamDone = page.waitForResponse(
    (r) => r.url().includes("/api/chat/stream") && r.request().method() === "POST",
    { timeout: 45_000 }
  );
  await page.getByTestId("input-chat").fill("Are there any blockers for the AI search launch?");
  await page.getByTestId("button-send").click();
  await streamDone;
  await expect
    .poll(async () => {
      const convsResp = await page.request.get(`${baseURL}/api/conversations`);
      if (convsResp.status() !== 200) return 0;
      const messagesResp = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
      if (messagesResp.status() !== 200) return 0;
      const messages = await messagesResp.json();
      return messages.filter((m: any) => m.role === "assistant" && m.metadataJson?.response).length;
    }, { timeout: 90_000 })
    .toBeGreaterThan(beforeAssistantCount);

  const messagesResp = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
  expect(messagesResp.status()).toBe(200);
  const messages = await messagesResp.json();
  const assistant = [...messages].reverse().find((m: any) => m.role === "assistant" && m.metadataJson?.response);
  expect(assistant).toBeTruthy();

  const sourcesUsed = assistant?.metadataJson?.response?.sources_used || assistant?.metadataJson?.response?.sources || [];
  expect(sourcesUsed.length).toBeGreaterThanOrEqual(0);

  const sourceIds = sourcesUsed.map((s: any) => s.sourceId || s.id).filter(Boolean);
  const uniqueSourceIds = new Set(sourceIds);
  expect(uniqueSourceIds.size).toBe(sourceIds.length);

  const titles = sourcesUsed.map((s: any) => String(s.title || "").trim().toLowerCase()).filter(Boolean);
  const uniqueTitles = new Set(titles);
  expect(uniqueTitles.size).toBe(titles.length);

  const detailsToggle = page.getByTestId("details-toggle").last();
  await detailsToggle.click();
  if (sourcesUsed.length > 0) {
    await expect(page.getByTestId("details-sources")).toBeVisible();
  } else {
    await expect(page.getByTestId("details-panel").last()).toBeVisible();
  }

  await page.screenshot({ path: `${DIR}/sources-dedupe.png`, fullPage: true });
});
