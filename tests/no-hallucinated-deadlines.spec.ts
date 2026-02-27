import { test, expect } from "@playwright/test";
import { CITATION_QUERIES, runCitationQuery } from "./helpers/citationIntegrity";

const MONTH_DATE_RE = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2}\b/gi;
const ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/g;

test("deadline/date claims are grounded in cited evidence", async ({ page, request }, testInfo) => {
  const { response } = await runCitationQuery({ page, request, testInfo, query: CITATION_QUERIES.q4 });
  const answer = String(response?.answer_text || response?.answer || "");
  const details = response?.details || {};
  const evidence = Array.isArray(details.evidenceBySource) ? details.evidenceBySource : [];
  const citations = Array.isArray(response?.citations) ? response.citations : [];
  const summaryRows = Array.isArray(details.summaryRows) ? details.summaryRows : [];

  const dates = [
    ...(answer.match(MONTH_DATE_RE) || []),
    ...(answer.match(ISO_DATE_RE) || []),
  ];
  const evidenceText = evidence
    .flatMap((entry: any) => (entry?.excerpts || []).map((excerpt: any) => String(excerpt?.text || "")))
    .join("\n");
  const citationSnippetText = citations.map((citation: any) => String(citation?.snippet || "")).join("\n");
  const summaryText = summaryRows
    .map((row: any) => `${row?.item || ""} ${row?.impact || ""} ${row?.priority || ""}`)
    .join("\n");
  const groundingText = `${evidenceText}\n${citationSnippetText}\n${summaryText}`
    .toLowerCase();

  if (dates.length === 0) {
    expect(answer.length).toBeGreaterThan(0);
    return;
  }

  const missing = dates.filter((date) => !groundingText.includes(date.toLowerCase()));
  if (missing.length > 0) {
    expect(
      answer.toLowerCase().includes("couldn't find a deadline"),
      `Ungrounded date(s) found in answer: ${missing.join(", ")}`,
    ).toBe(true);
  } else {
    expect(missing.length).toBe(0);
  }
});

