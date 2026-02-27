import { test, expect } from "@playwright/test";
import { CITATION_QUERIES, extractMarkers, runCitationQuery } from "./helpers/citationIntegrity";

for (const [id, query] of Object.entries(CITATION_QUERIES)) {
  test(`evidence cards are cited only (${id})`, async ({ page, request }, testInfo) => {
    const { response } = await runCitationQuery({ page, request, testInfo, query });

    const answer = String(response?.answer_text || response?.answer || "");
    const details = response?.details || {};
    const summaryRows = Array.isArray(details.summaryRows) ? details.summaryRows : [];
    const evidence = Array.isArray(details.evidenceBySource) ? details.evidenceBySource : [];

    const markerIds = new Set(extractMarkers(answer));
    const rowIds = new Set(summaryRows.flatMap((row: any) => row?.citationIds || []).map(String));
    const referenced = new Set<string>([...markerIds, ...rowIds]);

    expect(evidence.length, "Evidence should exist only when references exist").toBe(referenced.size);
    for (let i = 0; i < evidence.length; i++) {
      const evidenceIdx = String(i + 1);
      expect(
        referenced.has(evidenceIdx),
        `Evidence index ${evidenceIdx} appears without an answer/summary citation reference`,
      ).toBe(true);
    }
  });
}

