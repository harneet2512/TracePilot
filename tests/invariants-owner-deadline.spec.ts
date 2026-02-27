import { test, expect } from "@playwright/test";
import { mkdirSync } from "fs";
import { Client } from "pg";
import { loginAndGetCsrf } from "./helpers/auth";

const DIR = "playwright-artifacts/regression-after";

const DATE_RE =
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?\b|\b\d{4}-\d{2}-\d{2}\b|\bQ[1-4]\s+\d{4}\b/i;

test.beforeAll(() => {
  mkdirSync(DIR, { recursive: true });
});

test("owner/deadline invariant: person/date grounded and no duplicate fallback", async ({ page, request }, testInfo) => {
  const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
  const csrf = await loginAndGetCsrf(request, baseURL);
  const query = "Who is responsible for fixing the AWS blocker and when is the deadline?";
  const convResp = await request.post(`${baseURL}/api/conversations`, {
    headers: { "x-csrf-token": csrf },
    data: { title: "invariant-owner-deadline" },
  });
  expect(convResp.status()).toBe(200);
  const conv = await convResp.json();
  const conversationId = conv.id as string;
  const chatResp = await request.post(`${baseURL}/api/chat`, {
    headers: { "x-csrf-token": csrf },
    data: { message: query, conversationId },
  });
  expect(chatResp.status()).toBe(200);
  const response = await chatResp.json();
  const answer = String(response.answer_text || response.answer || "");

  const answerBulletLines = answer.split(/\r?\n/g).filter((line: string) => line.startsWith("- "));
  const structuredBullets = Array.isArray(response.bullets) ? response.bullets.length : 0;
  expect(Math.max(answerBulletLines.length, structuredBullets)).toBeGreaterThanOrEqual(2);

  const personLike = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/.test(answer);
  const singleNameOwner = /\bowner:\s*[A-Z][a-z]+\b/i.test(answer);
  const explicitOwnerMissing = /couldn't find (?:the )?owner/i.test(answer);
  expect(personLike || singleNameOwner || explicitOwnerMissing).toBe(true);

  const duplicateFallback = (answer.match(/couldn't find a deadline in the current sources\./gi) || []).length;
  expect(duplicateFallback).toBeLessThanOrEqual(1);

  const citationChunkIds = Array.from(new Set((response.citations || []).map((c: any) => c.chunkId).filter(Boolean)));
  let citedTextHasDate = false;
  if (citationChunkIds.length > 0) {
    const client = new Client({
      connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5433/fieldcopilot_test",
    });
    await client.connect();
    const placeholders = citationChunkIds.map((_: unknown, idx: number) => `$${idx + 1}`).join(",");
    const sql = `select text from chunks where id in (${placeholders})`;
    const rows = await client.query(sql, citationChunkIds);
    await client.end();
    const citedText = rows.rows.map((r: any) => String(r.text || "")).join("\n");
    citedTextHasDate = DATE_RE.test(citedText);
  }

  if (citedTextHasDate) {
    expect(DATE_RE.test(answer), "answer should include a date when cited text includes date").toBe(true);
  }

  await page.goto(`/chat/${conversationId}`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${DIR}/after_2_owner_deadline.png`, fullPage: true });
});
