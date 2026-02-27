/**
 * Comprehensive RAG System Verification Harness
 *
 * Runs all 10 golden demo queries + 8 ambiguity queries against the
 * seeded golden DB. Outputs JSON results and a markdown report.
 *
 * Usage:
 *   PROOF_MODE=1 npx tsx scripts/verify_rag_system.ts
 */

import "dotenv/config";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getDb } from "../server/db";
import { chunks, sources } from "../shared/schema";
import { like, eq } from "drizzle-orm";
import { runAgentTurn, type AgentTurnOutput } from "../server/lib/agent/agentCore";
import { GOLDEN_EVAL_CASES, type EvalCase } from "../eval/golden/cases";
import { AMBIGUITY_CASES, scoreAmbiguity, type AmbiguityCase, type AmbiguityScoreResult } from "../eval/ambiguity/cases";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GOLDEN_PREFIX = "golden-";
const GOLDEN_WORKSPACE_ID = "golden-eval-workspace";
const GOLDEN_USER_ID = "golden-eval-user";

// Ensure mocking is set (use DEV_CONNECTOR_FIXTURES to mock OpenAI without switching DB to SQLite)
if (!process.env.PROOF_MODE && !process.env.DEV_CONNECTOR_FIXTURES) {
  console.warn("[WARN] Neither PROOF_MODE nor DEV_CONNECTOR_FIXTURES is set. Real OpenAI calls will be made.");
}

interface DemoQueryResult {
  caseId: string;
  query: string;
  passed: boolean;
  answerText: string;
  answerLength: number;
  citationCount: number;
  sourceCount: number;
  latencyMs: number;
  expectedFactsTotal: number;
  expectedFactsFound: number;
  expectedFactsMissing: string[];
  hasRawJson: boolean;
  needsClarification: boolean;
  failures: string[];
}

interface VerificationResults {
  timestamp: string;
  environment: {
    proofMode: boolean;
    nodeEnv: string;
  };
  indexingSummary: {
    sourceCount: number;
    chunkCount: number;
    workspaceId: string;
  };
  demoQueryResults: DemoQueryResult[];
  ambiguityResults: AmbiguityScoreResult[];
  summary: {
    demoQueriesTotal: number;
    demoQueriesPassed: number;
    ambiguityTotal: number;
    ambiguityPassed: number;
    overallPass: boolean;
  };
}

/**
 * Check if answer text contains raw JSON dumps
 */
