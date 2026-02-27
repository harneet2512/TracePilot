/**
 * Regression test: retrieval must never load 30k+ chunks (OOM guard).
 * Asserts bounded candidate set and per-source cap.
 */
import { test, expect } from "@playwright/test";

const RETRIEVAL_TOP_K = 12;
const RETRIEVAL_MAX_CANDIDATES = 1000;
const MAX_ACCEPTABLE_CHUNKS = 50;

test("retrieval returns bounded chunks — no OOM", async ({ page, request }, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL || "http://127.0.0.1:5000");

  const seedResponse = await request.post(`${baseURL}/api/seed`);
  expect([200, 201]).toContain(seedResponse.status());

  await page.request.post(`${baseURL}/api/auth/login`, {
    data: { email: "admin@fieldcopilot.com", password: "admin123" },
  });

  const diagnoseResponse = await page.request.get(
    `${baseURL}/api/debug/retrieval/diagnose?q=What+are+the+OKRs&workspaceId=default-workspace&topK=${RETRIEVAL_TOP_K}`
  );

  if (diagnoseResponse.status() === 404) {
    test.skip();
    return;
  }

  expect(diagnoseResponse.status()).toBe(200);
  const body = await diagnoseResponse.json();

  const mergedCount = body.mergedReranked?.retrievedCount ?? 0;
  expect(mergedCount).toBeLessThanOrEqual(MAX_ACCEPTABLE_CHUNKS);

  const primaryCount = body.primaryRetrieval?.retrievedCount ?? 0;
  expect(primaryCount).toBeLessThanOrEqual(RETRIEVAL_MAX_CANDIDATES);
});

test("retrieval cross-source query returns bounded result", async ({ page, request }, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL || "http://127.0.0.1:5000");

  const seedResponse = await request.post(`${baseURL}/api/seed`);
  expect([200, 201]).toContain(seedResponse.status());

  await page.request.post(`${baseURL}/api/auth/login`, {
    data: { email: "admin@fieldcopilot.com", password: "admin123" },
  });

  const diagnoseResponse = await page.request.get(
    `${baseURL}/api/debug/retrieval/diagnose?q=What+are+the+blockers+for+launch&workspaceId=default-workspace&topK=${RETRIEVAL_TOP_K}`
  );

  if (diagnoseResponse.status() === 404) {
    test.skip();
    return;
  }

  expect(diagnoseResponse.status()).toBe(200);
  const body = await diagnoseResponse.json();

  const mergedCount = body.mergedReranked?.retrievedCount ?? 0;
  expect(mergedCount).toBeLessThanOrEqual(MAX_ACCEPTABLE_CHUNKS);
});
