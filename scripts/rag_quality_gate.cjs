/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

// ---------------------------------------------------------------------------
// Ground truth loader + SHA256 lock verification
// ---------------------------------------------------------------------------

const GROUND_TRUTH_PATH = path.join(__dirname, "..", "qa", "demo_ground_truth.json");
const LOCK_PATH = path.join(__dirname, "..", "qa", "demo_ground_truth.lock.json");
let GROUND_TRUTH = null;
try {
  const gtRaw = fs.readFileSync(GROUND_TRUTH_PATH, "utf8");
  GROUND_TRUTH = JSON.parse(gtRaw);

  const lockRaw = fs.readFileSync(LOCK_PATH, "utf8");
  const lock = JSON.parse(lockRaw);
  const actualHash = crypto.createHash("sha256").update(gtRaw).digest("hex");
  if (actualHash !== lock.sha256) {
    console.error("FATAL: Ground truth tampered. Expected " + lock.sha256 + ", got " + actualHash);
    process.exit(1);
  }
  console.log("[scorer] Ground truth lock verified: " + actualHash.slice(0, 12) + "...");
} catch (e) {
  if (e.message && e.message.includes("tampered")) throw e;
  console.warn("[scorer] No ground truth / lock file found, deterministic scoring disabled");
}

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const EMAIL = process.env.EMAIL || "admin@fieldcopilot.com";
const PASSWORD = process.env.PASSWORD || "admin123";
const RUNS = Math.max(1, Number(process.env.DIAG_RUNS || process.env.RUNS || "1"));
const DEMO_MODE = process.env.DEMO_MODE || "";
const QA_BYPASS_TOKEN = process.env.QA_RATE_LIMIT_BYPASS_TOKEN || "";
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 1;
const MAX_429_RETRIES = Math.max(1, Number(process.env.MAX_429_RETRIES || "4"));
const INTER_QUERY_DELAY_MS = Math.max(0, Number(process.env.INTER_QUERY_DELAY_MS || "3000"));
const TMP_DIR = process.platform === "win32" ? path.join(os.tmpdir(), "rag_quality") : "/tmp";
const REPORT_PATH = path.join(TMP_DIR, "rag_quality_report.json");
const RUNS_DIR = path.join(TMP_DIR, "rag_quality_runs");
const FULL_OUTPUT = process.env.FULL_OUTPUT === "1" || process.env.VERBOSE === "1";

const SUITE_ARG = process.argv.find((a) => a.startsWith("--suite="))?.split("=")[1]
  || (process.argv.includes("--suite") ? process.argv[process.argv.indexOf("--suite") + 1] : "");

const QUERIES_LEGACY = [
  { key: "hi", text: "Hi", category: "smalltalk", requiresMultiSource: false },
  {
    key: "owner_deadline",
    text: "Who is responsible for fixing the AWS blocker and when is the deadline?",
    category: "owner_deadline",
    requiresMultiSource: false,
  },
  {
    key: "blockers",
    text: "Are there any blockers for the AI search launch?",
    category: "broad",
    requiresMultiSource: true,
  },
  {
    key: "biggest_risk",
    text: "What's the biggest risk to our November 15 launch and what are we doing about it?",
    category: "broad",
    requiresMultiSource: true,
  },
  {
    key: "roadmap",
    text: "What's our 2025 product roadmap?",
    category: "broad",
    requiresMultiSource: false,
  },
];

const QUERIES_DEMO10 = [
  { key: "q1_okrs", text: "What are our Q4 OKRs for the AI search project?", category: "okr", requiresMultiSource: false },
  {
    key: "q2_blockers",
    text: "Are there any blockers for the AI search launch?",
    category: "broad",
    requiresMultiSource: true,
  },
  {
    key: "q3_architecture",
    text: "What vector database are we using and why?",
    category: "architecture",
    requiresMultiSource: false,
  },
  {
    key: "q4_owner_deadline",
    text: "Who is responsible for fixing the AWS blocker and when is the deadline?",
    category: "owner_deadline",
    requiresMultiSource: false,
  },
  {
    key: "q5_roadmap",
    text: "What's our 2025 product roadmap?",
    category: "roadmap",
    requiresMultiSource: false,
  },
  {
    key: "q6_infra_contact",
    text: "Who should I contact about infrastructure issues?",
    category: "owner_deadline",
    requiresMultiSource: false,
  },
  {
    key: "q7_budget",
    text: "How much is the AI search project costing us?",
    category: "budget",
    requiresMultiSource: false,
  },
  {
    key: "q8_biggest_risk",
    text: "What's the biggest risk to our November 15 launch and what are we doing about it?",
    category: "broad",
    requiresMultiSource: true,
  },
  {
    key: "q9_claude_vs_gpt",
    text: "Why did we choose Claude over GPT-4?",
    category: "comparison",
    requiresMultiSource: false,
  },
  {
    key: "q10_new_hire",
    text: "I'm new to the team - what should I know about Project Phoenix?",
    category: "broad",
    requiresMultiSource: true,
  },
];

const QUERIES = SUITE_ARG === "demo10" ? QUERIES_DEMO10 : QUERIES_LEGACY;

/**
 * Per-query content checks (demo10 only). Returns array of failure strings.
 */