function containsRawJson(text: string): boolean {
  // Check for JSON-like patterns that shouldn't be in natural language
  const jsonPatterns = [
    /\{[\s\n]*"[^"]+"\s*:/,     // { "key":
    /\[\s*\{[\s\n]*"/,           // [{"
    /"chunkId"\s*:/,             // "chunkId":
    /"sourceId"\s*:/,            // "sourceId":
    /"sourceVersionId"\s*:/,     // "sourceVersionId":
  ];
  return jsonPatterns.some(p => p.test(text));
}

/**
 * Check expected facts against answer text
 */
function checkExpectedFacts(evalCase: EvalCase, answerText: string): {
  found: number;
  missing: string[];
} {
  const answerLower = answerText.toLowerCase();
  const missing: string[] = [];

  for (const fact of evalCase.expectedFacts) {
    if (!fact.requiredValues || fact.requiredValues.length === 0) {
      // No specific values to check, just note it
      continue;
    }

    let factFound = false;
    for (const value of fact.requiredValues) {
      const valueLower = value.toLowerCase().replace(/,/g, "");
      if (answerLower.includes(valueLower)) {
        factFound = true;
        break;
      }

      // Try numeric alternatives
      if (/^\$?\d/.test(value)) {
        let numValue = parseFloat(value.replace(/[$,]/g, ""));
        if (value.endsWith("K")) numValue *= 1000;
        if (value.endsWith("M")) numValue *= 1000000;

        const alternatives = [
          numValue.toString(),
          `${numValue / 1000}k`,
          `${numValue / 1000000}m`,
          `$${(numValue / 1000000).toFixed(3)}m`,
          `$${(numValue / 1000).toFixed(0)}k`,
        ];

        for (const alt of alternatives) {
          if (answerLower.includes(alt.toLowerCase())) {
            factFound = true;
            break;
          }
        }
      }

      if (factFound) break;
    }

    if (!factFound) {
      missing.push(`${fact.text}: ${fact.requiredValues.join(", ")}`);
    }
  }

  const found = evalCase.expectedFacts.length - missing.length;
  return { found, missing };
}

/**
 * Run a single demo query and evaluate it
 */
async function runDemoQuery(evalCase: EvalCase): Promise<DemoQueryResult> {
  const startTime = Date.now();
  let result: AgentTurnOutput;

  try {
    result = await runAgentTurn({
      message: evalCase.query,
      userId: GOLDEN_USER_ID,
      userRole: "admin",
      channel: "http",
      workspaceId: GOLDEN_WORKSPACE_ID,
    });
  } catch (error) {
    return {
      caseId: evalCase.id,
      query: evalCase.query,
      passed: false,
      answerText: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
      answerLength: 0,
      citationCount: 0,
      sourceCount: 0,
      latencyMs: Date.now() - startTime,
      expectedFactsTotal: evalCase.expectedFacts.length,
      expectedFactsFound: 0,
      expectedFactsMissing: evalCase.expectedFacts.map(f => f.text),
      hasRawJson: false,
      needsClarification: false,
      failures: [`Query execution failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  const latencyMs = Date.now() - startTime;
  const failures: string[] = [];

  // Check for raw JSON in answer
  const hasRawJson = containsRawJson(result.answerText);
  if (hasRawJson) {
    failures.push("Answer contains raw JSON");
  }

  // Check expected facts
  const factCheck = checkExpectedFacts(evalCase, result.answerText);
  if (factCheck.missing.length > 0) {
    failures.push(`Missing facts: ${factCheck.missing.join("; ")}`);
  }

  // Check citations exist
  const citationCount = result.citations?.length || 0;
  const sourceCount = result.sources?.length || 0;
  if (citationCount === 0 && sourceCount === 0) {
    failures.push("No citations or sources in response");
  }

  // Check minimum sources
  if (evalCase.minSources && sourceCount < evalCase.minSources) {
    failures.push(`Expected at least ${evalCase.minSources} sources, got ${sourceCount}`);
  }

  return {
    caseId: evalCase.id,
    query: evalCase.query,
    passed: failures.length === 0,
    answerText: result.answerText,
    answerLength: result.answerText.length,
    citationCount,
    sourceCount,
    latencyMs,
    expectedFactsTotal: evalCase.expectedFacts.length,
    expectedFactsFound: factCheck.found,
    expectedFactsMissing: factCheck.missing,
    hasRawJson,
    needsClarification: result.needsClarification || false,
    failures,
  };
}

/**
 * Run a single ambiguity query and evaluate it
 */
async function runAmbiguityQuery(testCase: AmbiguityCase): Promise<AmbiguityScoreResult> {
  try {
    const result = await runAgentTurn({
      message: testCase.query,
      userId: GOLDEN_USER_ID,
      userRole: "admin",
      channel: "http",
      workspaceId: GOLDEN_WORKSPACE_ID,
    });

    return scoreAmbiguity(
      {
        needsClarification: result.needsClarification,
        clarifyingQuestions: result.clarifyingQuestions,
        answerText: result.answerText,
      },
      testCase
    );
  } catch (error) {
    return {
      caseId: testCase.id,
      passed: false,
      needsClarificationSet: false,
      clarifyingQuestionsCount: 0,
      keywordsMatched: [],
      keywordsMissing: testCase.expectedClarificationKeywords,
      gaveDefinitiveAnswer: false,
      failures: [`Query execution failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

/**
 * Generate markdown report
 */
function generateReport(results: VerificationResults): string {
  const lines: string[] = [];

  lines.push("# RAG System Verification Report");
  lines.push("");
  lines.push(`**Generated:** ${results.timestamp}`);
  lines.push(`**PROOF_MODE:** ${results.environment.proofMode}`);
  lines.push("");

  // Indexing summary
  lines.push("## Indexing Summary");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Sources | ${results.indexingSummary.sourceCount} |`);
  lines.push(`| Chunks | ${results.indexingSummary.chunkCount} |`);
  lines.push(`| Workspace | ${results.indexingSummary.workspaceId} |`);
  lines.push("");

  // Demo query results
  lines.push("## Demo Query Results");
  lines.push("");
  lines.push(`| # | Case | Pass | Facts Found | Citations | Sources | JSON Free | Failures |`);
  lines.push(`|---|------|------|-------------|-----------|---------|-----------|----------|`);

  for (let i = 0; i < results.demoQueryResults.length; i++) {
    const r = results.demoQueryResults[i];
    const pass = r.passed ? "PASS" : "FAIL";
    const jsonFree = r.hasRawJson ? "NO" : "YES";
    const failStr = r.failures.length > 0 ? r.failures[0].substring(0, 60) : "-";
    lines.push(
      `| ${i + 1} | ${r.caseId} | ${pass} | ${r.expectedFactsFound}/${r.expectedFactsTotal} | ${r.citationCount} | ${r.sourceCount} | ${jsonFree} | ${failStr} |`
    );
  }
  lines.push("");

  // Ambiguity results
  lines.push("## Ambiguity Test Results");
  lines.push("");
  lines.push(`| # | Case | Pass | Clarification Set | Questions | Keywords Matched | Failures |`);
  lines.push(`|---|------|------|-------------------|-----------|-----------------|----------|`);

  for (let i = 0; i < results.ambiguityResults.length; i++) {
    const r = results.ambiguityResults[i];
    const pass = r.passed ? "PASS" : "FAIL";
    const failStr = r.failures.length > 0 ? r.failures[0].substring(0, 60) : "-";
    lines.push(
      `| ${i + 1} | ${r.caseId} | ${pass} | ${r.needsClarificationSet} | ${r.clarifyingQuestionsCount} | ${r.keywordsMatched.length} | ${failStr} |`
    );
  }
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Metric | Result |`);
  lines.push(`|--------|--------|`);
  lines.push(`| Demo queries passed | ${results.summary.demoQueriesPassed}/${results.summary.demoQueriesTotal} |`);
  lines.push(`| Ambiguity tests passed | ${results.summary.ambiguityPassed}/${results.summary.ambiguityTotal} |`);
  lines.push(`| Overall | ${results.summary.overallPass ? "PASS" : "FAIL"} |`);
  lines.push("");

  // Fixes applied
  lines.push("## Fixes Applied");
  lines.push("");
  lines.push("1. **System prompt strengthened** (`server/lib/agent/agentCore.ts`)");
  lines.push("   - Knowledge restriction: ONLY use information from provided context");
  lines.push("   - Citation enforcement: every factual claim MUST have a citation");
  lines.push("   - Clarifying questions: instruction to ask when query is ambiguous");
  lines.push("");
  lines.push("2. **Clarification fields propagated** (`server/lib/agent/agentCore.ts`)");
  lines.push("   - `needsClarification` and `clarifyingQuestions` added to AgentTurnOutput");
  lines.push("   - Populated from LLM response in output construction");
  lines.push("");
  lines.push("3. **Citation auto-repair** (`server/lib/rag/grounding.ts`)");
  lines.push("   - `repairCitations()` function recovers failed citations via lexical matching");
  lines.push("   - Integrated into agentCore.ts between validation and rendering");
  lines.push("");

  return lines.join("\n");
}

/**
 * Main verification function
 */
async function main() {
  console.log("=== RAG System Verification ===\n");

  // 1. Verify golden DB is seeded
  console.log("Step 1: Verifying golden DB...");
  const db = await getDb();

  const goldenSources = await db
    .select()
    .from(sources)
    .where(like(sources.id, `${GOLDEN_PREFIX}%`));

  const goldenChunks = await db
    .select()
    .from(chunks)
    .where(like(chunks.id, `${GOLDEN_PREFIX}%`));

  console.log(`  Sources: ${goldenSources.length}`);
  console.log(`  Chunks: ${goldenChunks.length}`);

  if (goldenSources.length === 0 || goldenChunks.length === 0) {
    console.error("\n[ERROR] Golden DB not seeded. Run: npx tsx scripts/seedGolden.ts");
    process.exit(1);
  }

  // 2. Run demo queries
  console.log("\nStep 2: Running demo queries...");
  const demoResults: DemoQueryResult[] = [];

  for (const evalCase of GOLDEN_EVAL_CASES) {
    process.stdout.write(`  Running: ${evalCase.id}... `);
    const result = await runDemoQuery(evalCase);
    demoResults.push(result);
    console.log(result.passed ? "PASS" : `FAIL (${result.failures[0]})`);
  }

  // 3. Run ambiguity queries
  console.log("\nStep 3: Running ambiguity queries...");
  const ambiguityResults: AmbiguityScoreResult[] = [];

  for (const testCase of AMBIGUITY_CASES) {
    process.stdout.write(`  Running: ${testCase.id}... `);
    const result = await runAmbiguityQuery(testCase);
    ambiguityResults.push(result);
    console.log(result.passed ? "PASS" : `FAIL (${result.failures[0]})`);
  }

  // 4. Compile results
  const demoPassed = demoResults.filter(r => r.passed).length;
  const ambiguityPassed = ambiguityResults.filter(r => r.passed).length;

  const results: VerificationResults = {
    timestamp: new Date().toISOString(),
    environment: {
      proofMode: process.env.PROOF_MODE === "1",
      nodeEnv: process.env.NODE_ENV || "development",
    },
    indexingSummary: {
      sourceCount: goldenSources.length,
      chunkCount: goldenChunks.length,
      workspaceId: GOLDEN_WORKSPACE_ID,
    },
    demoQueryResults: demoResults,
    ambiguityResults,
    summary: {
      demoQueriesTotal: GOLDEN_EVAL_CASES.length,
      demoQueriesPassed: demoPassed,
      ambiguityTotal: AMBIGUITY_CASES.length,
      ambiguityPassed: ambiguityPassed,
      overallPass: demoPassed === GOLDEN_EVAL_CASES.length && ambiguityPassed === AMBIGUITY_CASES.length,
    },
  };

  // 5. Write reports
  const reportsDir = join(__dirname, "..", "reports");
  if (!existsSync(reportsDir)) {
    mkdirSync(reportsDir, { recursive: true });
  }

  const jsonPath = join(reportsDir, "rag_verification_results.json");
  writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`\nJSON results: ${jsonPath}`);

  const mdPath = join(reportsDir, "rag_verification_report.md");
  writeFileSync(mdPath, generateReport(results));
  console.log(`Markdown report: ${mdPath}`);

  // 6. Summary
  console.log(`\n=== Results ===`);
  console.log(`Demo queries: ${demoPassed}/${GOLDEN_EVAL_CASES.length}`);
  console.log(`Ambiguity tests: ${ambiguityPassed}/${AMBIGUITY_CASES.length}`);
  console.log(`Overall: ${results.summary.overallPass ? "PASS" : "FAIL"}`);

  process.exit(results.summary.overallPass ? 0 : 1);
}

main().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});
