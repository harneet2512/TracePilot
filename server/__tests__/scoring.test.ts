import { describe, it } from "node:test";
import assert from "node:assert";
import { runDeterministicChecks } from "../lib/scoring/deterministicChecks";
import { computeAvg, computeMax, computeMin, computePercentile } from "../lib/scoring/aggregations";

describe("reply scoring computations", () => {
  it("computes deterministic citation metrics", () => {
    const result = runDeterministicChecks({
      userPrompt: "what are the q4 okrs?",
      answerText: "Q4 objective is launch AI search. KR1 is reduce p95 latency.",
      citations: [
        { sourceId: "s1", chunkId: "c1" },
        { sourceId: "s2", chunkId: "c2" },
      ] as any,
      mustCite: true,
    });
    assert.strictEqual(result.mustCitePass, true);
    assert.ok(result.citationIntegrityRate > 0.9);
    assert.ok(result.citationCoverageRate > 0);
  });

  it("fails deterministic checks when citations missing for must-cite", () => {
    const result = runDeterministicChecks({
      userPrompt: "what are the q4 okrs?",
      answerText: "I cannot find enough information to answer this.",
      citations: [],
      mustCite: true,
    });
    assert.strictEqual(result.mustCitePass, false);
    assert.ok(result.failedChecks.includes("must_cite_failed"));
  });

  it("computes aggregation stats", () => {
    const values = [10, 20, 30, 40, 50];
    assert.strictEqual(computeMin(values), 10);
    assert.strictEqual(computeMax(values), 50);
    assert.strictEqual(computeAvg(values), 30);
    assert.strictEqual(computePercentile(values, 50), 30);
    assert.strictEqual(computePercentile(values, 95), 50);
  });
});
