/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:5000";
const PAYLOAD_SUFFIX = process.env.PAYLOAD_SUFFIX || "";
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || "playwright-artifacts/regression-before";

const CASES = [
  { id: 1, key: "hi", query: "Hi" },
  { id: 2, key: "owner_deadline", query: "Who is responsible for fixing the AWS blocker and when is the deadline?" },
  { id: 3, key: "blockers", query: "Are there any blockers for the AI search launch?" },
  { id: 4, key: "risk", query: "What’s the biggest risk to our November 15 launch and what are we doing about it?" },
  { id: 5, key: "roadmap", query: "What’s our 2025 product roadmap?" },
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceCount(answer) {
  const s = String(answer || "").trim();
  if (!s) return 0;
  return s
    .split(/[.!?]+/g)
    .map((v) => v.trim())
    .filter(Boolean).length;
}

function bulletCount(answer) {
  return String(answer || "")
    .split(/\r?\n/g)
    .filter((line) => line.startsWith("- ")).length;
}

function uniqueSourceCountFromCitations(citations) {
  return new Set((citations || []).map((c) => c.sourceId).filter(Boolean)).size;
}

function detectIntentFromPayload(payload) {
  const debugIntent = payload?.debug?.intent || payload?.meta?.intent;
  if (debugIntent) return debugIntent;
  if (payload?.sections?.length) return "DOC_INTENT";
  if (!payload?.citations?.length) return "SMALLTALK_OR_GENERAL";
  return "UNKNOWN";
}

function extractFieldsForGrounding(payload) {
  const out = [];
  const sections = payload?.sections || [];
  for (const section of sections) {
    for (const item of section.items || []) {
      const fields = ["owner", "person", "deadline", "due", "date", "status", "priority", "cost", "kpi", "target", "current"];
      for (const f of fields) {
        const val = item?.[f];
        if (typeof val === "string" && val.trim()) {
          out.push({ field: f, value: val.trim() });
        }
      }
    }
  }
  return out;
}

function checkUngroundedAttributes(fields, citedText) {
  const normCited = normalizeText(citedText);
  const checks = [];
  for (const entry of fields) {
    const ok = normCited.includes(normalizeText(entry.value));
    checks.push({ ...entry, grounded: ok });
  }
  return {
    hasUngrounded: checks.some((c) => !c.grounded),
    checks,
  };
}

async function main() {
  const tmpDir = path.resolve("/tmp");
  const beforeDir = path.resolve(SCREENSHOT_DIR);
  ensureDir(tmpDir);
  ensureDir(beforeDir);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();

  const loginResp = await context.request.post(`${BASE_URL}/api/auth/login`, {
    data: { email: "admin@tracepilot.com", password: "admin123" },
  });
  if (loginResp.status() !== 200) {
    throw new Error(`Login failed: ${loginResp.status()} ${await loginResp.text()}`);
  }
  const loginJson = await loginResp.json();
  const csrfToken = loginJson.csrfToken;
  if (!csrfToken) throw new Error("Login did not return csrfToken");

  await page.goto("/chat");
  await page.waitForLoadState("networkidle");

  for (const t of CASES) {
    const convResp = await context.request.post(`${BASE_URL}/api/conversations`, {
      headers: { "x-csrf-token": csrfToken },
      data: { title: `regression-before-${t.id}` },
    });
    if (convResp.status() !== 201 && convResp.status() !== 200) {
      throw new Error(`Conversation create failed for case ${t.id}: ${convResp.status()} ${await convResp.text()}`);
    }
    const conv = await convResp.json();
    const conversationId = conv.id;

    let chatResp;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      chatResp = await context.request.post(`${BASE_URL}/api/chat`, {
        headers: { "x-csrf-token": csrfToken },
        data: { message: t.query, conversationId },
        timeout: 180000,
      });
      if (chatResp.status() === 429 && attempt < 3) {
        await sleep(3000 * (attempt + 1));
        continue;
      }
      break;
    }
    if (!chatResp || chatResp.status() !== 200) {
      throw new Error(`Chat request failed for case ${t.id}: ${chatResp?.status()} ${await chatResp?.text()}`);
    }
    const payload = await chatResp.json();

    const adminChatResp = await context.request.get(`${BASE_URL}/api/admin/chats/${conversationId}`);
    if (adminChatResp.status() !== 200) {
      throw new Error(`Admin chat fetch failed for case ${t.id}: ${adminChatResp.status()} ${await adminChatResp.text()}`);
    }
    const adminChat = await adminChatResp.json();
    const replies = adminChat?.replies || [];
    const lastReplyWrap = replies[replies.length - 1];
    const replyId = lastReplyWrap?.reply?.id;
    if (!replyId) {
      throw new Error(`No reply found for case ${t.id} chat ${conversationId}`);
    }

    const detailResp = await context.request.get(`${BASE_URL}/api/admin/chats/${conversationId}/replies/${replyId}`);
    if (detailResp.status() !== 200) {
      throw new Error(`Admin reply detail failed for case ${t.id}: ${detailResp.status()} ${await detailResp.text()}`);
    }
    const detail = await detailResp.json();

    const traceId = detail?.observability?.traceId || payload?.debug?.traceId || payload?.traceId || null;
    let diagnosticChunks = [];
    if (traceId) {
      const chunksResp = await context.request.get(
        `${BASE_URL}/api/diagnostics/chunks?traceId=${encodeURIComponent(traceId)}`,
      );
      if (chunksResp.status() === 200) {
        const chunksBody = await chunksResp.json();
        diagnosticChunks = chunksBody?.chunks || [];
      }
    }
    const retrievedChunks = diagnosticChunks.length > 0
      ? diagnosticChunks.map((c) => ({
          chunkId: c.chunkId,
          sourceId: c.sourceId || null,
          snippet: c.snippet || "",
          score: c.score,
          charStart: c.charStart,
          charEnd: c.charEnd,
          sourceTitle: c.sourceTitle,
        }))
      : (detail?.retrieval?.retrievedChunksJson || []);
    const citations = detail?.citation?.citationsJson || payload?.citations || [];
    const citedChunkIds = new Set((citations || []).map((c) => c.chunkId).filter(Boolean));
    const citedSnippets = retrievedChunks
      .filter((c) => citedChunkIds.has(c.chunkId || c.id))
      .map((c) => c.snippet || c.text || c.quote || "")
      .filter(Boolean);
    const citedTextAggregate = citedSnippets.join("\n");

    const answerText = payload?.answer_text || payload?.answer || "";
    const summaryRows = payload?.details?.summaryRows || [];
    const evidenceBySource = payload?.details?.evidenceBySource || [];
    const fields = extractFieldsForGrounding(payload);
    const groundingCheck = checkUngroundedAttributes(fields, citedTextAggregate);

    const diagnostics = {
      caseId: t.id,
      query: t.query,
      intent: detectIntentFromPayload(payload),
      answerFirst200: String(answerText).slice(0, 200),
      sentenceCount: sentenceCount(answerText),
      bulletCount: bulletCount(answerText),
      uniqueCitedSourcesCount: uniqueSourceCountFromCitations(citations),
      evidenceListSourcesCount: evidenceBySource.length || (payload?.sources || []).length || 0,
      summaryRows: summaryRows.map((row, idx) => ({
        row: idx + 1,
        rowCitationCount: (row?.citationIds || []).length,
        uiChipCountExpected: (row?.citationIds || []).length,
      })),
      hasUngroundedAttributeOutput: groundingCheck.hasUngrounded,
      groundingChecks: groundingCheck.checks,
    };

    const output = {
      case: t,
      conversationId,
      replyId,
      traceId,
      rawServerPayload: payload,
      retrievedChunks,
      citations,
      diagnostics,
      replyDetail: {
        retrieval: detail?.retrieval || null,
        citation: detail?.citation || null,
        observability: detail?.observability || null,
      },
    };

    const outPath = path.join(tmpDir, `payload_${t.id}_${t.key}${PAYLOAD_SUFFIX}.json`);
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");

    await page.goto(`/chat/${conversationId}`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: path.join(beforeDir, `${t.id}_${t.key}.png`), fullPage: true });

    console.log(`\n=== Diagnostic Case ${t.id}: ${t.key} ===`);
    console.table([
      {
        intent: diagnostics.intent,
        answerFirst200: diagnostics.answerFirst200,
        bulletCount: diagnostics.bulletCount,
        uniqueCitedSources: diagnostics.uniqueCitedSourcesCount,
        evidenceListSources: diagnostics.evidenceListSourcesCount,
        ungroundedAttributes: diagnostics.hasUngroundedAttributeOutput,
      },
    ]);
    for (const row of diagnostics.summaryRows) {
      console.log(
        `summaryRow#${row.row}: row.citations=${row.rowCitationCount} uiChipsExpected=${row.uiChipCountExpected}`,
      );
    }
  }

  await browser.close();
  console.log("Capture complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
