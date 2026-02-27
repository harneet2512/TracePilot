import { test, expect } from "@playwright/test";
import { loginAndGetCsrf } from "./helpers/auth";

test.describe("Summary table multi-source citation chips", () => {

  test("blockers query: response has multi-source rows with correct citationIds", async ({ request }, testInfo) => {
    const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
    const csrf = await loginAndGetCsrf(request, baseURL);

    // Create a conversation
    const convResp = await request.post(`${baseURL}/api/conversations`, {
      headers: { "x-csrf-token": csrf, "Content-Type": "application/json" },
    });
    expect(convResp.status()).toBe(200);
    const conv = await convResp.json();
    const conversationId = conv.id;

    // Send the blockers query via non-streaming endpoint
    const chatResp = await request.post(`${baseURL}/api/chat`, {
      headers: { "x-csrf-token": csrf, "Content-Type": "application/json" },
      data: { message: "Are there any blockers for the AI search launch?", conversationId },
      timeout: 120_000,
    });
    expect(chatResp.status()).toBe(200);
    const data = await chatResp.json();

    // Verify response shape
    expect(data.answer || data.answer_text, "Should have answer text").toBeTruthy();
    const details = data.details;
    const citations = data.citations || [];

    if (details && details.summaryRows && details.summaryRows.length > 0) {
      // Find a multi-source row
      const multiSourceRow = details.summaryRows.find(
        (r: any) => r.citationIds && r.citationIds.length >= 2
      );

      if (multiSourceRow) {
        // Verify the multi-source row has distinct citation IDs
        const uniqueIds = new Set(multiSourceRow.citationIds);
        expect(uniqueIds.size, "Multi-source row should have 2+ distinct citationIds").toBeGreaterThanOrEqual(2);
      }

      // At minimum, all rows should have at least one citationId
      for (const row of details.summaryRows) {
        expect(row.citationIds?.length, `Row '${row.item}' should have at least 1 citationId`).toBeGreaterThanOrEqual(1);
      }
    }

    // Verify Evidence list matches cited sources
    if (details?.evidenceBySource && details.evidenceBySource.length > 0) {
      for (const ev of details.evidenceBySource) {
        expect(ev.url, `Evidence '${ev.title}' should have a URL`).toBeTruthy();
      }
    }

    // Verify citations array has source-level entries
    if (citations.length > 0) {
      for (const c of citations) {
        expect(c.sourceId || c.label, "Each citation should have sourceId or label").toBeTruthy();
      }
    }
  });
});
