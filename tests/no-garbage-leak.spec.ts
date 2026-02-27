import { test, expect } from "@playwright/test";
import { loginAndGetCsrf } from "./helpers/auth";

test.describe("No garbage text in answers", () => {

  test("AWS blocker owner/deadline answer has no garbage content", async ({ request }, testInfo) => {
    const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
    const csrf = await loginAndGetCsrf(request, baseURL);

    const convResp = await request.post(`${baseURL}/api/conversations`, {
      headers: { "x-csrf-token": csrf, "Content-Type": "application/json" },
    });
    expect(convResp.status()).toBe(200);
    const conv = await convResp.json();

    const chatResp = await request.post(`${baseURL}/api/chat`, {
      headers: { "x-csrf-token": csrf, "Content-Type": "application/json" },
      data: {
        message: "Who is responsible for fixing the AWS blocker and when is the deadline?",
        conversationId: conv.id,
      },
      timeout: 120_000,
    });
    expect(chatResp.status()).toBe(200);
    const data = await chatResp.json();
    const answerText: string = data.answer_text || data.answer || "";

    expect(answerText.length, "Answer should not be empty").toBeGreaterThan(10);

    // No long numeric sequences (25+ consecutive digit groups)
    expect(answerText).not.toMatch(/(\d+\s+){25,}/);

    // No Elsevier or academic boilerplate
    expect(answerText.toLowerCase()).not.toContain("elsevier");
    expect(answerText.toLowerCase()).not.toContain("all rights reserved");

    // No resume headings
    expect(answerText).not.toMatch(/^CURRICULUM\s+VITAE/im);
    expect(answerText).not.toMatch(/^RESUME$/im);

    // No PDF placeholders
    expect(answerText).not.toContain("[PDF Document");

    // No raw JSON keys leaking
    expect(answerText).not.toContain("chunkId");
    expect(answerText).not.toContain("sourceVersionId");
    expect(answerText).not.toContain("metadataJson");

    // No hex dumps
    expect(answerText).not.toMatch(/(?:[0-9a-f]{2}\s+){10,}/i);
  });

  test("blockers answer text is not duplicated", async ({ request }, testInfo) => {
    const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
    const csrf = await loginAndGetCsrf(request, baseURL);

    const convResp = await request.post(`${baseURL}/api/conversations`, {
      headers: { "x-csrf-token": csrf, "Content-Type": "application/json" },
    });
    expect(convResp.status()).toBe(200);
    const conv = await convResp.json();

    const chatResp = await request.post(`${baseURL}/api/chat`, {
      headers: { "x-csrf-token": csrf, "Content-Type": "application/json" },
      data: {
        message: "Are there any blockers for the AI search launch?",
        conversationId: conv.id,
      },
      timeout: 120_000,
    });
    expect(chatResp.status()).toBe(200);
    const data = await chatResp.json();
    const answerText: string = data.answer_text || data.answer || "";

    // Count "Want me to dig deeper" — should appear at most once
    const followUpCount = (answerText.match(/want me to dig deeper/gi) || []).length;
    expect(followUpCount, "Follow-up question should appear at most once").toBeLessThanOrEqual(1);

    // Count "Would you like" — should appear at most once
    const wouldYouCount = (answerText.match(/would you like/gi) || []).length;
    expect(wouldYouCount, "'Would you like' should appear at most once").toBeLessThanOrEqual(1);

    // Answer should not be duplicated (no repeated block)
    const lines = answerText.split("\n").filter((l: string) => l.trim().length > 20);
    if (lines.length >= 4) {
      const firstHalf = lines.slice(0, Math.floor(lines.length / 2)).join("\n");
      const secondHalf = lines.slice(Math.floor(lines.length / 2)).join("\n");
      expect(firstHalf === secondHalf, "Answer text should not be duplicated").toBe(false);
    }
  });
});
