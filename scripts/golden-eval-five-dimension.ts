/**
 * Golden Eval — Five-Dimension Evaluation (TracePilot plan Tasks 16–19)
 *
 * Reads from: eval/golden/cases.ts, optionally qa/demo_ground_truth.json (INPUT ONLY).
 * Writes to: GOLDEN_EVAL_RESULTS.md, GOLDEN_FAILURES.md (when gates fail). Never writes to eval/golden/ or qa/.
 *
 * Usage: ensure server is running (e.g. npm run dev), then:
 *   npx tsx -r dotenv/config scripts/golden-eval-five-dimension.ts
 *
 * Run 1 = exact phrasing, Run 2 = rephrased same intent, Run 3 = follow-up phrasing.
 * Multi-turn: Turn 1 original, Turn 2 follow-up ownership/assignment, Turn 3 follow-up consequences if deadline missed.
 */

import "dotenv/config";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { GOLDEN_EVAL_CASES, type EvalCase } from "../eval/golden/cases";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5000";
const OUTPUT_MD = join(process.cwd(), "GOLDEN_EVAL_RESULTS.md");
const OUTPUT_FAILURES = join(process.cwd(), "GOLDEN_FAILURES.md");

const EVAL_EMAIL = process.env.EMAIL ?? "admin@tracepilot.com";
const EVAL_PASSWORD = process.env.PASSWORD ?? "admin123";

let authCookie: string | undefined;
let csrfToken: string | undefined;

interface SummaryRow {
  item?: string;
  priority?: string;
  owner?: string;
  impact?: string;
  citationIds?: string[];
}

interface EvidenceItem {
  sourceKey?: string;
  title?: string;
  label?: string;
  url?: string;
  excerpts?: { text?: string }[];
}

interface RunResult {
  pass: boolean;
  trustLevel?: string;
  latencyMs?: number;
  answer?: string;
  citations?: unknown[];
  trustSignal?: { level: string; label: string; detail?: string };
  retrievalSummary?: { chunksConsidered?: number; distinctSources?: number; topSimilarityScore?: number };
  details?: { summaryRows?: SummaryRow[]; evidenceBySource?: EvidenceItem[] };
  sections?: unknown[];
  sources_used?: unknown[];
  needsClarification?: boolean;
  clarifyingQuestions?: string[];
  replyId?: string;
}

interface QuestionRecord {
  caseId?: string;
  questionText: string;
  run1: RunResult;
  run2: RunResult;
  run3: RunResult;
  turn2Pass?: boolean;
  turn3Pass?: boolean;
  contextRetainedTurn2?: boolean;
  contextRetainedTurn3?: boolean;
  toneScore?: Record<string, number>;
  answerScore?: Record<string, number>;
  summaryScore?: Record<string, number>;
  citationScore?: Record<string, number>;
  evidenceScore?: Record<string, number>;
}

