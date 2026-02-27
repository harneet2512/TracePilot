import { test, expect } from "@playwright/test";
import { runCitationQuery } from "./helpers/citationIntegrity";

test("smalltalk hi is fast and has no citations", async ({ page, request }, testInfo) => {
  const start = Date.now();
  const { response } = await runCitationQuery({ page, request, testInfo, query: "Hi" });
  const elapsedMs = Date.now() - start;

  const citations = Array.isArray(response?.citations) ? response.citations : [];
  const answer = String(response?.answer_text || response?.answer || "");

  expect(answer.length).toBeGreaterThan(0);
  expect(citations.length, "Smalltalk should not return citations").toBe(0);
  expect(elapsedMs, "Smalltalk should stay responsive").toBeLessThan(30_000);
});

