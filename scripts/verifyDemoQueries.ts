/**
 * Demo Query Verification Script
 * Validates that RAG system returns expected answers for demo queries
 */

import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { runAgentTurn } from "../server/lib/agent/agentCore.js";
import { retrieveForAnswer } from "../server/lib/retrieval.js";
import pg from "pg";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface SnippetSpec {
  anyOf?: string[];
  allOf?: string[];
  description: string;
}

interface QuerySpec {
  id: string;
  query: string;
  expectedSources: string[];
  expectedSnippets: SnippetSpec[];
  forbiddenStrings: string[];
  minCitations: number;
  minBullets: number;
}

interface QuerySpecs {
  scopeId: string;
  queries: QuerySpec[];
}

interface Manifest {
  scopeId: string;
  workspaceId: string;
  userId: string;
  sources: Array<{ id: string; title: string; chunkCount: number }>;
  totalChunks: number;
  timestamp: string;
}

interface QueryResult {
  queryId: string;
  passed: boolean;
  errors: string[];
  answerPreview: string;
  citationCount: number;
  bulletCount: number;
  sourcesTitles: string[];
  durationMs: number;
}

function assertQuery(spec: QuerySpec, result: any): string[] {
  const errors: string[] = [];
  const fullText = result.answerText + JSON.stringify(result.bullets);

  // A. Check forbidden strings
  for (const forbidden of spec.forbiddenStrings) {
    if (fullText.toLowerCase().includes(forbidden.toLowerCase())) {
      errors.push(`Forbidden: "${forbidden}"`);
    }
  }

  // B. Check expected sources
  const sourceTitles = result.sources?.map((s: any) => s.title || "") || [];
  for (const expectedSource of spec.expectedSources) {
    if (!sourceTitles.some((t: string) => t.includes(expectedSource))) {
      errors.push(`Missing source: "${expectedSource}"`);
    }
  }

  // C. Check expected snippets (anyOf/allOf logic)
  for (const snippetSpec of spec.expectedSnippets) {
    if (snippetSpec.anyOf) {
      const found = snippetSpec.anyOf.some(s =>
        fullText.toLowerCase().includes(s.toLowerCase())
      );
      if (!found) {
        errors.push(`None of anyOf: [${snippetSpec.anyOf.join(", ")}] - ${snippetSpec.description}`);
      }
    }
    if (snippetSpec.allOf) {
      const missing = snippetSpec.allOf.filter(s =>
        !fullText.toLowerCase().includes(s.toLowerCase())
      );
      if (missing.length > 0) {
        errors.push(`Missing allOf: [${missing.join(", ")}] - ${snippetSpec.description}`);
      }
    }
  }

  // D. Check citation/bullet counts
  const citationCount = result.citations?.length || 0;
  const bulletCount = result.bullets?.length || 0;

  if (citationCount < spec.minCitations) {
    errors.push(`Insufficient citations: ${citationCount} < ${spec.minCitations}`);
  }
  if (bulletCount < spec.minBullets) {
    errors.push(`Insufficient bullets: ${bulletCount} < ${spec.minBullets}`);
  }

  return errors;
}

