/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { request } = require("playwright");

const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:5000";
const N = Number(process.env.DIAG_RUNS || "20");
const OUT_DIR = path.resolve("/tmp");

const QUERIES = [
  {
    key: "roadmap",
    text: "What’s our 2025 product roadmap?",
  },
  {
    key: "blockers",
    text: "Are there any blockers for the AI search launch?",
  },
  {
    key: "biggest_risk",
    text: "What’s the biggest risk to our November 15 launch and what are we doing about it?",
  },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function slugifyQuery(key) {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function normalizeAnswer(payload, metadataResponse) {
  return String(
    payload?.answer_text ||
      payload?.answer ||
      metadataResponse?.answerText ||
      metadataResponse?.answer ||
      "",
  );
}

function bulletCount(answer) {
  return String(answer || "")
    .split(/\r?\n/g)
    .filter((line) => /^-\s+/.test(line.trim())).length;
}

function getCitations(payload, metadataResponse) {
  const candidate =
    payload?.citations ||
    metadataResponse?.citations ||
    metadataResponse?.bullets?.flatMap((b) => b.citations || []) ||
    [];
  return Array.isArray(candidate) ? candidate : [];
}

function getEvidence(payload, metadataResponse) {
  const candidate =
    payload?.details?.evidenceBySource ||
    metadataResponse?.details?.evidenceBySource ||
    metadataResponse?.evidence ||
    [];
  return Array.isArray(candidate) ? candidate : [];
}

function gatherCoreArtifactData({
  query,
  run,
  payload,
  metadataResponse,
  adminList,
  adminDetail,
  traceId,
  conversationId,
  answer,
  citations,
  evidence,
}) {
  const retrievedChunks =
    metadataResponse?.retrievedChunks ||
    payload?.retrieved_chunks ||
    adminDetail?.retrieval?.retrievedChunksJson ||
    adminDetail?.retrieval?.retrievedChunks ||
    [];

  const sourcesUsed =
    metadataResponse?.sourcesUsed ||
    payload?.sources_used ||
    payload?.sources ||
    [];

  const detailsBlocks =
    metadataResponse?.detailsBlocks ||
    payload?.details_blocks ||
    [];

  const timing =
    metadataResponse?.meta?.latencyMs ||
    payload?.meta?.latencyMs ||
    adminDetail?.observability?.latencyMs ||
    {};

  const answerMarkers = [...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  const citationIndexMap =
    metadataResponse?.citationIndexMap ||
    payload?.citationIndexMap ||
    {};

  return {
    query,
    run,
    conversationId,
    traceId,
    intent:
      metadataResponse?.intent ||
      metadataResponse?.intentType ||
      payload?.meta?.intent ||
      payload?.intent ||
      "UNKNOWN",
    answer_text: answer,
    answerMarkerCount: answerMarkers.length,
    bulletCount: bulletCount(answer),
    citations,
    evidenceList: evidence,
    retrieved_chunks: Array.isArray(retrievedChunks) ? retrievedChunks : [],
    sources_used: Array.isArray(sourcesUsed) ? sourcesUsed : [],
    details_blocks: Array.isArray(detailsBlocks) ? detailsBlocks : [],
    citationIndexMap,
    timing: {
      retrievalMs: Number(timing?.retrievalMs ?? 0),
      generationMs: Number(timing?.llmMs ?? timing?.generationMs ?? 0),
      totalMs: Number(timing?.totalMs ?? 0),
      raw: timing,
    },
    admin: {
      chatList: adminList || null,
      replyDetail: adminDetail || null,
    },
    rawPayload: payload,
  };
}

function classifyRun({ answer, artifact }) {
  const refusal = /couldn.?t reliably cite/i.test(answer);
  const lowBullets = artifact.bulletCount < 2;
  const zeroCitations = (artifact.citations || []).length === 0;
  const emptyEvidence = (artifact.evidenceList || []).length === 0;
  const isFail = refusal || lowBullets || zeroCitations || emptyEvidence;
  return {
    isFail,
    reasons: {
      refusal,
      lowBullets,
      zeroCitations,
      emptyEvidence,
    },
  };
}

function summarizeCase(artifact) {
  const retrieved = Array.isArray(artifact.retrieved_chunks) ? artifact.retrieved_chunks : [];
  const cited = Array.isArray(artifact.citations) ? artifact.citations : [];
  const uniqueRetrievedSources = new Set(
    retrieved.map((c) => c.sourceId || c.sourceKey || c.id).filter(Boolean),
  );
  const uniqueCitedSources = new Set(cited.map((c) => c.sourceId).filter(Boolean));
  const validator =
    artifact.admin?.replyDetail?.citation?.validation ||
    artifact.admin?.replyDetail?.citation ||
    null;

  return {
    retrievedChunkCount: retrieved.length,
    topK: Number(artifact.timing?.raw?.retrievalTopK ?? retrieved.length),
    uniqueSourceKeysRetrieved: uniqueRetrievedSources.size,
    uniqueSourceKeysCited: uniqueCitedSources.size,
    citationValidation: validator,
    retrievalMs: artifact.timing?.retrievalMs ?? 0,
    generationMs: artifact.timing?.generationMs ?? 0,
    totalMs: artifact.timing?.totalMs ?? 0,
  };
}

async function getMetadataResponse(api, conversationId) {
  const messagesRes = await api.get(`/api/conversations/${conversationId}/messages`);
  if (messagesRes.status() !== 200) return {};
  const messages = await messagesRes.json();
  const latestAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  return latestAssistant?.metadataJson?.response || {};
}

async function getAdminDetails(api, conversationId) {
  const listRes = await api.get(`/api/admin/chats/${conversationId}`);
  if (listRes.status() !== 200) {
    return { adminList: null, adminDetail: null };
  }
  const adminList = await listRes.json();
  const replies = adminList?.replies || [];
  const replyId = replies[replies.length - 1]?.reply?.id;
  if (!replyId) return { adminList, adminDetail: null };

  const detailRes = await api.get(`/api/admin/chats/${conversationId}/replies/${replyId}`);
  if (detailRes.status() !== 200) return { adminList, adminDetail: null };
  const adminDetail = await detailRes.json();
  return { adminList, adminDetail };
}

function writeArtifact(baseName, jsonPayload, logLines) {
  const jsonPath = path.join(OUT_DIR, `${baseName}.json`);
  const logPath = path.join(OUT_DIR, `${baseName}.log`);
  fs.writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2), "utf8");
  fs.writeFileSync(logPath, `${logLines.join("\n")}\n`, "utf8");
  return { jsonPath, logPath };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  ensureDir(OUT_DIR);

  const api = await request.newContext({
    baseURL: BASE_URL,
    ignoreHTTPSErrors: true,
  });

  const login = await api.post("/api/auth/login", {
    data: { email: "admin@fieldcopilot.com", password: "admin123" },
  });
  if (login.status() !== 200) {
    throw new Error(`Login failed: ${login.status()} ${await login.text()}`);
  }
  const loginJson = await login.json();
  const csrfToken = loginJson?.csrfToken;
  if (!csrfToken) {
    throw new Error("Login succeeded but csrfToken missing.");
  }

  const allResults = [];
  for (const q of QUERIES) {
    let savedPassing = false;
    for (let i = 1; i <= N; i += 1) {
      console.log(`[diag] query=${q.key} run=${i}/${N} starting`);
      let convRes = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        convRes = await api.post("/api/conversations", {
          headers: { "x-csrf-token": csrfToken },
          data: { title: `refusal-diag-${q.key}-${i}` },
          timeout: 60000,
        });
        if (convRes.status() === 429 && attempt < 4) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        break;
      }
      if (convRes.status() !== 200 && convRes.status() !== 201) {
        throw new Error(`Conversation creation failed (${q.key} run ${i}): ${convRes.status()} ${await convRes.text()}`);
      }
      const conv = await convRes.json();
      const conversationId = String(conv.id);

      let chatRes = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        chatRes = await api.post("/api/chat", {
          headers: { "x-csrf-token": csrfToken },
          data: { message: q.text, conversationId },
          timeout: 120000,
        });
        if (chatRes.status() === 429 && attempt < 4) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
        break;
      }
      if (!chatRes || chatRes.status() !== 200) {
        throw new Error(`Chat failed (${q.key} run ${i}): ${chatRes?.status()} ${await chatRes?.text()}`);
      }
      const payload = await chatRes.json();
      const metadataResponse = await getMetadataResponse(api, conversationId);
      const traceId =
        metadataResponse?.meta?.traceId ||
        payload?.meta?.traceId ||
        null;

      const answer = normalizeAnswer(payload, metadataResponse);
      const citations = getCitations(payload, metadataResponse);
      const evidence = getEvidence(payload, metadataResponse);
      const artifact = gatherCoreArtifactData({
        query: q.text,
        run: i,
        payload,
        metadataResponse,
        adminList: null,
        adminDetail: null,
        traceId,
        conversationId,
        answer,
        citations,
        evidence,
      });

      const verdict = classifyRun({ answer, artifact });
      const timestamp = nowStamp();
      const querySlug = slugifyQuery(q.key);

      const logLines = [
        `query=${q.text}`,
        `run=${i}`,
        `traceId=${traceId || "n/a"}`,
        `intent=${artifact.intent}`,
        `heuristics=${JSON.stringify(verdict.reasons)}`,
        `timing=${JSON.stringify(artifact.timing)}`,
      ];

      if (verdict.isFail) {
        const { adminList, adminDetail } = await getAdminDetails(api, conversationId);
        artifact.admin.chatList = adminList;
        artifact.admin.replyDetail = adminDetail;
        if (!artifact.traceId) {
          artifact.traceId = adminDetail?.observability?.traceId || artifact.traceId;
        }
        const baseName = `refusal_case_${querySlug}_${timestamp}`;
        const saved = writeArtifact(baseName, artifact, logLines);
        allResults.push({ queryKey: q.key, status: "fail", artifact, files: saved, verdict });
        console.log(`[diag] query=${q.key} run=${i} status=FAIL reasons=${JSON.stringify(verdict.reasons)}`);
      } else {
        allResults.push({ queryKey: q.key, status: "pass", artifact, files: null, verdict });
        if (!savedPassing) {
          const { adminList, adminDetail } = await getAdminDetails(api, conversationId);
          artifact.admin.chatList = adminList;
          artifact.admin.replyDetail = adminDetail;
          if (!artifact.traceId) {
            artifact.traceId = adminDetail?.observability?.traceId || artifact.traceId;
          }
          const baseName = `passing_case_${querySlug}_${timestamp}`;
          const saved = writeArtifact(baseName, artifact, logLines);
          savedPassing = true;
          console.log(`[diag] query=${q.key} run=${i} status=PASS (saved reference passing case)`);
        } else {
          console.log(`[diag] query=${q.key} run=${i} status=PASS`);
        }
      }
      await sleep(300);
    }
  }

  const comparison = [];
  for (const q of QUERIES) {
    const qResults = allResults.filter((r) => r.queryKey === q.key);
    const fail = qResults.find((r) => r.status === "fail");
    const pass = qResults.find((r) => r.status === "pass");
    comparison.push({
      query: q.key,
      fail: fail ? summarizeCase(fail.artifact) : null,
      pass: pass ? summarizeCase(pass.artifact) : null,
      totalRuns: qResults.length,
      failRuns: qResults.filter((r) => r.status === "fail").length,
      passRuns: qResults.filter((r) => r.status === "pass").length,
    });
  }

  const summaryPath = path.join(OUT_DIR, `refusal_diagnosis_summary_${nowStamp()}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify({ baseUrl: BASE_URL, runs: N, comparison }, null, 2), "utf8");

  console.log("=== REFUSAL DIAGNOSIS SUMMARY ===");
  for (const row of comparison) {
    const fail = row.fail || {};
    const pass = row.pass || {};
    console.log(
      [
        `${row.query}`,
        `runs=${row.totalRuns}`,
        `fail=${row.failRuns}`,
        `pass=${row.passRuns}`,
        `fail_chunks=${fail.retrievedChunkCount ?? "n/a"}`,
        `pass_chunks=${pass.retrievedChunkCount ?? "n/a"}`,
        `fail_topK=${fail.topK ?? "n/a"}`,
        `pass_topK=${pass.topK ?? "n/a"}`,
        `fail_src_retrieved=${fail.uniqueSourceKeysRetrieved ?? "n/a"}`,
        `pass_src_retrieved=${pass.uniqueSourceKeysRetrieved ?? "n/a"}`,
        `fail_src_cited=${fail.uniqueSourceKeysCited ?? "n/a"}`,
        `pass_src_cited=${pass.uniqueSourceKeysCited ?? "n/a"}`,
      ].join(" | "),
    );
  }
  console.log(`Summary JSON: ${summaryPath}`);
  await api.dispose();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
