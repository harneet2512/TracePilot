import { test, expect } from "@playwright/test";
import { mkdirSync } from "fs";
import { ensureConversationReady, loginAndWaitForSession } from "./helpers/auth";

const DIR = "playwright-artifacts/regression-after";

test.beforeAll(() => {
  mkdirSync(DIR, { recursive: true });
});

test("citation invariant: bullets, evidence list, and summary chips stay consistent", async ({ page, request }, testInfo) => {
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
  await loginAndWaitForSession(page, request, baseURL);
  const conversationId = await ensureConversationReady(page, baseURL);

  const streamDone = page.waitForResponse(
    (r) =>
      (r.url().includes("/api/chat/stream") || r.url().endsWith("/api/chat")) &&
      r.request().method() === "POST",
    { timeout: 120_000 },
  );
  await page.getByTestId("input-chat").fill("Are there any blockers for the AI search launch?");
  await page.getByTestId("button-send").click();
  await streamDone;
  await page.waitForTimeout(6_000);

  const messagesResp = await page.request.get(`${baseURL}/api/conversations/${conversationId}/messages`);
  expect(messagesResp.status()).toBe(200);
  const messages = await messagesResp.json();
  const latestAssistant = [...messages].reverse().find((m: any) => m.role === "assistant");
  const response = latestAssistant?.metadataJson?.response || {};
  const answer = String(response.answer_text || response.answer || "");
  const bullets = answer.split(/\r?\n/g).filter((line: string) => line.startsWith("- "));

  for (const bullet of bullets) {
    expect(/\[\d+\]/.test(bullet), `bullet must contain citation marker: ${bullet}`).toBe(true);
  }

  const uniqueCitedSources = new Set((response.citations || []).map((c: any) => c.sourceId).filter(Boolean));
  const evidenceBySource = response?.details?.evidenceBySource || [];
  expect(evidenceBySource.length).toBe(uniqueCitedSources.size);

  const sourceIndexMap: Record<string, number> = response.citationIndexMap || {};
  const sourceIdByIndex = new Map<string, string>(
    Object.entries(sourceIndexMap).map(([sourceId, idx]) => [String(idx), sourceId]),
  );
  const sectionItems = (response.sections || []).flatMap((section: any) => section.items || []);
  const itemSourcesByText = new Map<string, Set<string>>();
  for (const item of sectionItems) {
    itemSourcesByText.set(
      item.text,
      new Set((item.citations || []).map((c: any) => c.sourceId).filter(Boolean)),
    );
  }
  for (const row of response?.details?.summaryRows || []) {
    const expectedSources = itemSourcesByText.get(row.item) || new Set<string>();
    const rowSources = new Set(
      (row.citationIds || [])
        .map((id: string) => sourceIdByIndex.get(String(id)))
        .filter(Boolean) as string[],
    );
    expect(Array.from(rowSources).sort()).toEqual(Array.from(expectedSources).sort());
  }

  await page.screenshot({ path: `${DIR}/after_3_blockers_citations.png`, fullPage: true });
});
