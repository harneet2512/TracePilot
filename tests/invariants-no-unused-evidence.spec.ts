import { test, expect } from "@playwright/test";
import { mkdirSync } from "fs";
import { ensureConversationReady, loginAndWaitForSession } from "./helpers/auth";

const DIR = "playwright-artifacts/regression-after";

test.beforeAll(() => {
  mkdirSync(DIR, { recursive: true });
});

test("evidence invariant: every evidence card is referenced by citations", async ({ page, request }, testInfo) => {
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
  await loginAndWaitForSession(page, request, baseURL);
  const conversationId = await ensureConversationReady(page, baseURL);

  const streamDone = page.waitForResponse(
    (r) =>
      (r.url().includes("/api/chat/stream") || r.url().endsWith("/api/chat")) &&
      r.request().method() === "POST",
    { timeout: 120_000 },
  );
  await page.getByTestId("input-chat").fill("What’s the biggest risk to our November 15 launch and what are we doing about it?");
  await page.getByTestId("button-send").click();
  await streamDone;
  await page.waitForTimeout(6_000);

  const messagesResp = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
  expect(messagesResp.status()).toBe(200);
  const messages = await messagesResp.json();
  const latestAssistant = [...messages].reverse().find((m: any) => m.role === "assistant");
  const response = latestAssistant?.metadataJson?.response || {};

  const citedSourceIds = new Set((response.citations || []).map((c: any) => c.sourceId).filter(Boolean));
  const evidenceBySource = response?.details?.evidenceBySource || [];

  for (const ev of evidenceBySource) {
    expect(
      citedSourceIds.has(ev.sourceKey),
      `Evidence source ${ev.sourceKey} must be present in citations[]`,
    ).toBe(true);
  }

  await page.screenshot({ path: `${DIR}/after_4_no_unused_evidence.png`, fullPage: true });
});