async function printDebugInfo(manifest: Manifest, query: string, result: any) {
  console.log("\n🔍 DEBUG MODE ACTIVATED");
  console.log("=".repeat(80));

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // 1. Scope Information
    console.log("\n📋 SCOPE CONTEXT:");
    console.log(`  Active scopeId: ${manifest.scopeId}`);

    const scopeInfo = await pool.query(
      `SELECT id, type, scope_config_json, sync_mode FROM user_connector_scopes WHERE id = $1`,
      [manifest.scopeId]
    );
    console.log(`  Scope exists: ${scopeInfo.rows.length > 0}`);
    if (scopeInfo.rows.length > 0) {
      console.log(`  Scope type: ${scopeInfo.rows[0].type}`);
      console.log(`  Sync mode: ${scopeInfo.rows[0].sync_mode}`);
    }

    // 2. Sources in Workspace
    const sourcesInScope = await pool.query(
      `SELECT s.id, s.title, s.type, COUNT(c.id) as chunk_count
       FROM sources s
       LEFT JOIN chunks c ON c.source_id = s.id
       WHERE s.workspace_id = $1 AND s.id LIKE 'demo-%'
       GROUP BY s.id, s.title, s.type
       ORDER BY s.title`,
      [manifest.workspaceId]
    );

    console.log(`\n📚 SOURCES IN WORKSPACE (demo- prefix):`);
    if (sourcesInScope.rows.length === 0) {
      console.log("  ⚠️  NO SOURCES FOUND!");
    } else {
      console.table(sourcesInScope.rows.map(r => ({
        title: r.title.substring(0, 40),
        type: r.type,
        chunks: r.chunk_count
      })));
    }

    // 3. Manual Retrieval (show raw scores)
    console.log(`\n🔎 RETRIEVAL RESULTS FOR QUERY: "${query}"`);

    try {
      const retrievalResult = await retrieveForAnswer(query, {
        workspaceId: manifest.workspaceId,
        requesterUserId: manifest.userId,
        scopeId: manifest.scopeId
      }, 12);

      console.log(`  Retrieved chunks: ${retrievalResult.chunks.length}`);

      if (retrievalResult.chunks.length > 0) {
        console.table(retrievalResult.chunks.slice(0, 5).map((c: any) => ({
          chunkId: c.chunk.id.substring(0, 20) + "...",
          sourceTitle: c.source?.title?.substring(0, 30) || "N/A",
          score: c.score?.toFixed(3) || "0.000",
          preview: c.chunk.text.substring(0, 50) + "..."
        })));
      } else {
        console.log("  ⚠️  NO CHUNKS RETRIEVED!");
      }

      // Show diagnostics if available
      if (retrievalResult.diagnostics) {
        const diag = retrievalResult.diagnostics;
        console.log(`\n  Diagnostics:`);
        console.log(`    - Used fallback: ${diag.decision?.usedFallback || false}`);
        console.log(`    - Reason: ${diag.decision?.reason || "N/A"}`);
        console.log(`    - Total chunks in scope: ${diag.existenceChecks?.chunksTotalInScope || 0}`);
      }
    } catch (retrievalError: any) {
      console.error(`  ⚠️  Retrieval failed: ${retrievalError.message}`);
    }

    // 4. Grounding Flags
    console.log(`\n⚙️  GROUNDING CONFIGURATION:`);
    console.log(`  EVAL_MODE: ${process.env.EVAL_MODE || "not set (permissive mode)"}`);
    console.log(`  Strict grounding: ${process.env.EVAL_MODE === "1" ? "ENABLED" : "DISABLED"}`);

    // 5. Answer Structure
    console.log(`\n📊 ANSWER STRUCTURE:`);
    console.log(`  Answer text: "${result.answerText.substring(0, 150)}..."`);
    console.log(`  Bullets: ${result.bullets?.length || 0}`);
    console.log(`  Citations (top-level): ${result.citations?.length || 0}`);
    console.log(`  Sources (top-level): ${result.sources?.length || 0}`);

    if (result.bullets && result.bullets.length > 0) {
      console.log(`\n  First bullet:`);
      console.log(`    Claim: "${result.bullets[0].claim?.substring(0, 80)}..."`);
      console.log(`    Citations: ${result.bullets[0].citations?.length || 0}`);
    }

    console.log("\n" + "=".repeat(80) + "\n");
  } finally {
    await pool.end();
  }
}