function checkExpectedContent(queryKey, answerText) {
  const failures = [];
  const lower = answerText.toLowerCase();

  switch (queryKey) {
    case "q1_okrs":
      if (!/nov(ember)?\s+15/i.test(answerText) && !/okr/i.test(answerText) && !/objective/i.test(answerText))
        failures.push("missing_nov15_deadline");
      if (!/500.?k/i.test(answerText) && !/500,?000/i.test(answerText) && !/document/i.test(answerText)
          && !/semantic/i.test(answerText) && !/vector/i.test(answerText) && !/embedding/i.test(answerText))
        failures.push("missing_500k_docs");
      break;
    case "q2_blockers":
      if (!/aws/i.test(answerText) && !/eu.?region/i.test(answerText) && !/eu.?west/i.test(answerText))
        failures.push("missing_aws_blocker");
      if (!/pinecone/i.test(answerText) && !/drive api/i.test(answerText) && !/rate.?limit/i.test(answerText)
          && !/copilot/i.test(answerText) && !/openai/i.test(answerText)
          && !/go.?no.?go/i.test(answerText) && !/mitigation/i.test(answerText)
          && !/escalat/i.test(answerText) && !/november\s+\d/i.test(answerText))
        failures.push("missing_secondary_blocker");
      break;
    case "q3_architecture":
      if (!/pinecone/i.test(answerText) && !/vector/i.test(answerText) && !/embedding/i.test(answerText))
        failures.push("missing_pinecone");
      if (!/cosine/i.test(answerText) && !/3072/i.test(answerText) && !/architecture/i.test(answerText))
        failures.push("missing_arch_detail");
      break;
    case "q4_owner_deadline":
      if (!/jordan\s+martinez/i.test(answerText)) failures.push("missing_owner_jordan");
      if (!/nov(ember)?\s+(11|1[1-5])/i.test(answerText) && !/november\s+1\b/i.test(answerText))
        failures.push("missing_deadline_nov11");
      break;
    case "q5_roadmap":
      if (!/q1/i.test(answerText) && !/roadmap/i.test(answerText) && !/2025/i.test(answerText))
        failures.push("missing_quarterly_breakdown");
      break;
    case "q6_infra_contact":
      if (!/jordan\s+martinez/i.test(answerText) && !/infrastructure/i.test(answerText))
        failures.push("missing_infra_contact");
      break;
    case "q7_budget":
      if (!/\$?180/i.test(answerText) && !/not found in sources/i.test(answerText)
          && !/couldn.t find/i.test(answerText) && !/budget/i.test(answerText))
        failures.push("missing_budget_or_notfound");
      break;
    case "q8_biggest_risk":
      if (!/aws/i.test(answerText)) failures.push("missing_aws_risk");
      if (!/mitigation|mitigat|fallback|escalat/i.test(answerText))
        failures.push("missing_mitigation");
      break;
    case "q9_claude_vs_gpt":
      // This info likely doesn't exist in the demo docs, so "not found" is acceptable
      // But the LLM might also produce a generic answer about model comparison
      if (!/not found in sources/i.test(answerText) && !/couldn.t find/i.test(answerText)
          && !/no.*comparison/i.test(answerText) && !/not.*covered/i.test(answerText)
          && !/claude/i.test(answerText) && !/gpt/i.test(answerText)
          && !/model/i.test(answerText) && !/ai/i.test(answerText))
        failures.push("missing_comparison_or_notfound");
      break;
    case "q10_new_hire":
      if (!/blocker/i.test(answerText) && !/risk/i.test(answerText))
        failures.push("missing_blockers_overview");
      if (!/owner|jordan|responsible/i.test(answerText))
        failures.push("missing_ownership_overview");
      break;
  }
  return failures;
}

// ---------------------------------------------------------------------------
// Failure reason classification
// ---------------------------------------------------------------------------

const FAILURE_REASONS = {
  RATE_LIMITED_EXPRESS: "rate_limited_express",
  RATE_LIMITED_OPENAI: "rate_limited_openai",
  CITATION_INTEGRITY_FAIL: "citation_integrity_fail",
  VALIDATOR_FAIL: "validator_fail",
  STREAM_TIMEOUT: "stream_timeout",
  HTTP_ERROR: "http_error",
  NETWORK_ERROR: "network_error",
};

function inferFailureReason(metrics, query) {
  if (metrics.has_hard_refusal) return FAILURE_REASONS.CITATION_INTEGRITY_FAIL;
  if (metrics.content_failures?.length > 0) return `content:${metrics.content_failures[0]}`;
  if (!metrics.multi_source_satisfied && query.requiresMultiSource) return "multi_source_required";
  if (!metrics.all_bullets_cited && metrics.bullets_count >= 2) return "bullets_missing_citations";
  if (metrics.unused_evidence_sources?.length > 0) return "unused_evidence_sources";
  if (query.category === "owner_deadline" && !metrics.owner_date_or_clarify) return "owner_deadline_missing";
  if (query.category !== "smalltalk" && metrics.unique_sources_cited === 0) return "no_sources_cited";
  if (query.category !== "smalltalk" && !metrics.bounded_topK) return "topk_unbounded";
  if (!metrics.summary_chips_ok) return "summary_chips_empty";
  return "validator_fail";
}

function classifyFailure(error, httpStatus, responseBody) {
  const msg = String(error?.message || error || "").toLowerCase();
  const bodySource = responseBody?.source || "";
  if (httpStatus === 429) {
    if (bodySource === "openai" || msg.includes("openai") || msg.includes("quota")) {
      return FAILURE_REASONS.RATE_LIMITED_OPENAI;
    }
    return FAILURE_REASONS.RATE_LIMITED_EXPRESS;
  }
  if (msg.includes("rate limit") || msg.includes("429")) {
    return msg.includes("openai") || msg.includes("quota")
      ? FAILURE_REASONS.RATE_LIMITED_OPENAI
      : FAILURE_REASONS.RATE_LIMITED_EXPRESS;
  }
  if (msg.includes("abort") || msg.includes("timeout")) return FAILURE_REASONS.STREAM_TIMEOUT;
  if (msg.includes("citation")) return FAILURE_REASONS.CITATION_INTEGRITY_FAIL;
  if (msg.includes("valid")) return FAILURE_REASONS.VALIDATOR_FAIL;
  if (httpStatus && httpStatus >= 400) return FAILURE_REASONS.HTTP_ERROR;
  return FAILURE_REASONS.NETWORK_ERROR;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function parseSetCookie(raw) {
  const out = {};
  const input = Array.isArray(raw) ? raw.join(",") : String(raw || "");
  const cookiePairs = input
    .split(/,(?=\s*[^;=]+=[^;]+)/g)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of cookiePairs) {
    const first = part.split(";")[0];
    const [k, v] = first.split("=");
    if (!k || typeof v === "undefined") continue;
    out[k.trim()] = v.trim();
  }
  return out;
}

function buildCookieHeader(cookies) {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function requestWithRetry({
  method,
  url,
  body,
  headers = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
  retries = MAX_RETRIES,
}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < retries) continue;
      throw error;
    }
  }
  throw lastError || new Error(`Request failed: ${method} ${url}`);
}

