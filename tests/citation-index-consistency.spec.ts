import { test, expect } from "@playwright/test";
import { CITATION_QUERIES, extractMarkers, runCitationQuery } from "./helpers/citationIntegrity";

for (const [id, query] of Object.entries(CITATION_QUERIES)) {
  test(`citation index is consistent across answer/summary/evidence (${id})`, async ({ page, request }, testInfo) => {
    const { response } = await runCitationQuery({ page, request, testInfo, query });
    const answer = String(response?.answer_text || response?.answer || "");
    const citations = Array.isArray(response?.citations) ? response.citations : [];
    const details = response?.details || {};
    const summaryRows = Array.isArray(details.summaryRows) ? details.summaryRows : [];
    const evidence = Array.isArray(details.evidenceBySource) ? details.evidenceBySource : [];

    const markers = extractMarkers(answer).map(Number);
    for (const marker of markers) {
      expect(marker).toBeGreaterThanOrEqual(1);
      expect(marker).toBeLessThanOrEqual(citations.length);
      expect(marker).toBeLessThanOrEqual(evidence.length);
      const citation = citations[marker - 1];
      const evidenceSource = evidence[marker - 1];
      expect(Boolean(citation?.sourceId), `Citation missing for marker [${marker}]`).toBe(true);
      expect(Boolean(evidenceSource?.sourceKey), `Evidence missing for marker [${marker}]`).toBe(true);
      expect(evidenceSource.sourceKey).toBe(citation.sourceId);
    }

    for (const row of summaryRows) {
      for (const cid of row.citationIds || []) {
        const idx = Number(cid);
        expect(Number.isFinite(idx)).toBe(true);
        expect(idx).toBeGreaterThanOrEqual(1);
        expect(idx).toBeLessThanOrEqual(citations.length);
        expect(idx).toBeLessThanOrEqual(evidence.length);
        expect(evidence[idx - 1].sourceKey).toBe(citations[idx - 1].sourceId);
      }
    }
  });
}

