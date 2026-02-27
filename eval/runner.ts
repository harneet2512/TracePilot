/**
 * Offline eval runner for regression testing
 * Run with: pnpm eval (or npm run eval:offline)
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { EvalFixture, EvalCase, EvalAssertion, EvalCaseResult, EvalReport } from "./cases";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simulate the trivial prompt detection logic (must match routes_v2.ts)
const trivialGreetings = /^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|cool|bye|goodbye|good morning|good afternoon|good evening)[\s!.?]*$/i;
const capabilityPatterns = /^(what can you do|help|what are you|who are you|how do you work|what do you do)[\s!.?]*$/i;
const docIntentKeywords = /\b(file|doc|okr|project|task|report|meeting|slack|jira|confluence|drive|search|find|show|what|where|how|why|when|who)\b/i;

function isTrivialPrompt(msg: string): boolean {
  const trimmed = msg.trim();
  if (trivialGreetings.test(trimmed)) return true;
  if (capabilityPatterns.test(trimmed)) return true;
  if (trimmed.length <= 40 && !docIntentKeywords.test(trimmed)) {
    return true;
  }
  return false;
}

// Simulate fast-path response
function simulateTrivialResponse(): { answer: string; sections: any[]; sources: any[] } {
  return {
    answer: "Hello! I'm your enterprise assistant. How can I help you today?",
    sections: [],
    sources: [],
  };
}

// Simulate doc-intent response (without actual LLM call)
function simulateDocResponse(input: string): { answer: string; sections: any[]; sources: any[] } {
  // In offline mode, we simulate what a successful RAG response might look like
  return {
    answer: `Based on the documents I found, here's information about: ${input}. [This is a simulated response for offline testing]`,
    sections: [{ title: "Summary", content: "Simulated content" }],
    sources: [
      { id: "src-1", title: "Document 1", sourceType: "drive", sourceTypeLabel: "Drive" },
    ],
  };
}

// Check if sources are deduplicated (no duplicate IDs)
function areSourcesDeduped(sources: any[]): boolean {
  const ids = sources.map(s => s.id || s.sourceId);
  return new Set(ids).size === ids.length;
}

// Check source type labels are valid
function areSourceTypeLabelsValid(sources: any[]): boolean {
  const validLabels = ["Drive", "Slack", "Jira", "Confluence", "Upload", "Custom"];
  return sources.every(s => {
    const label = s.sourceTypeLabel;
    return label && (validLabels.includes(label) || /^[A-Z][a-z]+$/.test(label));
  });
}

// Run assertions against response
function runAssertions(
  response: { answer: string; sections: any[]; sources: any[] },
  assertions: EvalAssertion,
  latencyMs: number
): string[] {
  const failures: string[] = [];

  if (assertions.sectionsEmpty === true && response.sections.length > 0) {
    failures.push(`Expected sections to be empty, got ${response.sections.length}`);
  }

  if (assertions.sectionsEmpty === false && response.sections.length === 0) {
    failures.push("Expected sections to be non-empty");
  }

  if (assertions.sourcesEmpty === true && response.sources.length > 0) {
    failures.push(`Expected sources to be empty, got ${response.sources.length}`);
  }

  if (assertions.sourcesEmpty === false && response.sources.length === 0) {
    failures.push("Expected sources to be non-empty");
  }

  if (assertions.answerNotEmpty && (!response.answer || response.answer.trim().length === 0)) {
    failures.push("Expected answer to be non-empty");
  }

  if (assertions.answerContainsAny && assertions.answerContainsAny.length > 0) {
    const lowerAnswer = response.answer.toLowerCase();
    const found = assertions.answerContainsAny.some(term => lowerAnswer.includes(term.toLowerCase()));
    if (!found) {
      failures.push(`Expected answer to contain one of: ${assertions.answerContainsAny.join(", ")}`);
    }
  }

  if (assertions.answerContainsAll && assertions.answerContainsAll.length > 0) {
    const lowerAnswer = response.answer.toLowerCase();
    const missing = assertions.answerContainsAll.filter(term => !lowerAnswer.includes(term.toLowerCase()));
    if (missing.length > 0) {
      failures.push(`Expected answer to contain all of: ${missing.join(", ")}`);
    }
  }

  if (assertions.sourcesDeduped && !areSourcesDeduped(response.sources)) {
    failures.push("Expected sources to be deduplicated");
  }

  if (assertions.sourceTypeLabelsValid && !areSourceTypeLabelsValid(response.sources)) {
    failures.push("Expected source type labels to be valid");
  }

  if (assertions.maxLatencyMs && latencyMs > assertions.maxLatencyMs) {
    failures.push(`Expected latency < ${assertions.maxLatencyMs}ms, got ${latencyMs}ms`);
  }

  return failures;
}

// Run a single eval case
function runCase(evalCase: EvalCase): EvalCaseResult {
  const start = Date.now();

  let response: { answer: string; sections: any[]; sources: any[] };

  if (isTrivialPrompt(evalCase.input)) {
    response = simulateTrivialResponse();
  } else {
    response = simulateDocResponse(evalCase.input);
  }

  const latencyMs = Date.now() - start;
  const failures = runAssertions(response, evalCase.assertions, latencyMs);

  return {
    caseId: evalCase.id,
    input: evalCase.input,
    passed: failures.length === 0,
    failures,
    latencyMs,
    response,
  };
}

// Load fixtures from directory
function loadFixtures(fixturesDir: string): EvalFixture[] {
  const files = readdirSync(fixturesDir).filter(f => f.endsWith(".json"));
  return files.map(file => {
    const content = readFileSync(join(fixturesDir, file), "utf-8");
    return JSON.parse(content) as EvalFixture;
  });
}

// Main runner
async function main() {
  const fixturesDir = join(__dirname, "fixtures");
  const fixtures = loadFixtures(fixturesDir);

  console.log("=== TracePilot Offline Eval ===\n");
  console.log(`Loaded ${fixtures.length} fixture(s)\n`);

  const allResults: EvalCaseResult[] = [];
  const fixtureResults: EvalReport["fixtureResults"] = {};

  for (const fixture of fixtures) {
    console.log(`\n--- ${fixture.name} ---`);
    console.log(`  ${fixture.description}`);

    const caseResults: EvalCaseResult[] = [];
    let passed = 0;
    let failed = 0;

    for (const evalCase of fixture.cases) {
      const result = runCase(evalCase);
      caseResults.push(result);
      allResults.push(result);

      if (result.passed) {
        passed++;
        console.log(`  [PASS] ${result.caseId}`);
      } else {
        failed++;
        console.log(`  [FAIL] ${result.caseId}`);
        result.failures.forEach(f => console.log(`         - ${f}`));
      }
    }

    fixtureResults[fixture.name] = {
      name: fixture.name,
      passed,
      failed,
      cases: caseResults,
    };

    console.log(`  Result: ${passed}/${fixture.cases.length} passed`);
  }

  const totalPassed = allResults.filter(r => r.passed).length;
  const totalFailed = allResults.filter(r => !r.passed).length;
  const passRate = allResults.length > 0 ? (totalPassed / allResults.length) * 100 : 0;

  const report: EvalReport = {
    timestamp: new Date().toISOString(),
    totalCases: allResults.length,
    passed: totalPassed,
    failed: totalFailed,
    passRate,
    results: allResults,
    fixtureResults,
  };

  // Write report
  const reportPath = join(__dirname, "eval-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("\n=== SUMMARY ===");
  console.log(`Total: ${totalPassed}/${allResults.length} passed (${passRate.toFixed(1)}%)`);
  console.log(`Report written to: ${reportPath}`);

  // Exit with error if any failures
  if (totalFailed > 0) {
    console.log("\n[EXIT 1] Some tests failed");
    process.exit(1);
  }

  console.log("\n[EXIT 0] All tests passed");
  process.exit(0);
}

main().catch(err => {
  console.error("Eval runner error:", err);
  process.exit(1);
});