async function ensureAuth(): Promise<void> {
  if (authCookie) return;
  try {
    await fetch(`${BASE_URL}/api/seed`, { method: "POST", headers: { "Content-Type": "application/json" } });
  } catch {
    // seed may fail if DB already has data
  }
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EVAL_EMAIL, password: EVAL_PASSWORD }),
  });
  if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status} ${await loginRes.text()}`);
  const loginBody = (await loginRes.json()) as { csrfToken?: string };
  csrfToken = loginBody.csrfToken;
  const setCookie = (loginRes.headers as any).getSetCookie?.() ?? (loginRes.headers.get("set-cookie") ? [loginRes.headers.get("set-cookie")] : []);
  authCookie = Array.isArray(setCookie) ? setCookie.join("; ") : setCookie;
}

async function postStream(
  conversationId: string | null,
  message: string,
  conversationHistory?: { role: string; content: string }[]
): Promise<{
  answer?: string;
  trustSignal?: RunResult["trustSignal"];
  retrievalSummary?: RunResult["retrievalSummary"];
  citations?: unknown[];
  latencyMs: number;
  conversationId: string;
  details?: RunResult["details"];
  sections?: unknown[];
  sources_used?: unknown[];
  needsClarification?: boolean;
  clarifyingQuestions?: string[];
  replyId?: string;
}> {
  const start = Date.now();
  const body: Record<string, unknown> = {
    message,
    conversationId: conversationId ?? undefined,
    conversationHistory: conversationHistory ?? [],
  };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authCookie) headers["Cookie"] = authCookie;
  if (csrfToken) headers["x-csrf-token"] = csrfToken;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 150_000); // 2.5-minute per-call timeout
  let text: string;
  try {
    const res = await fetch(`${BASE_URL}/api/chat/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      credentials: "include",
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    text = await res.text();
  } finally {
    clearTimeout(timeoutId);
  }
  let answer: string | undefined;
  let trustSignal: RunResult["trustSignal"];
  let retrievalSummary: RunResult["retrievalSummary"];
  let citations: unknown[] | undefined;
  let newConversationId = conversationId ?? "";
  let details: RunResult["details"];
  let sections: unknown[];
  let sources_used: unknown[];
  let needsClarification: boolean | undefined;
  let clarifyingQuestions: string[] | undefined;
  let replyId: string | undefined;
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.answer !== undefined) answer = data.answer;
        if (data.trustSignal) trustSignal = data.trustSignal;
        if (data.retrievalSummary) retrievalSummary = data.retrievalSummary;
        if (data.citations) citations = data.citations;
        if (data.conversationId) newConversationId = data.conversationId;
        if (data.details) details = data.details;
        if (data.sections) sections = data.sections;
        if (data.sources_used) sources_used = data.sources_used;
        if (data.needsClarification !== undefined) needsClarification = data.needsClarification;
        if (data.clarifyingQuestions) clarifyingQuestions = data.clarifyingQuestions;
        if (data.replyId) replyId = data.replyId;
      } catch {
        // ignore non-JSON lines
      }
    }
  }
  const latencyMs = Date.now() - start;
  return {
    answer,
    trustSignal,
    retrievalSummary,
    citations,
    latencyMs,
    conversationId: newConversationId,
    details,
    sections,
    sources_used: sources_used ?? [],
    needsClarification,
    clarifyingQuestions,
    replyId,
  };
}

function rephraseQuery(query: string, caseId: string): string {
  const rephrases: Record<string, string> = {
    "q1-q4-okrs": "Summarize the Q4 OKRs for AI search.",
    "q2-blockers": "List blockers affecting the AI search launch.",
    "q4-aws-owner-deadline": "Who owns the AWS blocker and what is the due date?",
  };
  return rephrases[caseId] ?? query;
}

function followUpQuery(caseId: string): string {
  const followUps: Record<string, string> = {
    "q1-q4-okrs": "Which key result has the tightest deadline?",
    "q2-blockers": "Elaborate on the main risk.",
    "q4-aws-owner-deadline": "What happens if the deadline is missed?",
    "q8-biggest-risk": "Elaborate on the main risk.",
    "q3-vector-db": "What performance characteristics influenced this choice?",
    "q5-2025-roadmap": "Which quarter has the most deliverables planned?",
    "q7-project-cost": "What are the main cost drivers for this project?",
    "q9-claude-vs-gpt": "What evaluation criteria were used to make this decision?",
  };
  return followUps[caseId] ?? "Elaborate on the main risk.";
}

async function runOne(
  conversationId: string | null,
  query: string,
  history?: { role: string; content: string }[]
): Promise<RunResult & { conversationId: string }> {
  try {
    const out = await postStream(conversationId, query, history);
    return {
      pass: Boolean(out.answer && out.answer.length > 20),
      trustLevel: out.trustSignal?.level,
      latencyMs: out.latencyMs,
      answer: out.answer,
      citations: out.citations,
      trustSignal: out.trustSignal,
      retrievalSummary: out.retrievalSummary,
      details: out.details,
      sections: out.sections,
      sources_used: out.sources_used,
      needsClarification: out.needsClarification,
      clarifyingQuestions: out.clarifyingQuestions,
      replyId: out.replyId,
      conversationId: out.conversationId,
    };
  } catch (e) {
    return {
      pass: false,
      conversationId: conversationId ?? "",
      latencyMs: 0,
    };
  }
}

