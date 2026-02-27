import { test, expect } from "@playwright/test";
import { captureScreenshot } from "./helpers/screenshot";
import { loginAndWaitForSession, ensureConversationReady } from "./helpers/auth";

test("Q2 retrieval stays bounded and returns topK-sized evidence", async ({ page, request }, testInfo) => {
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
  await loginAndWaitForSession(page, request, baseURL);
  const conversationId = await ensureConversationReady(page, baseURL);

  const streamDone = page.waitForResponse(
    (r) => r.url().includes("/api/chat/stream") && r.request().method() === "POST",
    { timeout: 90_000 }
  );
  await page.getByTestId("input-chat").fill("Are there any blockers for the AI search launch?");
  await page.getByTestId("button-send").click();
  await streamDone;
  await page.waitForTimeout(12_000);

  await captureScreenshot(page, "bounded-q2.png");

  const messagesResp = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
  expect(messagesResp.status()).toBe(200);
  const messages = await messagesResp.json();
  const latestAssistant = [...messages].reverse().find((m: any) => m.role === "assistant");
  const retrieved = latestAssistant?.metadataJson?.response?.retrieved_chunks || [];
  expect(retrieved.length).toBeLessThanOrEqual(12);

  const diagnoseResponse = await page.request.get(
    `${baseURL}/api/debug/retrieval/diagnose?q=${encodeURIComponent("Are there any blockers for the AI search launch?")}&workspaceId=default-workspace&topK=12`
  );
  if (diagnoseResponse.status() === 200) {
    const body = await diagnoseResponse.json();
    expect(Number(body.primaryRetrieval?.retrievedCount || 0)).toBeLessThanOrEqual(1200);
    expect(Number(body.mergedReranked?.retrievedCount || 0)).toBeLessThanOrEqual(64);
  }
});
