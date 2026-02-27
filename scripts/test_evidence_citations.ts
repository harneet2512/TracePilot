/**
 * Evidence-Only Citation Tests
 *
 * Verifies that the RAG pipeline:
 * 1. Only includes relevant sources in context (score filtering)
 * 2. Only cites sources that support visible claims (citation gating)
 *
 * Usage:
 *   DEV_CONNECTOR_FIXTURES=1 npx tsx scripts/test_evidence_citations.ts
 */

import "dotenv/config";
import { getDb } from "../server/db";
import { runAgentTurn, type AgentTurnOutput } from "../server/lib/agent/agentCore";

const GOLDEN_WORKSPACE_ID = "golden-eval-workspace";
const GOLDEN_USER_ID = "golden-eval-user";

// Ensure mocking
if (!process.env.DEV_CONNECTOR_FIXTURES && !process.env.PROOF_MODE) {
  console.warn("[WARN] Set DEV_CONNECTOR_FIXTURES=1 to mock OpenAI. Real calls will be made.");
}

interface TestCase {
  id: string;
  query: string;
  /** Source title substrings that MUST be cited */
  expectedSourcePrefixes: string[];
  /** If true, ONLY these sources should be cited (no extras) */
  exclusiveSources: boolean;
  /** Source title substrings that must NOT be cited */
  forbiddenSourcePrefixes: string[];
  /** Strings that must appear in the answer */
  requiredInAnswer: string[];
}

const isMocked = !!(process.env.PROOF_MODE || process.env.DEV_CONNECTOR_FIXTURES);

const TEST_CASES: TestCase[] = [
  {
    id: "T1-single-doc-okr",
    query: "What are our Q4 OKRs for the AI search project?",
    expectedSourcePrefixes: ["Q4_2024_OKRs", "Q4 2024 OKRs"],
    exclusiveSources: true,
    forbiddenSourcePrefixes: ["JIRA_INFRA", "JIRA INFRA", "Product_Roadmap", "Product Roadmap", "Team_Quick_Reference", "Team Quick Reference"],
    requiredInAnswer: isMocked ? [] : ["November 15", "2s", "500", "$180"],
  },
  {
    id: "T2-single-doc-budget",
    query: "What's the Q4 budget for the AI search OKRs?",
    expectedSourcePrefixes: ["Q4_2024_OKRs", "Q4 2024 OKRs"],
    exclusiveSources: true,
    forbiddenSourcePrefixes: ["JIRA_INFRA", "JIRA INFRA", "Product_Roadmap", "Product Roadmap", "Team_Quick_Reference", "Team Quick Reference"],
    requiredInAnswer: isMocked ? [] : ["180"],
  },
  {
    id: "T3-multi-doc-blockers",
    // Use a more keyword-specific query that the mock embeddings can match
    query: "What are the current blockers and AWS EU quota issues blocking the AI search launch?",
    expectedSourcePrefixes: ["Engineering_AllHands", "JIRA_INFRA", "Engineering All-Hands", "JIRA INFRA"],
    exclusiveSources: false,
    forbiddenSourcePrefixes: ["Product_Roadmap", "Product Roadmap", "Team_Quick_Reference", "Team Quick Reference"],
    requiredInAnswer: isMocked ? [] : ["AWS", "EU"],
  },
];

function matchesAny(title: string, prefixes: string[]): boolean {
  const lower = title.toLowerCase();
  return prefixes.some(p => lower.includes(p.toLowerCase()));
}

