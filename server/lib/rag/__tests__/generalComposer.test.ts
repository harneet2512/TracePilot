/**
 * Unit tests for generalComposer - JSON dump detection and answer formatting
 *
 * Run with: npx tsx --test server/lib/rag/__tests__/generalComposer.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert";

import { isJsonDumpish, composeGeneralAnswer } from "../generalComposer";

describe("isJsonDumpish", () => {
  it("detects raw JSON object", () => {
    assert.strictEqual(isJsonDumpish('{"answer": "hello", "bullets": []}'), true);
  });

  it("detects raw JSON array", () => {
    assert.strictEqual(isJsonDumpish('[{"chunkId": "abc"}]'), true);
  });

  it("detects metadata field names", () => {
    const text = "Here are the results with metadataJson and chunkIndex values from the vectorRef store.";
    assert.strictEqual(isJsonDumpish(text), true);
  });

  it("returns false for normal prose", () => {
    assert.strictEqual(isJsonDumpish("The Q4 OKRs target November 15 for launch."), false);
  });

  it("returns false for markdown with headings", () => {
    assert.strictEqual(isJsonDumpish("## Summary\n\nThe project is on track."), false);
  });

  it("returns false for short text", () => {
    assert.strictEqual(isJsonDumpish("OK"), false);
  });

  it("detects multiple JSON-like lines", () => {
    const text = '"sourceId": "abc"\n"chunkId": "def"\n"score": 0.95\n';
    assert.strictEqual(isJsonDumpish(text), true);
  });
});

describe("composeGeneralAnswer", () => {
  it("adds headings to plain prose", () => {
    const result = composeGeneralAnswer(
      "The project launched on November 15.",
      [{ claim: "Launch date was November 15", citations: [] }],
      new Set(["src-1"])
    );

    assert.ok(result.renderedAnswer.includes("## Summary"), "Should have Summary heading");
    assert.ok(result.renderedAnswer.includes("November 15"), "Should preserve original content");
    assert.ok(result.renderedAnswer.includes("## Details"), "Should have Details section");
  });

  it("cleans up JSON dump answer", () => {
    const jsonDump = JSON.stringify({
      answer: "The search found relevant results.",
      bullets: [],
      metadataJson: { chunkIndex: 0 },
    });
    const result = composeGeneralAnswer(jsonDump, [], new Set());

    assert.ok(!result.renderedAnswer.includes("metadataJson"), "Should not contain metadata");
    assert.ok(!result.renderedAnswer.includes("chunkIndex"), "Should not contain chunk fields");
    assert.ok(result.renderedAnswer.includes("## Summary"), "Should have Summary heading");
  });

  it("preserves already-formatted markdown", () => {
    const formatted = "## Summary\n\nAlready well formatted.\n\n## Details\n\n- Point 1";
    const result = composeGeneralAnswer(formatted, [], new Set());

    assert.strictEqual(result.renderedAnswer, formatted, "Should not re-wrap formatted content");
  });

  it("filters out short/trivial bullets from Details", () => {
    const result = composeGeneralAnswer(
      "Main answer here.",
      [
        { claim: "OK", citations: [] },  // Too short, should be filtered
        { claim: "This is a substantive bullet point about findings.", citations: [] },
      ],
      new Set()
    );

    assert.ok(result.renderedAnswer.includes("substantive bullet"), "Should include long bullet");
    assert.ok(!result.renderedAnswer.includes("- OK"), "Should filter short bullets");
  });

  it("extracts answer field from JSON string", () => {
    const jsonAnswer = JSON.stringify({
      answer: "The team is making progress on the OKRs.",
      bullets: [{ claim: "test", citations: [] }],
    });
    const result = composeGeneralAnswer(jsonAnswer, [], new Set());

    assert.ok(result.renderedAnswer.includes("making progress"), "Should extract answer field");
    assert.ok(!result.renderedAnswer.includes('"bullets"'), "Should not contain JSON syntax");
  });
});
