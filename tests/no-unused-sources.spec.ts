import { test, expect } from "@playwright/test";
import { captureScreenshot } from "./helpers/screenshot";
import { ensureConversationReady, loginAndWaitForSession } from "./helpers/auth";

test("Evidence list contains only sources referenced by citations (Q8)", async ({ page, request }, testInfo) => {
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
  await loginAndWaitForSession(page, request, baseURL);
  const conversationId = await ensureConversationReady(page, baseURL);

  const streamDone = page.waitForResponse(
    (r) => r.url().includes("/api/chat/stream") && r.request().method() === "POST",
    { timeout: 120_000 },
  );
  await page.getByTestId("input-chat").fill("What’s the biggest risk to our November 15 launch and what are we doing about it?");
  await page.getByTestId("button-send").click();
  await streamDone;
  await page.waitForTimeout(12_000);

  const messagesResp = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
  expect(messagesResp.status()).toBe(200);
  const messages = await messagesResp.json();
  const latestAssistant = [...messages].reverse().find((m: any) => m.role === "assistant");
  const response = latestAssistant?.metadataJson?.response || {};

  const citations: any[] = response.citations || [];
  const details = response.details || {};
  const evidenceBySource: any[] = details.evidenceBySource || [];

  const citedSourceIds = new Set(citations.map((c) => c.sourceId).filter(Boolean));
  for (const ev of evidenceBySource) {
    expect(
      citedSourceIds.has(ev.sourceKey),
      `Evidence source ${ev.sourceKey} must be present in citations[]`,
    ).toBe(true);
  }

  const evidenceKeys = evidenceBySource.map((e) => e.sourceKey).filter(Boolean);
  expect(new Set(evidenceKeys).size, "Evidence source list should be deduped").toBe(evidenceKeys.length);

  await captureScreenshot(page, "no-unused-sources-q8.png");
});
