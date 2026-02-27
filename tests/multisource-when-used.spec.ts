import { test, expect } from "@playwright/test";
import { captureScreenshot } from "./helpers/screenshot";
import { ensureConversationReady, loginAndWaitForSession } from "./helpers/auth";

test("Q4 uses multi-source citations only when evidence is actually used", async ({ page, request }, testInfo) => {
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
  await loginAndWaitForSession(page, request, baseURL);
  const conversationId = await ensureConversationReady(page, baseURL);

  const streamDone = page.waitForResponse(
    (r) => r.url().includes("/api/chat/stream") && r.request().method() === "POST",
    { timeout: 120_000 },
  );
  await page.getByTestId("input-chat").fill("Who is responsible for fixing the AWS blocker and when is the deadline?");
  await page.getByTestId("button-send").click();
  await streamDone;
  await page.waitForTimeout(12_000);

  const messagesResp = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
  expect(messagesResp.status()).toBe(200);
  const messages = await messagesResp.json();
  const latestAssistant = [...messages].reverse().find((m: any) => m.role === "assistant");
  const response = latestAssistant?.metadataJson?.response || {};
  const answerText: string = response.answer_text || response.answer || "";
  const citations: any[] = response.citations || [];

  const markers = [...answerText.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  const markerSet = [...new Set(markers)];
  for (const marker of markerSet) {
    expect(marker, `Citation marker [${marker}] must be >=1`).toBeGreaterThanOrEqual(1);
    expect(marker, `Citation marker [${marker}] must map into citations[]`).toBeLessThanOrEqual(citations.length);
  }

  const citationSourceIds = new Set(citations.map((c) => c.sourceId).filter(Boolean));
  const markedSourceIds = new Set(
    markerSet
      .map((n) => citations[n - 1]?.sourceId)
      .filter(Boolean),
  );

  if (citationSourceIds.size >= 2) {
    expect(markedSourceIds.size, "When multiple sources are cited, answer markers should reference multiple sources").toBeGreaterThanOrEqual(2);
  } else {
    expect(markedSourceIds.size, "Single-source answer should not fabricate extra source markers").toBeLessThanOrEqual(1);
  }

  await captureScreenshot(page, "multisource-when-used-q4.png");
});
