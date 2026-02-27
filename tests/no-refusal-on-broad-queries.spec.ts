import { test, expect } from "@playwright/test";
import { loginAndGetCsrf } from "./helpers/auth";

const QUERIES = [
  "What’s our 2025 product roadmap?",
  "Are there any blockers for the AI search launch?",
  "What’s the biggest risk to our November 15 launch and what are we doing about it?",
];

function hasHardRefusal(answer: string): boolean {
  return /couldn.?t reliably cite/i.test(answer);
}

async function runSingleBroadQuery(params: {
  request: any;
  baseURL: string;
  csrf: string;
  query: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const { request, baseURL, csrf, query } = params;
  const convResp = await request.post(`${baseURL}/api/conversations`, {
    headers: { "x-csrf-token": csrf },
    data: { title: `no-refusal-${Date.now()}-${Math.random()}` },
  });
  if (![200, 201].includes(convResp.status())) {
    return { ok: false, reason: `conversation-create-${convResp.status()}` };
  }
  const conv = await convResp.json();

  let chatResp;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      chatResp = await request.post(`${baseURL}/api/chat`, {
        headers: { "x-csrf-token": csrf },
        data: { conversationId: conv.id, message: query },
        timeout: 20_000,
      });
      if (chatResp.status() === 429 && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      break;
    } catch {
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      return { ok: false, reason: "chat-timeout" };
    }
  }
  if (!chatResp || chatResp.status() !== 200) {
    return { ok: false, reason: `chat-status-${chatResp?.status()}` };
  }
  const payload = await chatResp.json();

  const answer = String(payload?.answer_text || payload?.answer || "");
  const bullets = Array.isArray(payload?.bullets) ? payload.bullets : [];
  const clarifyingQuestions = Array.isArray(payload?.clarifyingQuestions) ? payload.clarifyingQuestions : [];
  const needsClarification = Boolean(payload?.needsClarification);

  const citedBulletCount = bullets.filter(
    (b: any) => typeof b?.claim === "string" && b.claim.trim() && Array.isArray(b?.citations) && b.citations.length > 0,
  ).length;
  const askedClarification = needsClarification || clarifyingQuestions.length > 0;

  if (hasHardRefusal(answer)) return { ok: false, reason: "hard-refusal" };
  if (!(citedBulletCount >= 1 || askedClarification)) {
    return { ok: false, reason: "neither-cited-bullet-nor-clarification" };
  }
  return { ok: true };
}

test.describe("no refusal on broad queries", () => {
  for (const query of QUERIES) {
    for (let run = 1; run <= 10; run += 1) {
      test(`broad query run ${run}/10 remains grounded or clarifies: ${query}`, async ({ request }, testInfo) => {
      const baseURL = String((testInfo.project.use as any).baseURL || "http://127.0.0.1:5000");
      const csrf = await loginAndGetCsrf(request, baseURL);
      const result = await runSingleBroadQuery({ request, baseURL, csrf, query });
      expect(result.ok, `Expected grounded or clarifying response; reason=${result.reason || "unknown"}`).toBe(true);
      });
    }
  }
});