async function verifyDemoQueries() {
  console.log("=== Demo Query Verification ===\n");

  // 1. Load manifest and query specs
  const manifestPath = join(__dirname, "..", "fixtures", "demo_manifest.json");
  const querySpecsPath = join(__dirname, "..", "fixtures", "demo_queries.json");

  let manifest: Manifest;
  let querySpecs: QuerySpecs;

  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    console.log(`Loaded manifest: ${manifest.sources.length} sources, ${manifest.totalChunks} chunks`);
  } catch (e: any) {
    console.error(`❌ Failed to load manifest: ${e.message}`);
    console.error(`   Run 'pnpm demo:seed' first to create the fixture data.`);
    process.exit(1);
  }

  try {
    querySpecs = JSON.parse(readFileSync(querySpecsPath, "utf-8"));
    console.log(`Loaded query specs: ${querySpecs.queries.length} queries\n`);
  } catch (e: any) {
    console.error(`❌ Failed to load query specs: ${e.message}`);
    process.exit(1);
  }

  const results: QueryResult[] = [];
  let firstFailureTriggered = false;

  // 2. Execute each query
  for (const spec of querySpecs.queries) {
    const queryStart = Date.now();
    console.log(`[${spec.id}] ${spec.query}`);

    try {
      const result = await runAgentTurn({
        message: spec.query,
        userId: manifest.userId,
        userRole: "admin",
        channel: "http",
        workspaceId: manifest.workspaceId,
        scopeId: manifest.scopeId,
        topK: 12
      });

      const queryDuration = Date.now() - queryStart;

      // 3. Run assertions
      const errors = assertQuery(spec, result);

      // 4. Record result
      const queryResult: QueryResult = {
        queryId: spec.id,
        passed: errors.length === 0,
        errors,
        answerPreview: result.answerText.substring(0, 100),
        citationCount: result.citations?.length || 0,
        bulletCount: result.bullets?.length || 0,
        sourcesTitles: result.sources?.map((s: any) => s.title) || [],
        durationMs: queryDuration
      };

      results.push(queryResult);

      // 5. Print immediate feedback
      if (errors.length === 0) {
        console.log(`  ✅ PASS (${queryResult.citationCount} citations, ${queryResult.bulletCount} bullets, ${queryDuration}ms)`);
      } else {
        console.log(`  ❌ FAIL (${errors.length} errors, ${queryDuration}ms)`);
        errors.forEach(e => console.log(`    - ${e}`));

        // Trigger debug on first failure
        if (!firstFailureTriggered) {
          firstFailureTriggered = true;
          await printDebugInfo(manifest, spec.query, result);
        }
      }
    } catch (error: any) {
      console.log(`  ❌ ERROR: ${error.message}`);
      results.push({
        queryId: spec.id,
        passed: false,
        errors: [`Exception: ${error.message}`],
        answerPreview: "",
        citationCount: 0,
        bulletCount: 0,
        sourcesTitles: [],
        durationMs: Date.now() - queryStart
      });

      if (!firstFailureTriggered) {
        firstFailureTriggered = true;
        console.error("\n🔍 Error details:", error);
      }
    }

    console.log(""); // Blank line between queries
  }

  // 6. Print summary table
  console.log("\n=== Summary ===\n");
  console.table(results.map(r => ({
    Query: r.queryId,
    Status: r.passed ? "✅" : "❌",
    Citations: r.citationCount,
    Bullets: r.bulletCount,
    Errors: r.errors.length,
    Duration: `${r.durationMs}ms`
  })));

  // 7. Write JSON report
  const report = {
    timestamp: new Date().toISOString(),
    scopeId: manifest.scopeId,
    totalQueries: results.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
    results
  };

  const reportPath = join(__dirname, "..", "demo-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to: ${reportPath}`);

  // 8. Print final summary
  const passRate = ((report.passed / report.totalQueries) * 100).toFixed(1);
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Final Results: ${report.passed}/${report.totalQueries} passed (${passRate}%)`);
  console.log(`Total Duration: ${report.totalDurationMs}ms`);

  if (report.passed === report.totalQueries) {
    console.log("\n✅ SUCCESS: All demo queries passed!");
    console.log("${"=".repeat(80)}\n");
    process.exit(0);
  } else {
    console.log(`\n❌ FAILURE: ${report.failed} queries failed`);
    console.log("${"=".repeat(80)}\n");
    process.exit(1);
  }
}

verifyDemoQueries().catch(e => {
  console.error("Verification error:", e);
  process.exit(1);
});