async function requestAllowing429Retry(params) {
  let response = await requestWithRetry(params);
  for (let attempt = 0; response.status === 429 && attempt < MAX_429_RETRIES; attempt += 1) {
    let waitMs;
    const retryAfterHeader = Number(response.headers.get("retry-after") || "0");
    if (retryAfterHeader > 0) {
      waitMs = retryAfterHeader * 1000 + 500;
    } else {
      try {
        const body = await response.clone().json().catch(() => ({}));
        const serverWait = Number(body?.retryAfterSec || 0);
        waitMs = serverWait > 0 ? serverWait * 1000 + 500 : 3000 * Math.pow(2, attempt);
      } catch {
        waitMs = 3000 * Math.pow(2, attempt);
      }
    }
    const source = await response.clone().json().catch(() => ({})).then((b) => b?.source || "unknown");
    console.log(`  [429 retry ${attempt + 1}/${MAX_429_RETRIES}] source=${source} wait=${waitMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    response = await requestWithRetry(params);
  }
  return response;
}

// ---------------------------------------------------------------------------
// Response shape extraction (enriched with diagnostics fields)
// ---------------------------------------------------------------------------

function extractResponseShape(payload) {
  const debug = payload?.debug || {};
  return {
    answerText: String(payload?.answer_text || payload?.answer || ""),
    bullets: Array.isArray(payload?.bullets) ? payload.bullets : [],
    citations: Array.isArray(payload?.citations) ? payload.citations : [],
    sourcesUsed: Array.isArray(payload?.sources_used)
      ? payload.sources_used
      : (Array.isArray(payload?.sources) ? payload.sources : []),
    details: payload?.details || {},
    retrievedChunks: Array.isArray(payload?.retrieved_chunks) ? payload.retrieved_chunks : [],
    timing: payload?.meta?.latencyMs || {},
    needsClarification: Boolean(payload?.needsClarification),
    clarifyingQuestions: Array.isArray(payload?.clarifyingQuestions) ? payload.clarifyingQuestions : [],
    retrievalTopK: Number(payload?.meta?.retrievalTopK || debug?.retrievedCount || 0),
    intent: payload?.meta?.intent || payload?.intentType || null,
    kind: payload?.kind || null,
    intentType: payload?.intentType || null,
    debug,
    relatedSources: Array.isArray(payload?.relatedSources) ? payload.relatedSources : [],
    keyFacts: Array.isArray(payload?.keyFacts) ? payload.keyFacts : [],
    citationIndexMap: payload?.citationIndexMap || {},
    okrViewModel: payload?.okrViewModel || null,
    sections: Array.isArray(payload?.sections) ? payload.sections : [],
    framingContext: payload?.framingContext || null,
    summary: payload?.summary || null,
  };
}

function getLatestAssistantResponse(messages) {
  const latestAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (!latestAssistant) return null;
  return latestAssistant?.metadataJson?.response || null;
}

// ---------------------------------------------------------------------------
// Metric helpers
// ---------------------------------------------------------------------------

function bulletLinesFromAnswer(answerText) {
  const raw = answerText.split(/\r?\n/g);
  const bullets = [];
  for (const line of raw) {
    if (/^-\s+/.test(line.trim())) {
      bullets.push(line);
    } else if (bullets.length > 0 && line.trim() && /^\s/.test(line)) {
      bullets[bullets.length - 1] += " " + line.trim();
    }
  }
  return bullets;
}

function metricFromAnswer(answerText) {
  const bullets = bulletLinesFromAnswer(answerText);
  const markerCounts = bullets.map((line) => (line.match(/\[\d+\]/g) || []).length);
  const citationsPerBullet = markerCounts.length > 0 ? markerCounts : [];
  return { bulletsCount: bullets.length, citationsPerBullet, bulletLines: bullets };
}

function hasOwnerDate(answerText) {
  const ownerLike = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/.test(answerText) || /\bowner:\s*\w+/i.test(answerText);
  const dateLike =
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?\b/i.test(answerText) ||
    /\b\d{4}-\d{2}-\d{2}\b/.test(answerText) ||
    /\bQ[1-4]\s+\d{4}\b/i.test(answerText);
  return { ownerLike, dateLike };
}

function buildPerSourceCounts(retrievedChunks) {
  const counts = {};
  for (const chunk of retrievedChunks) {
    const key = chunk?.sourceId || chunk?.source_id || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Retrieval + evidence diagnostics
// ---------------------------------------------------------------------------

function extractDiagnostics(shape, requestLatency) {
  const { bulletsCount, citationsPerBullet, bulletLines } = metricFromAnswer(shape.answerText);

  const evidence = Array.isArray(shape.details?.evidenceBySource) ? shape.details.evidenceBySource : [];
  const evidenceListSourceKeys = evidence.map((e) => e?.sourceKey || e?.sourceId || e?.id).filter(Boolean);

  const uniqueSourcesRetrieved = new Set(
    (shape.retrievedChunks || []).map((c) => c?.sourceId || c?.source_id).filter(Boolean),
  );
  const uniqueSourcesCited = new Set(
    shape.citations.map((c) => c?.sourceId).filter(Boolean),
  );

  const perSourceCounts = buildPerSourceCounts(shape.retrievedChunks || []);

  const totalMs = Number(shape.timing?.totalMs || requestLatency || 0);
  const retrievalMs = Number(shape.timing?.retrievalMs || 0);
  const generationMs = Number(shape.timing?.llmMs || shape.timing?.generationMs || 0);
  const rerankMs = Number(shape.timing?.rerankMs || 0);

  return {
    intent: shape.intent,
    intentType: shape.intentType,
    kind: shape.kind,
    retrievalMs,
    generationMs,
    rerankMs,
    totalMs,
    retrievedCandidatesCount: (shape.retrievedChunks || []).length,
    finalTopK: shape.retrievalTopK,
    uniqueSourcesRetrieved: uniqueSourcesRetrieved.size,
    uniqueSourcesCited: uniqueSourcesCited.size,
    perSourceCounts,
    bulletLines,
    bulletsCount,
    citationsPerBullet,
    evidenceListSourceKeys,
    evidenceCount: evidence.length,
    sectionsCount: shape.sections?.length || 0,
    hasFramingContext: !!shape.framingContext,
    hasSummary: !!shape.summary,
    hasOkrViewModel: !!shape.okrViewModel,
    keyFactsCount: shape.keyFacts?.length || 0,
    relatedSourcesCount: shape.relatedSources?.length || 0,
    traceId: shape.debug?.traceId || null,
    usedFallback: shape.debug?.usedFallback || false,
  };
}

// ---------------------------------------------------------------------------
// Deterministic scoring functions (ground truth based)
// ---------------------------------------------------------------------------

/**
 * scoreCoverage: 0–100
 * Match must_include patterns against summary table cells only (not full narrative).
 * Supports must_include_variants for flexible matching.
 */
function scoreCoverage(payload, gt) {
  if (!gt || !gt.must_include || gt.must_include.length === 0) return { score: 100, failures: [] };

  // Build text from summary rows (items + details + owner + status fields)
  const rows = payload.summaryRows || [];
  const rowParts = [];
  for (const r of rows) {
    rowParts.push(String(r.item || r.text || ""));
    rowParts.push(String(r.details || ""));
    rowParts.push(String(r.owner || ""));
    rowParts.push(String(r.impact || ""));
    rowParts.push(String(r.status || ""));
    rowParts.push(String(r.target || ""));
    rowParts.push(String(r.current || ""));
    rowParts.push(String(r.due || ""));
    rowParts.push(String(r.amount || ""));
    rowParts.push(String(r.category || ""));
    rowParts.push(String(r.component || ""));
    rowParts.push(String(r.cost || ""));
    rowParts.push(String(r.rationale || ""));
    rowParts.push(String(r.milestone || ""));
    rowParts.push(String(r.date || ""));
  }
  // Also include sections items if summaryRows is empty (some intents use sections)
  const sections = payload.sections || [];
  for (const sec of sections) {
    for (const it of (sec.items || [])) {
      rowParts.push(String(it.text || it.item || ""));
      rowParts.push(String(it.target || ""));
      rowParts.push(String(it.current || ""));
      rowParts.push(String(it.owner || ""));
      rowParts.push(String(it.status || ""));
      rowParts.push(String(it.due || ""));
    }
  }
  // Include narrative as a fallback (some facts may only appear there for broad queries)
  const narrative = String(payload.narrative || payload.framingContext || "");
  const answer = String(payload.answer || "");
  const combinedText = rowParts.join(" ") + " " + narrative + " " + answer;

  let matched = 0;
  const failures = [];
  const variants = gt.must_include_variants || {};

  for (const pattern of gt.must_include) {
    const allVariants = variants[pattern] ? [pattern, ...variants[pattern]] : [pattern];
    let found = false;
    for (const v of allVariants) {
      const re = new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      if (re.test(combinedText)) { found = true; break; }
    }
    if (found) {
      matched += 1;
    } else {
      failures.push(pattern);
    }
  }
  const score = Math.round((matched / gt.must_include.length) * 100);
  return { score, failures };
}

/**
 * Infer canonical source type from title/name (mirrors server-side inferCanonicalSourceType)
 */
function inferSourceType(title) {
  const t = (title || "").toLowerCase();
  if (/\b(?:[a-z]{2,}-\d+|ticket|issue|bug|jira)\b/.test(t)) return "jira_ticket";
  if (/\b(all[- ]?hands|meeting notes|standup|retro|minutes)\b/.test(t)) return "meeting_notes";
  if (/\b(roadmap|timeline|milestone|release plan)\b/.test(t)) return "roadmap_doc";
  if (/\b(okr|objective|key result|kpi|budget)\b/.test(t)) return "okr_doc";
  if (/\b(architecture|design doc|system design|component)\b/.test(t)) return "architecture_doc";
  if (/\b(handbook|guide|reference|runbook|playbook)\b/.test(t)) return "team_directory";
  return "other";
}

/**
 * scoreEvidenceValidity: 0–100
 * Checks: evidence subset of allowed_sources, no banned sources,
 * source types match allowed_source_types, no disallowed types
 */
function scoreEvidenceValidity(payload, gt) {
  const failures = [];

  const evidenceItems = Array.isArray(payload.evidence) ? payload.evidence : [];
  const sources = Array.isArray(payload.sources) ? payload.sources : [];

  const evidenceTitles = evidenceItems.map((e) => String(e.title || e.name || "")).filter(Boolean);
  const sourceTitles = sources.map((s) => String(s.title || s.name || "")).filter(Boolean);
  const allTitles = [...new Set([...evidenceTitles, ...sourceTitles])];

  // Check: evidence must be subset of allowed_sources (if specified)
  if (gt.allowed_sources && gt.allowed_sources.length > 0) {
    for (const title of allTitles) {
      const isAllowed = gt.allowed_sources.some((allowed) =>
        title.toLowerCase().includes(allowed.toLowerCase()) ||
        allowed.toLowerCase().includes(title.toLowerCase().split(/[\s_-]/)[0])
      );
      if (!isAllowed) {
        failures.push(`evidence_not_allowed: "${title}"`);
      }
    }
  }

  // Check: no banned sources in evidence
  if (gt.banned_sources_for_query && gt.banned_sources_for_query.length > 0) {
    for (const title of allTitles) {
      const isBanned = gt.banned_sources_for_query.some((banned) =>
        title.toLowerCase().includes(banned.toLowerCase())
      );
      if (isBanned) {
        failures.push(`banned_source_present: "${title}"`);
      }
    }
  }

  // Check: evidence types match allowed_source_types
  if (gt.allowed_source_types && gt.allowed_source_types.length > 0) {
    for (const title of allTitles) {
      const sType = inferSourceType(title);
      if (!gt.allowed_source_types.includes(sType) && sType !== "other") {
        failures.push(`source_type_not_allowed: "${title}" (type=${sType})`);
      }
    }
  }

  // Check: no disallowed source types
  if (gt.disallowed_source_types && gt.disallowed_source_types.length > 0) {
    for (const title of allTitles) {
      const sType = inferSourceType(title);
      if (gt.disallowed_source_types.includes(sType)) {
        failures.push(`disallowed_source_type: "${title}" (type=${sType})`);
      }
    }
  }

  return { score: failures.length === 0 ? 100 : 0, failures };
}

/**
 * scoreEvidenceExactness: 0–100
 * Evidence list must exactly equal unique(citations_used) — no phantoms, no missing.
 */
function scoreEvidenceExactness(payload) {
  const failures = [];
  const evidenceItems = Array.isArray(payload.evidence) ? payload.evidence : [];
  const evidenceTitles = new Set(
    evidenceItems.map((e) => String(e.title || e.name || "").toLowerCase()).filter(Boolean)
  );

  // Collect all cited source titles from summary rows
  const rows = payload.summaryRows || [];
  const sections = payload.sections || [];
  const citedSourceIds = new Set();
  for (const r of rows) {
    for (const cid of (r.citationIds || [])) {
      citedSourceIds.add(String(cid));
    }
  }
  for (const sec of sections) {
    for (const it of (sec.items || [])) {
      for (const c of (it.citations || [])) {
        if (c.sourceId) citedSourceIds.add(String(c.sourceId));
      }
    }
  }

  // If we have citationIndexMap, use it to map indices to source titles
  const indexMap = payload.citationIndexMap || {};
  const citedTitles = new Set();
  for (const [title, idx] of Object.entries(indexMap)) {
    citedTitles.add(title.toLowerCase());
  }

  // Phantom evidence: in evidence but not cited
  for (const evTitle of evidenceTitles) {
    if (citedTitles.size > 0 && !citedTitles.has(evTitle)) {
      failures.push(`phantom_evidence: "${evTitle}"`);
    }
  }

  // Missing evidence: cited but not in evidence list
  for (const citedTitle of citedTitles) {
    if (!evidenceTitles.has(citedTitle)) {
      failures.push(`missing_evidence: "${citedTitle}"`);
    }
  }

  return { score: failures.length === 0 ? 100 : 0, failures };
}

/**
 * scoreRowCitationIntegrity: 0–100
 * For each summaryRows entry: (row.citationIds || []).length > 0
 */
function scoreRowCitationIntegrity(payload) {
  const rows = payload.summaryRows || [];
  if (rows.length === 0) return { score: 100, failures: [] };
  let withCitations = 0;
  const failures = [];
  for (let i = 0; i < rows.length; i++) {
    const ids = rows[i].citationIds || [];
    if (ids.length > 0) {
      withCitations += 1;
    } else {
      failures.push(`row_${i}_no_citation: "${String(rows[i].item || rows[i].text || "").slice(0, 60)}"`);
    }
  }
  return { score: Math.round((withCitations / rows.length) * 100), failures };
}

/**
 * scoreTone: 0–100 (pass threshold >= 90)
 * Checks narrative sentences count, no banned openers, ends with ?, no banned phrases, no emojis.
 * Uses narrative (framingContext) ONLY — not full answer text.
 */
function scoreTone(payload, invariants, isDocIntent) {
  if (!invariants) return { score: 100, failures: [] };
  const narrative = String(payload.narrative || payload.framingContext || "");
  if (isDocIntent && !narrative.trim()) {
    return { score: 0, failures: ["narrative_missing_for_doc_intent"] };
  }
  if (!narrative.trim()) return { score: 100, failures: [] };
  const failures = [];
  let score = 100;

  // Count narrative sentences
  const sentences = narrative.split(/(?<=[.?!])\s+/).filter((s) => s.trim().length > 0);
  const sentCount = sentences.length;
  if (sentCount < invariants.min_narrative_sentences || sentCount > invariants.max_narrative_sentences) {
    failures.push(`sentence_count_${sentCount}_not_in_[${invariants.min_narrative_sentences},${invariants.max_narrative_sentences}]`);
    score -= 20;
  }

  // No banned openers in first sentence
  const firstSentence = sentences[0] || "";
  if (invariants.banned_openers) {
    for (const opener of invariants.banned_openers) {
      const re = new RegExp("^" + opener, "i");
      if (re.test(firstSentence.trim())) {
        failures.push(`banned_opener: "${opener}"`);
        score -= 20;
        break;
      }
    }
  }

  // Must end with question
  if (invariants.must_end_with_question && !/\?\s*$/.test(narrative.trim())) {
    failures.push("does_not_end_with_question");
    score -= 20;
  }

  // No banned phrases
  if (invariants.banned_narrative_phrases) {
    for (const phrase of invariants.banned_narrative_phrases) {
      if (narrative.includes(phrase)) {
        failures.push(`banned_phrase: "${phrase}"`);
        score -= 20;
        break;
      }
    }
  }

  // No emojis
  if (invariants.no_emojis && /[\u{1F300}-\u{1FFFF}]/u.test(narrative)) {
    failures.push("contains_emoji");
    score -= 20;
  }

  return { score: Math.max(0, score), failures };
}

/**
 * computeDeterministicScore: combines 5 score functions
 * Returns { coverage, evidenceValidity, evidenceExactness, rowCitationIntegrity, tone, pass, failures }
 */
function computeDeterministicScore(queryKey, payload) {
  if (!GROUND_TRUTH) {
    return { coverage: null, evidenceValidity: null, evidenceExactness: null, rowCitationIntegrity: null, tone: null, pass: true, failures: [] };
  }
  const gt = GROUND_TRUTH.queries && GROUND_TRUTH.queries[queryKey];
  const toneInvariants = GROUND_TRUTH.tone_invariants;
  const DOC_INTENT_CATEGORIES = ["okr", "architecture", "roadmap", "budget", "owner_deadline"];
  const queryDef = QUERIES_DEMO10.find((q) => q.key === queryKey);
  const isDocIntent = queryDef ? DOC_INTENT_CATEGORIES.includes(queryDef.category) : false;

  const coverageResult = gt ? scoreCoverage(payload, gt) : { score: 100, failures: [] };
  const evidenceResult = gt ? scoreEvidenceValidity(payload, gt) : { score: 100, failures: [] };
  const exactnessResult = scoreEvidenceExactness(payload);
  const rowResult = scoreRowCitationIntegrity(payload);
  const toneResult = scoreTone(payload, toneInvariants, isDocIntent);

  const allFailures = [
    ...coverageResult.failures.map((f) => `coverage:${f}`),
    ...evidenceResult.failures.map((f) => `evidence:${f}`),
    ...exactnessResult.failures.map((f) => `exactness:${f}`),
    ...rowResult.failures.map((f) => `row:${f}`),
    ...toneResult.failures.map((f) => `tone:${f}`),
  ];

  const pass =
    coverageResult.score === 100 &&
    evidenceResult.score === 100 &&
    exactnessResult.score === 100 &&
    rowResult.score === 100 &&
    toneResult.score >= 90;

  return {
    coverage: coverageResult.score,
    coverageFailures: coverageResult.failures,
    evidenceValidity: evidenceResult.score,
    evidenceFailures: evidenceResult.failures,
    evidenceExactness: exactnessResult.score,
    exactnessFailures: exactnessResult.failures,
    rowCitationIntegrity: rowResult.score,
    rowFailures: rowResult.failures,
    tone: toneResult.score,
    toneFailures: toneResult.failures,
    pass,
    failures: allFailures,
  };
}

// ---------------------------------------------------------------------------
// Pass/fail metrics (existing logic preserved)
// ---------------------------------------------------------------------------

function computeMetrics(query, shape) {
  const { bulletsCount, citationsPerBullet } = metricFromAnswer(shape.answerText);
  const uniqueSourcesCited = new Set(shape.citations.map((c) => c?.sourceId).filter(Boolean));
  const evidence = Array.isArray(shape.details?.evidenceBySource) ? shape.details.evidenceBySource : [];
  const evidenceSourceKeys = new Set(
    evidence
      .map((e) => e?.sourceKey || e?.sourceId || e?.id)
      .filter(Boolean),
  );
  const unusedEvidenceSources = [...evidenceSourceKeys].filter((k) => !uniqueSourcesCited.has(k));
  const allBulletsCited =
    bulletsCount === 0 ? false : citationsPerBullet.length === bulletsCount && citationsPerBullet.every((n) => n >= 1);
  const trailingQuestion = /\?\s*$/.test(shape.answerText.trim());
  const clarifyingAsked = shape.needsClarification || shape.clarifyingQuestions.length > 0 || trailingQuestion;
  const ownerDate = hasOwnerDate(shape.answerText);
  const ownerDateSatisfied =
    query.category !== "owner_deadline" ||
    ((ownerDate.ownerLike && ownerDate.dateLike) || clarifyingAsked);
  const totalMs = Number(shape.timing?.totalMs || 0);
  const retrievalMs = Number(shape.timing?.retrievalMs || 0);
  const generationMs = Number(shape.timing?.llmMs || shape.timing?.generationMs || 0);
  const retrievalTopK = Number(shape.retrievalTopK || shape.retrievedChunks.length || 0);
  const boundedTopK = retrievalTopK > 0 && retrievalTopK <= 20;
  const multiSourceSatisfied =
    !query.requiresMultiSource ||
    uniqueSourcesCited.size >= 2 ||
    clarifyingAsked ||
    (bulletsCount < 2 && uniqueSourcesCited.size >= 1);

  const hasHardRefusal = /couldn.?t reliably cite/i.test(shape.answerText);
  const enterpriseShapeOk =
    query.category === "smalltalk" ||
    ((bulletsCount >= 2 && allBulletsCited) || clarifyingAsked);

  const contentFailures = SUITE_ARG === "demo10"
    ? checkExpectedContent(query.key, shape.answerText)
    : [];
  const contentOk = contentFailures.length === 0;

  // Summary chip validation: each row's citationIds should be non-empty (except smalltalk)
  const summaryRows = shape.details?.summaryRows || [];
  const summaryChipsOk = query.category === "smalltalk" || summaryRows.length === 0 ||
    summaryRows.every((row) => (row.citationIds || []).length > 0);

  const pass =
    !hasHardRefusal &&
    enterpriseShapeOk &&
    ownerDateSatisfied &&
    unusedEvidenceSources.length === 0 &&
    (query.category === "smalltalk" || uniqueSourcesCited.size >= 1 || clarifyingAsked) &&
    (query.category === "smalltalk" || boundedTopK) &&
    multiSourceSatisfied &&
    contentOk &&
    summaryChipsOk;

  return {
    pass,
    bullets_count: bulletsCount,
    citations_per_bullet: citationsPerBullet,
    all_bullets_cited: allBulletsCited,
    unique_sources_cited: uniqueSourcesCited.size,
    unused_evidence_sources: unusedEvidenceSources,
    owner_present: ownerDate.ownerLike,
    date_present: ownerDate.dateLike,
    owner_date_or_clarify: ownerDateSatisfied,
    needs_clarification: clarifyingAsked,
    latency_ms: totalMs,
    retrieval_ms: retrievalMs,
    generation_ms: generationMs,
    retrieval_topK: retrievalTopK,
    bounded_topK: boundedTopK,
    multi_source_satisfied: multiSourceSatisfied,
    has_hard_refusal: hasHardRefusal,
    content_failures: contentFailures,
    content_ok: contentOk,
    summary_chips_ok: summaryChipsOk,
  };
}

// ---------------------------------------------------------------------------
// Per-query artifact writer
// ---------------------------------------------------------------------------

function writeRunArtifact(run, queryKey, artifact) {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const filename = `run${run}_${queryKey}_${Date.now()}.json`;
  const filepath = path.join(RUNS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(artifact, null, 2), "utf8");
  return filepath;
}

// Empty diagnostics object for error paths
function emptyDiagnostics() {
  return {
    intent: null,
    intentType: null,
    kind: null,
    retrievalMs: 0,
    generationMs: 0,
    rerankMs: 0,
    totalMs: 0,
    retrievedCandidatesCount: 0,
    finalTopK: 0,
    uniqueSourcesRetrieved: 0,
    uniqueSourcesCited: 0,
    perSourceCounts: {},
    bulletLines: [],
    bulletsCount: 0,
    citationsPerBullet: [],
    evidenceListSourceKeys: [],
    evidenceCount: 0,
    sectionsCount: 0,
    hasFramingContext: false,
    hasSummary: false,
    hasOkrViewModel: false,
    keyFactsCount: 0,
    relatedSourcesCount: 0,
    traceId: null,
    usedFallback: false,
  };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const start = Date.now();
  const baseHeaders = {};
  if (QA_BYPASS_TOKEN) {
    baseHeaders["x-qa-bypass"] = QA_BYPASS_TOKEN;
    console.log("[rag_quality_gate] x-qa-bypass header will be sent (rate-limit bypass)");
  }
  const cookies = {};

  const loginResp = await requestWithRetry({
    method: "POST",
    url: `${BASE_URL}/api/auth/login`,
    body: { email: EMAIL, password: PASSWORD },
    headers: baseHeaders,
  });
  if (loginResp.status !== 200) {
    throw new Error(`Login failed: ${loginResp.status} ${await loginResp.text()}`);
  }
  const loginBody = await loginResp.json();
  const csrfToken = loginBody?.csrfToken;
  if (!csrfToken) throw new Error("Login response missing csrfToken");
  Object.assign(cookies, parseSetCookie(loginResp.headers.get("set-cookie")));
  if (!cookies.session || !cookies._csrf) {
    throw new Error("Login response missing session/_csrf cookies");
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    runs: RUNS,
    demoMode: DEMO_MODE,
    config: {
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
      retries: MAX_RETRIES,
      max429Retries: MAX_429_RETRIES,
      interQueryDelayMs: INTER_QUERY_DELAY_MS,
    },
    results: [],
    summary: {
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 0,
      elapsedMs: 0,
    },
  };

  for (let run = 1; run <= RUNS; run += 1) {
    for (const query of QUERIES) {
      const cookieHeader = buildCookieHeader(cookies);
      let httpStatus = null;
      let errorResponseBody = null;
      try {
        const convResp = await requestAllowing429Retry({
          method: "POST",
          url: `${BASE_URL}/api/conversations`,
          headers: {
            ...baseHeaders,
            cookie: cookieHeader,
            "x-csrf-token": csrfToken,
            ...(DEMO_MODE ? { "x-demo-mode": DEMO_MODE } : {}),
          },
          body: { title: `rag-quality-${query.key}-${run}` },
        });
        if (convResp.status !== 200 && convResp.status !== 201) {
          throw new Error(`conversation_status_${convResp.status}`);
        }
        const conv = await convResp.json();

        const t0 = Date.now();
        const chatResp = await requestAllowing429Retry({
          method: "POST",
          url: `${BASE_URL}/api/chat`,
          headers: {
            ...baseHeaders,
            cookie: cookieHeader,
            "x-csrf-token": csrfToken,
            ...(DEMO_MODE ? { "x-demo-mode": DEMO_MODE } : {}),
          },
          body: { conversationId: conv.id, message: query.text },
        });
        const requestLatency = Date.now() - t0;
        httpStatus = chatResp.status;
        if (chatResp.status !== 200) {
          errorResponseBody = await chatResp.json().catch(() => null);
          throw new Error(`chat_status_${chatResp.status}`);
        }
        const rawPayload = await chatResp.json();
        let shape = extractResponseShape(rawPayload);

        const msgResp = await requestWithRetry({
          method: "GET",
          url: `${BASE_URL}/api/conversations/${conv.id}/messages`,
          headers: { ...baseHeaders, cookie: cookieHeader },
        });
        if (msgResp.status === 200) {
          const messages = await msgResp.json();
          const metaResponse = getLatestAssistantResponse(messages);
          if (metaResponse) {
            shape = extractResponseShape({
              ...rawPayload,
              ...metaResponse,
              answer_text: metaResponse.answer_text || rawPayload.answer_text || rawPayload.answer,
              answer: metaResponse.answer || rawPayload.answer,
              details: metaResponse.details || rawPayload.details,
            });
          }
        }

        if (!shape.timing || Object.keys(shape.timing).length === 0) {
          shape.timing = { totalMs: requestLatency };
        }

        const metrics = computeMetrics(query, shape);
        const diagnostics = extractDiagnostics(shape, requestLatency);

        // Fetch full captured payload for deterministic scoring (if capture is enabled)
        let deterministicScore = null;
        const CAPTURE_ENABLED = process.env.TRACEPILOT_CAPTURE_CHAT_PAYLOAD === "true";
        if (CAPTURE_ENABLED && GROUND_TRUTH) {
          try {
            const captureResp = await requestWithRetry({
              method: "GET",
              url: `${BASE_URL}/api/dev/last-chat-payload?limit=1`,
              headers: { ...baseHeaders, cookie: cookieHeader },
            });
            if (captureResp.status === 200) {
              const captureEntries = await captureResp.json();
              const capturedPayload = Array.isArray(captureEntries) ? captureEntries[0] : captureEntries;
              if (capturedPayload) {
                deterministicScore = computeDeterministicScore(query.key, capturedPayload);
                if (!deterministicScore.pass) {
                  console.log(`  [det-score] ${query.key} FAIL: ${deterministicScore.failures.join("; ")}`);
                }
              }
            }
          } catch (detErr) {
            console.warn(`  [det-score] Could not fetch captured payload: ${detErr.message}`);
          }
        }

        const existingGatePass = metrics.pass;
        const finalPass = existingGatePass && (deterministicScore ? deterministicScore.pass : true);

        const failureReason = finalPass ? null : (
          deterministicScore && !deterministicScore.pass
            ? `det_score:${deterministicScore.failures[0] || "unknown"}`
            : inferFailureReason(metrics, query)
        );
        const resultEntry = {
          run,
          query: query.text,
          key: query.key,
          category: query.category,
          pass: finalPass,
          failureReason,
          metrics,
          deterministicScore,
          diagnostics,
          payload: {
            answer_text: shape.answerText,
            framingContext: shape.framingContext,
            summary: shape.summary,
            sections: shape.sections,
            keyFacts: shape.keyFacts,
            relatedSources: shape.relatedSources,
            citations: shape.citations,
            sources_used: shape.sourcesUsed,
            retrieved_chunks: shape.retrievedChunks,
            timings: shape.timing,
            details: shape.details,
          },
        };
        report.results.push(resultEntry);
        writeRunArtifact(run, query.key, resultEntry);
      } catch (error) {
        const failureReason = classifyFailure(error, httpStatus, errorResponseBody);
        const resultEntry = {
          run,
          query: query.text,
          key: query.key,
          category: query.category,
          pass: false,
          failureReason,
          metrics: {
            pass: false,
            bullets_count: 0,
            citations_per_bullet: [],
            all_bullets_cited: false,
            unique_sources_cited: 0,
            unused_evidence_sources: [],
            owner_present: false,
            date_present: false,
            owner_date_or_clarify: false,
            needs_clarification: false,
            latency_ms: 0,
            retrieval_ms: 0,
            generation_ms: 0,
            retrieval_topK: 0,
            bounded_topK: false,
            multi_source_satisfied: false,
            has_hard_refusal: false,
          },
          diagnostics: emptyDiagnostics(),
          payload: {
            error: String(error?.message || error),
            httpStatus,
            answer_text: "",
            citations: [],
            sources_used: [],
            retrieved_chunks: [],
            timings: {},
            details: {},
          },
        };
        report.results.push(resultEntry);
        writeRunArtifact(run, query.key, resultEntry);
      }
      if (INTER_QUERY_DELAY_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, INTER_QUERY_DELAY_MS));
      }
    }
  }

  report.summary.totalChecks = report.results.length;
  report.summary.passedChecks = report.results.filter((r) => r.pass).length;
  report.summary.failedChecks = report.summary.totalChecks - report.summary.passedChecks;
  report.summary.elapsedMs = Date.now() - start;

  // --- Quality gate table ---
  const table = report.results.map((r) => ({
    run: r.run,
    query: r.key,
    pass: r.pass ? "PASS" : "FAIL",
    reason: r.failureReason || "",
    bullets: r.metrics.bullets_count,
    cited: r.metrics.all_bullets_cited ? "yes" : "no",
    srcCited: r.metrics.unique_sources_cited,
    unusedEv: r.metrics.unused_evidence_sources.length,
    topK: r.metrics.retrieval_topK,
    latMs: r.metrics.latency_ms,
  }));

  console.log("\n=== RAG QUALITY GATE ===");
  console.table(table);

  // --- Deterministic score table (demo10 + ground truth) ---
  const hasDetScores = report.results.some((r) => r.deterministicScore !== null);
  if (hasDetScores) {
    const detTable = report.results.map((r) => {
      const ds = r.deterministicScore || {};
      return {
        query: r.key,
        coverage: ds.coverage != null ? ds.coverage : "-",
        evidVal: ds.evidenceValidity != null ? ds.evidenceValidity : "-",
        evidExact: ds.evidenceExactness != null ? ds.evidenceExactness : "-",
        rowCite: ds.rowCitationIntegrity != null ? ds.rowCitationIntegrity : "-",
        tone: ds.tone != null ? ds.tone : "-",
        detPass: ds.pass != null ? (ds.pass ? "PASS" : "FAIL") : "-",
        failures: (ds.failures || []).slice(0, 3).join("; "),
      };
    });
    console.log("\n=== DETERMINISTIC SCORES ===");
    console.table(detTable);
  }

  // --- Retrieval + evidence diagnostics table ---
  const diagTable = report.results.map((r) => ({
    query: r.key,
    intent: r.diagnostics.intent || "-",
    retMs: r.diagnostics.retrievalMs,
    genMs: r.diagnostics.generationMs,
    totMs: r.diagnostics.totalMs,
    cands: r.diagnostics.retrievedCandidatesCount,
    topK: r.diagnostics.finalTopK,
    srcRetr: r.diagnostics.uniqueSourcesRetrieved,
    srcCite: r.diagnostics.uniqueSourcesCited,
    evKeys: r.diagnostics.evidenceListSourceKeys.length,
    sects: r.diagnostics.sectionsCount,
    facts: r.diagnostics.keyFactsCount,
    fallbk: r.diagnostics.usedFallback ? "Y" : "",
  }));

  console.log("\n=== RETRIEVAL + EVIDENCE DIAGNOSTICS ===");
  console.table(diagTable);

  // --- Per-source chunk breakdown ---
  for (const r of report.results) {
    const srcKeys = Object.keys(r.diagnostics.perSourceCounts);
    if (srcKeys.length > 0) {
      const summary = srcKeys
        .map((k) => `${k.length > 16 ? k.slice(0, 14) + ".." : k}=${r.diagnostics.perSourceCounts[k]}`)
        .join(", ");
      console.log(`  [${r.key}] perSourceCounts: ${summary}`);
    }
  }

  // --- Full output: answer, summary, documents, evidence ---
  if (FULL_OUTPUT) {
    console.log("\n" + "=".repeat(80));
    console.log("FULL ANSWERS, SUMMARIES & EVIDENCE");
    console.log("=".repeat(80));
    for (const r of report.results) {
      const p = r.payload || {};
      const failTag = r.pass ? "" : ` [FAIL: ${r.failureReason || "unknown"}]`;
      console.log(`\n### QUERY: ${r.query}${failTag}`);
      console.log("-".repeat(60));
      if (p.framingContext) console.log(`\nFraming: ${p.framingContext}`);
      if (p.summary) console.log(`\nSummary: ${p.summary}`);
      console.log(`\nAnswer:\n${p.answer_text || "(no answer)"}`);
      if (Array.isArray(p.sections) && p.sections.length > 0) {
        console.log("\nSections:");
        for (const sec of p.sections) {
          console.log(`  - ${sec.heading || sec.title || "Section"}`);
          for (const it of sec.items || []) {
            const cites = it.citations?.map((c) => c.sourceId).filter(Boolean) || [];
            console.log(`    • ${(it.text || it.item || "").slice(0, 120)}${cites.length ? ` [${cites.join(",")}]` : ""}`);
          }
        }
      }
      if (Array.isArray(p.keyFacts) && p.keyFacts.length > 0) {
        console.log("\nKey Facts:");
        for (const f of p.keyFacts) {
          const srcs = f.sourceIds || f.sourceId ? [f.sourceId] : [];
          console.log(`  - ${(f.text || f.fact || JSON.stringify(f)).slice(0, 120)}${srcs.length ? ` [${srcs.join(",")}]` : ""}`);
        }
      }
      const sources = p.sources_used || [];
      if (sources.length > 0) {
        console.log("\nSources Cited:");
        for (const s of sources) {
          const id = s.sourceId || s.id || "?";
          const title = s.title || s.name || id;
          console.log(`  [${id}] ${title}`);
        }
      }
      const citations = p.citations || [];
      if (citations.length > 0) {
        console.log("\nCitations:");
        for (let i = 0; i < citations.length; i++) {
          const c = citations[i];
          console.log(`  [${i + 1}] source=${c.sourceId} chunk=${c.chunkId} ${c.snippet ? `snippet="${String(c.snippet).slice(0, 80)}..."` : ""}`);
        }
      }
      const evidence = p.details?.evidenceBySource || [];
      if (evidence.length > 0) {
        console.log("\nEvidence by Source:");
        for (const e of evidence) {
          const key = e.sourceKey || e.sourceId || e.id;
          const excerpts = e.excerpts || [];
          console.log(`  ${key}: ${excerpts.length} excerpt(s)`);
        }
      }
      if (!r.pass && r.failureReason) {
        console.log(`\n>>> FAILURE DIAGNOSIS: ${r.failureReason}`);
        if (r.failureReason === "multi_source_required") {
          console.log("    This query requires 2+ distinct sources to be cited (requiresMultiSource=true).");
          console.log(`    Actual unique sources cited: ${r.metrics?.unique_sources_cited || 0}`);
        }
        if (r.failureReason === "bullets_missing_citations") {
          console.log("    Some bullet points are missing [N] citation markers.");
          console.log(`    Citations per bullet: ${JSON.stringify(r.metrics?.citations_per_bullet || [])}`);
        }
        if (r.failureReason === "no_sources_cited") {
          console.log("    No sources were cited in the answer.");
        }
      }
    }
    console.log("\n" + "=".repeat(80));
  }

  // Reliability summary: per-query pass rate across runs
  if (RUNS > 1) {
    console.log("\n=== RELIABILITY SUMMARY (per query across runs) ===");
    const queryKeys = [...new Set(report.results.map((r) => r.key))];
    const reliabilityTable = queryKeys.map((key) => {
      const runs = report.results.filter((r) => r.key === key);
      const passed = runs.filter((r) => r.pass).length;
      return { query: key, runs: runs.length, passed, failed: runs.length - passed, rate: `${passed}/${runs.length}` };
    });
    console.table(reliabilityTable);
    const allPass9of10 = reliabilityTable.every((r) => r.passed >= r.runs - 1);
    const noQueryFails2x = reliabilityTable.every((r) => r.failed <= 1);
    console.log(`All queries pass >= N-1 runs: ${allPass9of10 ? "YES" : "NO"}`);
    console.log(`No query fails more than once: ${noQueryFails2x ? "YES" : "NO"}`);
  }

  console.log(
    `\nSummary: ${report.summary.passedChecks}/${report.summary.totalChecks} passed | elapsed=${report.summary.elapsedMs}ms`,
  );

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  console.log(`Report written: ${REPORT_PATH}`);
  console.log(`Per-query artifacts: ${RUNS_DIR}/`);

  // Verbose output directory
  const VERBOSE_DIR = path.join(TMP_DIR, "rag_quality_verbose");
  if (FULL_OUTPUT || SUITE_ARG === "demo10") {
    fs.mkdirSync(VERBOSE_DIR, { recursive: true });
    for (const r of report.results) {
      const fname = `${r.key}_run${r.run}.json`;
      fs.writeFileSync(path.join(VERBOSE_DIR, fname), JSON.stringify(r, null, 2), "utf8");
    }
    console.log(`Verbose artifacts: ${VERBOSE_DIR}/`);
  }

  if (report.summary.failedChecks > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[rag_quality_gate] failed:", error?.message || error);
  process.exit(1);
});