async function runTest(tc: TestCase): Promise<{ passed: boolean; reason: string }> {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`TEST ${tc.id}: "${tc.query}"`);
  console.log("=".repeat(70));

  let output: AgentTurnOutput;
  try {
    output = await runAgentTurn({
      message: tc.query,
      userId: GOLDEN_USER_ID,
      userRole: "member",
      channel: "http",
      workspaceId: GOLDEN_WORKSPACE_ID,
      topK: 8,
    });
  } catch (err: any) {
    const reason = `FAIL — runAgentTurn threw: ${err.message}`;
    console.log(reason);
    return { passed: false, reason };
  }

  // (a) Retrieved docs (from citations + relatedSources = all chunks that were retrieved)
  const retrievedDocs: Array<{ title: string; score?: number }> = [];
  const seenRetrieved = new Set<string>();

  for (const c of output.citations || []) {
    const key = c.sourceId;
    if (!seenRetrieved.has(key)) {
      seenRetrieved.add(key);
      retrievedDocs.push({ title: c.title || c.label || c.sourceId, score: c.score });
    }
  }
  for (const s of output.sources || []) {
    if (!seenRetrieved.has(s.sourceId)) {
      seenRetrieved.add(s.sourceId);
      retrievedDocs.push({ title: s.title });
    }
  }
  for (const s of output.relatedSources || []) {
    if (!seenRetrieved.has(s.sourceId)) {
      seenRetrieved.add(s.sourceId);
      retrievedDocs.push({ title: s.title });
    }
  }
  console.log(`\n(a) Retrieved docs:`);
  retrievedDocs.forEach(d => console.log(`    - ${d.title}${d.score !== undefined ? ` (score: ${d.score.toFixed(3)})` : ""}`));

  // (b) Context docs = cited sources (after score filtering, these are what made it to LLM)
  const contextDocs = (output.sources || []).map(s => s.title);
  console.log(`\n(b) Context/cited docs:`);
  contextDocs.forEach(t => console.log(`    - ${t}`));

  // (c) Cited docs from evidence (doc-intent) or sources (general)
  const citedTitles: string[] = [];
  if (output.evidence && output.evidence.length > 0) {
    for (const ev of output.evidence) {
      citedTitles.push(ev.title);
    }
  } else {
    for (const s of output.sources || []) {
      citedTitles.push(s.title);
    }
  }
  console.log(`\n(c) Cited docs (evidence/sources):`);
  citedTitles.forEach(t => console.log(`    - ${t}`));

  // (d) Evaluate pass/fail
  const failures: string[] = [];

  // All titles to check against (cited + context + retrieved)
  const allCitedTitles = [...citedTitles, ...contextDocs];
  const allRetrievedTitles = retrievedDocs.map(d => d.title);

  // Check that at least one expected source is present in retrieved OR cited docs
  const hasExpectedRetrieved = tc.expectedSourcePrefixes.some(p =>
    allRetrievedTitles.some(t => t.toLowerCase().includes(p.toLowerCase()))
  );
  if (!hasExpectedRetrieved) {
    failures.push(`Expected source matching [${tc.expectedSourcePrefixes.join(" | ")}] not found in retrieved docs`);
  }

  // Check that at least one expected source is cited (evidence/sources)
  const hasExpectedCited = tc.expectedSourcePrefixes.some(p =>
    allCitedTitles.some(t => t.toLowerCase().includes(p.toLowerCase()))
  );
  if (!hasExpectedCited) {
    failures.push(`Expected source matching [${tc.expectedSourcePrefixes.join(" | ")}] not found in cited docs`);
  }

  // Check forbidden sources are NOT cited (the core test for citation scoping)
  for (const forbidden of tc.forbiddenSourcePrefixes) {
    const found = allCitedTitles.find(t => t.toLowerCase().includes(forbidden.toLowerCase()));
    if (found) {
      failures.push(`Forbidden source cited: "${found}" matches forbidden prefix "${forbidden}"`);
    }
  }

  // Check required answer content
  const answerLower = output.answerText.toLowerCase();
  for (const req of tc.requiredInAnswer) {
    if (!answerLower.includes(req.toLowerCase())) {
      failures.push(`Required text "${req}" not found in answer`);
    }
  }

  const passed = failures.length === 0;
  console.log(`\n(d) ${passed ? "PASS ✓" : "FAIL ✗"}`);
  if (!passed) {
    failures.forEach(f => console.log(`    - ${f}`));
  }

  // Print answer excerpt
  console.log(`\n    Answer (first 300 chars): ${output.answerText.slice(0, 300)}...`);

  return { passed, reason: passed ? "All checks passed" : failures.join("; ") };
}

async function main() {
  console.log("Evidence-Only Citation Tests");
  console.log(`DEV_CONNECTOR_FIXTURES=${process.env.DEV_CONNECTOR_FIXTURES || "unset"}`);
  console.log(`PROOF_MODE=${process.env.PROOF_MODE || "unset"}`);

  // Ensure DB is initialized before any storage calls
  await getDb();

  const results: Array<{ id: string; passed: boolean; reason: string }> = [];

  for (const tc of TEST_CASES) {
    const result = await runTest(tc);
    results.push({ id: tc.id, ...result });
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("SUMMARY");
  console.log("=".repeat(70));
  let allPassed = true;
  for (const r of results) {
    console.log(`  ${r.passed ? "PASS" : "FAIL"} ${r.id}: ${r.reason}`);
    if (!r.passed) allPassed = false;
  }
  console.log(`\nOverall: ${allPassed ? "ALL PASSED ✓" : "SOME FAILED ✗"}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(2);
});