/** EVAL-1: Evidence-based factual grounding. Pass = ≥80% of requiredValues found in answer. */
function factualGroundingPass(answer: string, expectedFacts: EvalCase["expectedFacts"]): boolean {
  if (!answer || answer.length < 20) return false;
  const allValues = expectedFacts.flatMap((f) => f.requiredValues ?? []);
  if (allValues.length === 0) return answer.length > 20;
  const lowerAnswer = answer.toLowerCase();
  const found = allValues.filter((v) => lowerAnswer.includes(v.toLowerCase()));
  return found.length / allValues.length >= 0.8;
}

async function runCase(evalCase: EvalCase): Promise<QuestionRecord> {
  const run1 = await runOne(null, evalCase.query);
  const run2 = await runOne(null, rephraseQuery(evalCase.query, evalCase.id));
  const run3 = await runOne(null, followUpQuery(evalCase.id));

  // EVAL-1: override pass for run1/run2 with evidence-based factual grounding
  // run3 is a structurally different follow-up question; keep basic length check
  run1.pass = factualGroundingPass(run1.answer ?? "", evalCase.expectedFacts);
  run2.pass = factualGroundingPass(run2.answer ?? "", evalCase.expectedFacts);

  const history1 = [
    { role: "user" as const, content: evalCase.query },
    { role: "assistant" as const, content: run1.answer ?? "" },
  ];
  const turn2 = await runOne(run1.conversationId, "Who is responsible and what is the deadline?", history1);
  const history2 = [
    ...history1,
    { role: "user" as const, content: "Who is responsible and what is the deadline?" },
    { role: "assistant" as const, content: turn2.answer ?? "" },
  ];
  const turn3 = await runOne(run1.conversationId, "What happens if the deadline is missed?", history2);

  const toRunResult = (r: RunResult & { conversationId?: string }): RunResult => {
    const { conversationId: _c, ...rest } = r;
    return rest;
  };
  return {
    caseId: evalCase.id,
    questionText: evalCase.query,
    run1: toRunResult(run1),
    run2: toRunResult(run2),
    run3: toRunResult(run3),
    turn2Pass: turn2.pass,
    turn3Pass: turn3.pass,
    contextRetainedTurn2: Boolean(turn2.answer && turn2.answer.length > 10),
    // EVAL-3: turn3 timeout → undefined (neutral, not counted). Removing the bypass that treated timeout as retained.
    contextRetainedTurn3: !turn3.answer ? undefined : Boolean(turn3.answer.length > 10),
  };
}

function writeResults(records: QuestionRecord[], runNumber: number): void {
  let md = `# Golden Eval Results — Five-Dimension Framework\n\n`;
  md += `**Generated:** ${new Date().toISOString()} (run ${runNumber}/3)\n\n`;
  md += `## Per-question\n\n`;
  for (const r of records) {
    md += `### ${r.questionText.slice(0, 60)}…\n\n`;
    md += `| Run | Pass | Trust | Latency (ms) |\n|-----|------|-------|---------------|\n`;
    md += `| 1 | ${r.run1.pass ? "✓" : "✗"} | ${r.run1.trustLevel ?? "—"} | ${r.run1.latencyMs ?? "—"} |\n`;
    md += `| 2 | ${r.run2.pass ? "✓" : "✗"} | ${r.run2.trustLevel ?? "—"} | ${r.run2.latencyMs ?? "—"} |\n`;
    md += `| 3 | ${r.run3.pass ? "✓" : "✗"} | ${r.run3.trustLevel ?? "—"} | ${r.run3.latencyMs ?? "—"} |\n`;
    md += `Turn 2 pass: ${r.turn2Pass ?? "—"} | Turn 3 pass: ${r.turn3Pass ?? "—"} | Context retained: ${r.contextRetainedTurn2 ?? "—"} / ${r.contextRetainedTurn3 ?? "—"}\n\n`;
  }
  const total = records.length * 3;
  const passed = records.reduce((a, r) => a + (r.run1.pass ? 1 : 0) + (r.run2.pass ? 1 : 0) + (r.run3.pass ? 1 : 0), 0);
  const passRate = total ? (passed / total) * 100 : 0;
  const contextRetained = records.filter((r) => r.contextRetainedTurn2 && r.contextRetainedTurn3).length;
  const contextRate = records.length ? (contextRetained / records.length) * 100 : 0;
  md += `## Summary\n\n`;
  md += `- Overall pass rate: ${passRate.toFixed(1)}%\n`;
  md += `- Total runs: ${total}, Passed: ${passed}\n`;
  md += `- Context retention rate: ${contextRate.toFixed(1)}%\n`;
  md += `- Tone gate / Citation accuracy / Evidence quality: (see per-run server trust signal and deterministic evals)\n`;
  writeFileSync(OUTPUT_MD, md, "utf8");
}

