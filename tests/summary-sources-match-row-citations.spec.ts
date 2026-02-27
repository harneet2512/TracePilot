import { test, expect } from "@playwright/test";
import { CITATION_QUERIES, runCitationQuery } from "./helpers/citationIntegrity";

for (const [id, query] of Object.entries(CITATION_QUERIES)) {
  test(`summary chips match row citations (${id})`, async ({ page, request }, testInfo) => {
    const { assistant, response } = await runCitationQuery({ page, request, testInfo, query });
    const rows = Array.isArray(response?.details?.summaryRows) ? response.details.summaryRows : [];
    const uiRows = assistant.locator('[data-testid="summary-row"]');
    let uiRowCount = await uiRows.count();
    if (rows.length > 0 && uiRowCount === 0) {
      const toggle = assistant.locator('[data-testid="details-toggle"]');
      if (await toggle.isVisible().catch(() => false)) {
        await toggle.click();
        await page.waitForTimeout(300);
        await toggle.click();
        await page.waitForTimeout(500);
      }
      uiRowCount = await uiRows.count();
    }

    if (uiRowCount === 0) {
      for (const row of rows) {
        const expected = new Set((row?.citationIds || []).map(String));
        expect(expected.size).toBe((row?.citationIds || []).length);
      }
      return;
    }

    expect(uiRowCount).toBe(rows.length);

    for (let i = 0; i < rows.length; i++) {
      const expected = new Set((rows[i]?.citationIds || []).map(String));
      const chips = uiRows.nth(i).locator('[data-testid="citation-chip"]');
      expect(await chips.count(), `Row ${i + 1} chip count must equal unique citationIds`).toBe(expected.size);

      for (let j = 0; j < (await chips.count()); j++) {
        const text = (await chips.nth(j).textContent()) || "";
        const idMatch = text.match(/\[(\d+)\]/)?.[1];
        expect(Boolean(idMatch), `Chip text must include [N], got "${text}"`).toBe(true);
        expect(expected.has(String(idMatch))).toBe(true);
      }
    }
  });
}

