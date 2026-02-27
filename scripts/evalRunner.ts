import "dotenv/config";
// Eval runner with metrics: Recall@k, Citation Integrity, Success Rate, Cost-per-Success
import { storage } from "../server/storage";
import { searchSimilar } from "../server/lib/vectorstore";
import { searchRetrievalCorpus } from "../server/lib/retrieval";
import { randomUUID } from "crypto";

interface EvalMetrics {
    recallAtK: number;
    citationIntegrity: number;
    successRate: number;
    costPerSuccess: number;
    totalCases: number;
    successfulCases: number;
    totalCost: number;
}

interface EvalResult {
    caseId: string;
    query: string;
    retrieved: boolean;
    citationValid: boolean;
    success: boolean;
    cost: number;
    retrievedChunks: number;
    expectedSource: string;
    actualSources: string[];
}

export async function runEvalSuite(suiteId: string, workspaceId: string, userId: string, topK: number = 5): Promise<{
    runId: string;
    metrics: EvalMetrics;
    results: EvalResult[];
}> {
    console.log(`Running eval suite ${suiteId}...`);

    const suite = await storage.getEvalSuite(suiteId);
    if (!suite) {
        throw new Error(`Eval suite ${suiteId} not found`);
    }

    const cases = await storage.getEvalCasesBySuiteId(suiteId);
    console.log(`Found ${cases.length} test cases`);

    // Create eval run
    const run = await storage.createEvalRun({
        suiteId,
        status: "running",
        startedAt: new Date(),
        metricsJson: null,
    });

    const results: EvalResult[] = [];
    let totalCost = 0;
    let successfulCases = 0;
    let totalRecall = 0;
    let totalCitationIntegrity = 0;

    for (const testCase of cases) {
        const expected = testCase.expectedJson as any;

        try {
            // Retrieve chunks using workspace-scoped retrieval
            const allChunks = await searchRetrievalCorpus({
                workspaceId,
                requesterUserId: userId,
            });

            const relevantChunks = await searchSimilar(testCase.query, allChunks, topK);

            // Calculate metrics for this case
            const retrievedSources = new Set(relevantChunks.map(c => c.chunk.sourceId));
            const expectedSourceFound = Array.from(retrievedSources).some(sourceId =>
                sourceId.includes(expected.expectedSource) || expected.expectedSource.includes(sourceId)
            );

            // Check citation integrity: do chunks exist and match workspace?
            let validCitations = 0;
            for (const result of relevantChunks) {
                const chunk = await storage.getChunk(result.chunk.id);
                if (chunk && chunk.workspaceId === workspaceId) {
                    validCitations++;
                }
            }
            const citationIntegrity = relevantChunks.length > 0 ? validCitations / relevantChunks.length : 0;

            // Estimate cost (embedding cost: $0.0001 per 1K tokens, assume 100 tokens per query)
            const estimatedTokens = 100;
            const cost = (estimatedTokens / 1000) * 0.0001;
            totalCost += cost;

            const success = expectedSourceFound && citationIntegrity > 0.8;
            if (success) {
                successfulCases++;
            }

            totalRecall += expectedSourceFound ? 1 : 0;
            totalCitationIntegrity += citationIntegrity;

            const result: EvalResult = {
                caseId: testCase.id,
                query: testCase.query,
                retrieved: expectedSourceFound,
                citationValid: citationIntegrity > 0.8,
                success,
                cost,
                retrievedChunks: relevantChunks.length,
                expectedSource: expected.expectedSource,
                actualSources: Array.from(retrievedSources),
            };

            results.push(result);

            // Save result to DB
            await storage.createEvalResult({
                runId: run.id,
                caseId: testCase.id,
                success,
                metricsJson: {
                    retrieved: expectedSourceFound,
                    citationIntegrity,
                    cost,
                    retrievedChunks: relevantChunks.length,
                },
            });

        } catch (error) {
            console.error(`Error evaluating case ${testCase.id}:`, error);
            results.push({
                caseId: testCase.id,
                query: testCase.query,
                retrieved: false,
                citationValid: false,
                success: false,
                cost: 0,
                retrievedChunks: 0,
                expectedSource: expected.expectedSource,
                actualSources: [],
            });
        }
    }

    const metrics: EvalMetrics = {
        recallAtK: cases.length > 0 ? (totalRecall / cases.length) * 100 : 0,
        citationIntegrity: cases.length > 0 ? (totalCitationIntegrity / cases.length) * 100 : 0,
        successRate: cases.length > 0 ? (successfulCases / cases.length) * 100 : 0,
        costPerSuccess: successfulCases > 0 ? totalCost / successfulCases : 0,
        totalCases: cases.length,
        successfulCases,
        totalCost,
    };

    // Update run with metrics
    await storage.updateEvalRun(run.id, {
        status: "completed",
        finishedAt: new Date(),
        metricsJson: metrics,
    });

    console.log("\n=== EVAL RESULTS ===");
    console.log(`Recall@${topK}: ${metrics.recallAtK.toFixed(2)}%`);
    console.log(`Citation Integrity: ${metrics.citationIntegrity.toFixed(2)}%`);
    console.log(`Success Rate: ${metrics.successRate.toFixed(2)}%`);
    console.log(`Cost per Success: $${metrics.costPerSuccess.toFixed(6)}`);
    console.log(`Total Cost: $${metrics.totalCost.toFixed(6)}`);
    console.log(`Successful Cases: ${successfulCases}/${cases.length}`);

    return {
        runId: run.id,
        metrics,
        results,
    };
}

export async function compareWithBaseline(currentRunId: string, baselineRunId: string): Promise<{
    recallDiff: number;
    citationIntegrityDiff: number;
    successRateDiff: number;
    costPerSuccessDiff: number;
}> {
    const currentRun = await storage.getEvalRun(currentRunId);
    const baselineRun = await storage.getEvalRun(baselineRunId);

    if (!currentRun || !baselineRun) {
        throw new Error("Run not found");
    }

    const currentMetrics = currentRun.metricsJson as EvalMetrics;
    const baselineMetrics = baselineRun.metricsJson as EvalMetrics;

    return {
        recallDiff: currentMetrics.recallAtK - baselineMetrics.recallAtK,
        citationIntegrityDiff: currentMetrics.citationIntegrity - baselineMetrics.citationIntegrity,
        successRateDiff: currentMetrics.successRate - baselineMetrics.successRate,
        costPerSuccessDiff: ((currentMetrics.costPerSuccess - baselineMetrics.costPerSuccess) / baselineMetrics.costPerSuccess) * 100,
    };
}

// CLI runner
// CLI runner usage commented out to avoid CJS/ESM ambiguity in Proof Mode
/*
if (require.main === module) {
    const suiteId = process.argv[2];
    const workspaceId = process.argv[3] || "default-workspace";
    const userId = process.argv[4] || "eval-user";

    if (!suiteId) {
        console.error("Usage: ts-node evalRunner.ts <suiteId> [workspaceId] [userId]");
        process.exit(1);
    }

    runEvalSuite(suiteId, workspaceId, userId)
        .then(({ runId, metrics }) => {
            console.log(`\nRun ID: ${runId}`);
            console.log("✓ Eval completed successfully");
            process.exit(0);
        })
        .catch((error) => {
            console.error("Eval failed:", error);
            process.exit(1);
        });
}
*/

export { EvalMetrics, EvalResult };