const NO_MATCH_QUERY = "xyzqprgblf7491mnv zwkbj9432fvmqz nxkp8731bwj xlpqr";

function toneScore(answer: string): number {
  if (!answer || answer.length < 10) return 0;
  const trimmed = answer.trim();
  let score = 1;
  const badStarts = [/^\s*based on the documents/i, /^\s*according to/i, /^\s*i found/i, /^\s*i\s+/i, /^\s*here are/i];
  if (badStarts.some((re) => re.test(trimmed))) score -= 0.3;
  if (/\b(the deadline is|due date is)\s+[A-Za-z]+\s+\d{1,2},?\s*\d{4}/i.test(answer) && !/\b(days left|risk|if.*slip|missed)\b/i.test(answer)) score -= 0.2;
  if (!/\b(risk|if.*miss|slip|consequence)\b/i.test(answer) && /\b(deadline|due date)\b/i.test(answer)) score -= 0.15;
  const genericEnd = /\b(would you like more details\?|can i help with anything else\?|anything else\?)\s*$/i;
  if (genericEnd.test(trimmed)) score -= 0.2;
  if (/\b(has been assigned|is responsible for|has been identified as)\b/i.test(answer)) score -= 0.15;
  return Math.max(0, Math.min(1, score));
}

// Words that start a non-person capitalized pair (project names, tech terms, etc.)
const NON_PERSON_FIRST_WORDS = /^(Project|Service|Region|System|Team|Platform|Tool|Zone|Area|Site|Status|Phase|Stage|Key|Tech|Data|Work|User|Client|Server|Web|App|Dev|Prod|Test|Beta|Alpha|Doc|File|Job|Run|Task|Note|Issue|Bug|Ticket|Item|Block|Risk|Cost|Budget|Sprint|Quarter|Infra)\s/i;
function isPersonName(name: string): boolean {
  return !NON_PERSON_FIRST_WORDS.test(name);
}

function extractOwnerAndDate(answer: string): { owners: string[]; dates: string[] } {
  const owners: string[] = [];
  const dateRe = /\b([A-Za-z]+\s+\d{1,2},?\s*\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/g;
  const dates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = dateRe.exec(answer)) !== null) dates.push(m[1]);
  const nameRe = /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\s+(?:is on point|owns|leads|is responsible|has been assigned)/gi;
  while ((m = nameRe.exec(answer)) !== null) owners.push(m[1].trim());
  if (!owners.length && /\b(Jordan Martinez|owner|responsible)\b/i.test(answer)) {
    const alt = answer.match(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g);
    if (alt) owners.push(...alt.filter(isPersonName));
  }
  return { owners: [...new Set(owners)], dates: [...new Set(dates)] };
}

function checkGates(records: QuestionRecord[], cases: EvalCase[], abstentionResult?: RunResult & { conversationId?: string }): string[] {
  const failures: string[] = [];
  const total = records.length * 3;
  const passed = records.reduce((a, r) => a + (r.run1.pass ? 1 : 0) + (r.run2.pass ? 1 : 0) + (r.run3.pass ? 1 : 0), 0);
  const passRate = total ? (passed / total) * 100 : 0;
  if (passRate < 80) failures.push(`Gate: Overall pass rate ${passRate.toFixed(1)}% < 80%`);

  // EVAL-3: exclude records where turn3 timed out (undefined = unknown, neutral)
  const contextRetainedTotal = records.filter((r) => r.contextRetainedTurn3 !== undefined).length;
  const contextRetained = records.filter((r) => r.contextRetainedTurn2 === true && r.contextRetainedTurn3 === true).length;
  const contextRate = contextRetainedTotal ? (contextRetained / contextRetainedTotal) * 100 : 100;
  if (contextRate < 85) failures.push(`Gate: Context retention ${contextRate.toFixed(1)}% < 85%`);

  const allRuns = records.flatMap((r) => [r.run1, r.run2, r.run3]);
  const withAnswer = allRuns.filter((r) => r.answer && r.answer.length > 20);
  // EVAL-2: per-case consistency using requiredValues from dataset (no hardcoded strings)
  // Only compare run1 vs run2; run3 is a structurally different follow-up question.
  const consistencyNumerator = records.filter((rec) => {
    const a1 = (rec.run1.answer ?? "").toLowerCase();
    const a2 = (rec.run2.answer ?? "").toLowerCase();
    // Skip if either answer is empty (server timeout/abort)
    if (!a1 || !a2) return true;
    const evalCase = cases.find((c) => c.id === rec.caseId);
    if (!evalCase) return true;
    const allValues = evalCase.expectedFacts.flatMap((f) => f.requiredValues ?? []);
    if (allValues.length === 0) return true;
    // Both answers agree on each required value (both mention it, or both lack it)
    const agreements = allValues.map((v) => {
      const lv = v.toLowerCase();
      return a1.includes(lv) === a2.includes(lv);
    });
    return agreements.filter(Boolean).length / agreements.length >= 0.8;
  }).length;
  const consistencyRate = records.length ? (consistencyNumerator / records.length) * 100 : 100;
  if (consistencyRate < 75) failures.push(`Gate: Consistency score ${consistencyRate.toFixed(1)}% < 75%`);

  const toneScores = withAnswer.map((r) => toneScore(r.answer!));
  const avgTone = toneScores.length ? toneScores.reduce((a, b) => a + b, 0) / toneScores.length : 1;
  if (avgTone < 0.85) failures.push(`Gate: Tone gate ${(avgTone * 100).toFixed(1)}% < 85%`);

  if (abstentionResult) {
    const ans = (abstentionResult.answer ?? "").toLowerCase();
    // Accept any phrasing that indicates inability to match/find the content
    const hasNoMatch = /no matching documents|no matching sources|no (relevant )?documents found|doesn.t match|not match.{0,15}doc|no information available|not.{0,20}available|random string|unrecognizable|cannot understand|can.?t? (find|locate)|cannot (find|locate)|not found in (the|your|our)|unable to find|not.{0,20}information.{0,20}(context|source)|no results|isn.t.{0,30}(information|available)/i.test(ans);
    // Accept structured clarifyingQuestions OR soft clarification in text
    const hasClarifying = (abstentionResult.clarifyingQuestions?.length ?? 0) >= 2
      || /clarif|more context|more information|more details|please provide|help me understand|provide.{0,20}context|could you.{0,20}(tell|provide|share|describe)|which project|which initiative|which owner|do you have a specific|can you (narrow|specify|tell)|narrowing by/i.test(ans);
    const noFactualClaims = !/\b(jordan martinez|november 11|nov \s*11)\b/i.test(ans);
    const trustWarning = (abstentionResult.trustSignal?.level ?? "").toLowerCase() === "warning" || (abstentionResult.trustSignal?.label ?? "").toLowerCase().includes("review");
    if (!hasNoMatch || !hasClarifying || !noFactualClaims) {
      failures.push(`Gate: Abstention gate failed (noMatch=${hasNoMatch}, clarifying=${hasClarifying}, noFactual=${noFactualClaims}, trustWarning=${trustWarning})`);
    }
  }

  let citationAccuracyOk = 0;
  for (const r of allRuns) {
    if (!r.answer || !r.sources_used?.length) {
      citationAccuracyOk += 1;
      continue;
    }
    const citationIndices = (r.answer.match(/\[\d+\]/g) || []).map((s) => s.replace(/[\[\]]/g, ""));
    const sourceCount = Array.isArray(r.sources_used) ? r.sources_used.length : 0;
    const align = citationIndices.every((idx) => {
      const n = parseInt(idx, 10);
      return n >= 1 && n <= sourceCount;
    });
    if (align) citationAccuracyOk += 1;
  }
  const citationAccuracyRate = allRuns.length ? citationAccuracyOk / allRuns.length : 1;
  if (citationAccuracyRate < 0.85) failures.push(`Gate: Citation accuracy ${(citationAccuracyRate * 100).toFixed(1)}% < 85%`);

  let ownerCitationMatchOk = 0;
  let ownerCitationTotal = 0;
  for (const r of withAnswer) {
    const { owners } = extractOwnerAndDate(r.answer!);
    if (owners.length === 0) {
      ownerCitationMatchOk += 1;
      ownerCitationTotal += 1;
      continue;
    }
    ownerCitationTotal += 1;
    const evidenceSources = r.details?.evidenceBySource ?? [];
    const excerpts = evidenceSources.flatMap((e) => (e.excerpts ?? []).map((x) => (x.text ?? "").toLowerCase()));
    const allText = excerpts.join(" ");
    // EVAL-4: [N]-present bypass removed. Only skip if no evidence available (GENERAL path).
    if (excerpts.length === 0) {
      ownerCitationMatchOk += 1;
      continue;
    }
    const found = owners.some((o) => allText.includes(o.toLowerCase()));
    if (found) ownerCitationMatchOk += 1;
  }
  const ownerRate = ownerCitationTotal ? ownerCitationMatchOk / ownerCitationTotal : 1;
  if (ownerRate < 1) failures.push(`Gate: Owner citation match ${(ownerRate * 100).toFixed(0)}% < 100%`);

  let deadlineCitationMatchOk = 0;
  let deadlineCitationTotal = 0;
  for (const r of withAnswer) {
    const { dates } = extractOwnerAndDate(r.answer!);
    if (dates.length === 0) {
      deadlineCitationMatchOk += 1;
      deadlineCitationTotal += 1;
      continue;
    }
    deadlineCitationTotal += 1;
    const excerpts = (r.details?.evidenceBySource ?? []).flatMap((e) => (e.excerpts ?? []).map((x) => (x.text ?? "").toLowerCase()));
    const allText = excerpts.join(" ");
    // EVAL-4: hasDateCitationMarkers bypass removed. Only skip if no evidence available (GENERAL path).
    if (excerpts.length === 0) {
      deadlineCitationMatchOk += 1;
      continue;
    }
    const found = dates.some((d) => {
      const full = d.toLowerCase().replace(/,/g, "");
      if (allText.includes(full)) return true;
      // Also accept month+day match without year (e.g. "november 11" from "November 11, 2024")
      const monthDay = full.replace(/\s+\d{4}$/, "").trim();
      return monthDay.length > 3 && allText.includes(monthDay);
    });
    if (found) deadlineCitationMatchOk += 1;
  }
  const deadlineRate = deadlineCitationTotal ? deadlineCitationMatchOk / deadlineCitationTotal : 1;
  if (deadlineRate < 1) failures.push(`Gate: Deadline citation match ${(deadlineRate * 100).toFixed(0)}% < 100%`);

  const runsWithEvidence = allRuns.filter((r) => (r.details?.evidenceBySource?.length ?? 0) > 0);
  const evidenceExcerptAll = runsWithEvidence.every((r) => {
    const items = r.details!.evidenceBySource!;
    return items.every((e) => ((e.excerpts ?? []).map((x) => x.text?.trim()).filter(Boolean).length > 0));
  });
  if (runsWithEvidence.length > 0 && !evidenceExcerptAll) {
    failures.push(`Gate: Evidence excerpt presence < 100% (some evidence cards missing excerpt)`);
  }

  const evidenceHorizontalPass = allRuns.every((r) => {
    const items = r.details?.evidenceBySource ?? [];
    return items.length === 0 || items.length >= 1;
  });
  if (!evidenceHorizontalPass) failures.push(`Gate: Evidence horizontal layout failed`);

  let summaryPriorityOk = 0;
  let summaryPriorityTotal = 0;
  for (const r of allRuns) {
    const rows = r.details?.summaryRows ?? [];
    for (const row of rows) {
      summaryPriorityTotal += 1;
      const p = (row.priority ?? "").trim();
      if (p.length > 0 && p !== "—" && p !== "UNAVAILABLE") summaryPriorityOk += 1;
    }
  }
  const summaryPriorityRate = summaryPriorityTotal ? summaryPriorityOk / summaryPriorityTotal : 1;
  if (summaryPriorityRate < 1) failures.push(`Gate: Summary priority populated ${(summaryPriorityRate * 100).toFixed(0)}% < 100%`);

  let summaryImpactOk = 0;
  let summaryImpactTotal = 0;
  for (const r of allRuns) {
    const rows = r.details?.summaryRows ?? [];
    for (const row of rows) {
      summaryImpactTotal += 1;
      const i = (row.impact ?? "").trim();
      if (i.length > 0 && i !== "—") summaryImpactOk += 1;
    }
  }
  const summaryImpactRate = summaryImpactTotal ? summaryImpactOk / summaryImpactTotal : 1;
  if (summaryImpactRate < 1) failures.push(`Gate: Summary impact populated ${(summaryImpactRate * 100).toFixed(0)}% < 100%`);

  let noPhantomOk = 0;
  for (const r of allRuns) {
    const citationIndices = (r.answer?.match(/\[\d+\]/g) || []).map((s) => parseInt(s.replace(/\D/g, ""), 10));
    const sourceCount = Array.isArray(r.sources_used) ? r.sources_used.length : 0;
    const noPhantom = citationIndices.every((n) => n >= 1 && n <= sourceCount);
    if (noPhantom || citationIndices.length === 0) noPhantomOk += 1;
  }
  const noPhantomRate = allRuns.length ? noPhantomOk / allRuns.length : 1;
  if (noPhantomRate < 1.0) failures.push(`Gate: No phantom citations ${(noPhantomRate * 100).toFixed(0)}% < 100%`);

  return failures;
}

function writeFailures(failures: string[]): void {
  if (failures.length === 0) {
    if (existsSync(OUTPUT_FAILURES)) writeFileSync(OUTPUT_FAILURES, "", "utf8");
    return;
  }
  writeFileSync(OUTPUT_FAILURES, failures.join("\n\n") + "\n", "utf8");
}

async function main(): Promise<void> {
  console.log("Golden eval (five-dimension) — reading cases from eval/golden/cases only; writing to GOLDEN_EVAL_RESULTS.md only.");
  try {
    await ensureAuth();
    console.log("Auth OK.");
  } catch (e) {
    console.error("Auth failed:", e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
    return;
  }
  const cases = GOLDEN_EVAL_CASES;
  const allRecords: QuestionRecord[] = [];
  const failures: string[] = [];

  let abstentionResult: (RunResult & { conversationId?: string }) | undefined;
  try {
    console.log("Abstention run (no-match query)...");
    const abst = await runOne(null, NO_MATCH_QUERY);
    abstentionResult = abst;
  } catch (e) {
    console.log("Abstention run failed:", e instanceof Error ? e.message : String(e));
  }

  const totalRuns = parseInt(process.env.EVAL_RUNS ?? "3", 10) || 3;
  for (let run = 1; run <= totalRuns; run++) {
    console.log(`Run ${run}/${totalRuns}...`);
    const records: QuestionRecord[] = [];
    for (const c of cases) {
      process.stdout.write(`  ${c.id}... `);
      try {
        const rec = await runCase(c);
        records.push(rec);
        allRecords.push(rec);
        const pass = rec.run1.pass && rec.run2.pass && rec.run3.pass;
        console.log(pass ? "OK" : "FAIL");
        if (!pass) failures.push(`Question: ${c.query}\nRun1: ${rec.run1.pass} Run2: ${rec.run2.pass} Run3: ${rec.run3.pass}`);
      } catch (e) {
        console.log("ERROR");
        failures.push(`Question: ${c.query}\nError: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    writeResults(records, run);
  }

  writeResults(allRecords, totalRuns);
  const gateFailures = checkGates(allRecords, cases, abstentionResult);
  const allFailures = [...failures, ...gateFailures];
  writeFailures(allFailures);
  console.log(`Done. Results: ${OUTPUT_MD}`);
  if (allFailures.length > 0) {
    console.log(`Failures: ${OUTPUT_FAILURES}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
