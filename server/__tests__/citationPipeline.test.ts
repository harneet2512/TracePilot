/**
 * Citation pipeline regression tests
 *
 * Covers:
 * - Citation deduplication by (sourceId, chunkId)
 * - Sources-used filtering (cited vs. related)
 * - Key facts derivation from grounded section items
 *
 * Run with: npx tsx --test server/__tests__/citationPipeline.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert";

// Import the functions under test
import { dedupeCitations, deriveKeyFacts } from "../lib/rag/responseComposer";
import type { Citation, Section } from "../../shared/schema";

// ---------- Citation Deduplication ----------

describe("Citation deduplication", () => {
  it("dedupes by (sourceId, chunkId) ignoring charStart/charEnd", () => {
    const citations: Citation[] = [
      { sourceId: "src-1", chunkId: "chunk-a", charStart: 0, charEnd: 100 },
      { sourceId: "src-1", chunkId: "chunk-a", charStart: 200, charEnd: 300 },
      { sourceId: "src-1", chunkId: "chunk-a", charStart: 400, charEnd: 500 },
    ];

    const result = dedupeCitations(citations);

    assert.strictEqual(result.length, 1, "Should have exactly 1 unique citation");
    assert.strictEqual(result[0].sourceId, "src-1");
    assert.strictEqual(result[0].chunkId, "chunk-a");
    // First occurrence wins
    assert.strictEqual(result[0].charStart, 0);
  });

  it("preserves genuinely different citations", () => {
    const citations: Citation[] = [
      { sourceId: "src-1", chunkId: "chunk-a" },
      { sourceId: "src-1", chunkId: "chunk-b" },
      { sourceId: "src-2", chunkId: "chunk-c" },
    ];

    const result = dedupeCitations(citations);

    assert.strictEqual(result.length, 3, "All 3 citations should be preserved");
  });

  it("returns empty array for empty input", () => {
    const result = dedupeCitations([]);
    assert.strictEqual(result.length, 0);
  });

  it("handles citations without charStart/charEnd", () => {
    const citations: Citation[] = [
      { sourceId: "src-1", chunkId: "chunk-a" },
      { sourceId: "src-1", chunkId: "chunk-a" },
    ];

    const result = dedupeCitations(citations);
    assert.strictEqual(result.length, 1);
  });
});

// ---------- Sources Used Filtering ----------

describe("Sources-used filtering logic", () => {
  it("cited sources are identified from bullets", () => {
    // Simulate the citedSourceIds collection logic from agentCore
    const bullets = [
      { claim: "Fact A", citations: [{ sourceId: "src-1", chunkId: "c1" }] },
      { claim: "Fact B", citations: [{ sourceId: "src-1", chunkId: "c2" }] },
    ];

    const citedSourceIds = new Set<string>();
    for (const bullet of bullets) {
      for (const c of bullet.citations) {
        citedSourceIds.add(c.sourceId);
      }
    }

    const retrieved = ["src-1", "src-2", "src-3", "src-4"];

    const used = retrieved.filter(sid => citedSourceIds.has(sid));
    const related = retrieved.filter(sid => !citedSourceIds.has(sid));

    assert.strictEqual(used.length, 1, "Only 1 source is cited");
    assert.strictEqual(used[0], "src-1");
    assert.strictEqual(related.length, 3, "3 sources are related (not cited)");
  });

  it("cited sources from sections are also captured", () => {
    const sections: Section[] = [
      {
        title: "Objective 1",
        items: [
          {
            text: "KR 1",
            kind: "kr",
            citations: [
              { sourceId: "src-2", chunkId: "c3" },
              { sourceId: "src-3", chunkId: "c4" },
            ],
          },
        ],
      },
    ];

    const citedSourceIds = new Set<string>();
    for (const section of sections) {
      for (const item of section.items) {
        if (item.citations) {
          for (const c of item.citations) {
            citedSourceIds.add(c.sourceId);
          }
        }
      }
    }

    assert.strictEqual(citedSourceIds.size, 2);
    assert.ok(citedSourceIds.has("src-2"));
    assert.ok(citedSourceIds.has("src-3"));
  });

  it("sources without citations yield empty used set", () => {
    const bullets: Array<{ claim: string; citations: any[] }> = [
      { claim: "General fact", citations: [] },
    ];

    const citedSourceIds = new Set<string>();
    for (const bullet of bullets) {
      for (const c of bullet.citations) {
        citedSourceIds.add(c.sourceId);
      }
    }

    assert.strictEqual(citedSourceIds.size, 0, "No sources should be cited");
  });
});

// ---------- Key Facts Derivation ----------

describe("Key facts citation grounding", () => {
  it("derives facts only from cited section items", () => {
    const sections: Section[] = [
      {
        title: "Objective 1",
        items: [
          {
            text: "Reduce latency",
            kind: "kr",
            target: "2s p95",
            due: "Nov 15",
            citations: [{ sourceId: "src-1", chunkId: "c1" }],
          },
          {
            text: "Scale infrastructure",
            kind: "kr",
            status: "At Risk",
            citations: [{ sourceId: "src-1", chunkId: "c2" }],
          },
        ],
      },
    ];

    const facts = deriveKeyFacts(sections);

    assert.ok(facts.length > 0, "Should derive at least 1 fact");
    for (const fact of facts) {
      assert.ok(
        fact.citations.length > 0,
        `Fact "${fact.text}" must have citations`
      );
    }
  });

  it("does not include facts from items without citations", () => {
    const sections: Section[] = [
      {
        title: "Objective 1",
        items: [
          {
            text: "Uncited item",
            kind: "kr",
            target: "100%",
            due: "Dec 1",
            status: "At Risk",
            citations: [], // No citations!
          },
          {
            text: "Cited item",
            kind: "kr",
            target: "50ms",
            citations: [{ sourceId: "src-1", chunkId: "c1" }],
          },
        ],
      },
    ];

    const facts = deriveKeyFacts(sections);

    // Uncited item's fields should NOT appear
    const allText = facts.map(f => f.text).join(" ");
    assert.ok(!allText.includes("100%"), "Uncited target should not appear");
    assert.ok(!allText.includes("Dec 1"), "Uncited due date should not appear");
    // Cited item's target should appear
    assert.ok(allText.includes("50ms"), "Cited target should appear");
  });

  it("caps at 4 facts", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      text: `Item ${i}`,
      kind: "kr" as const,
      target: `${i * 10}%`,
      due: `Jan ${i + 1}`,
      citations: [{ sourceId: "src-1", chunkId: `c${i}` }],
    }));

    const sections: Section[] = [{ title: "Objective", items }];

    const facts = deriveKeyFacts(sections);
    assert.ok(facts.length <= 4, `Should cap at 4 facts, got ${facts.length}`);
  });

  it("returns empty array for sections with no items", () => {
    const sections: Section[] = [{ title: "Empty", items: [] }];
    const facts = deriveKeyFacts(sections);
    assert.strictEqual(facts.length, 0);
  });

  it("returns empty array for empty sections array", () => {
    const facts = deriveKeyFacts([]);
    assert.strictEqual(facts.length, 0);
  });

  it("includes at-risk status facts with citation", () => {
    const sections: Section[] = [
      {
        title: "Obj",
        items: [
          {
            text: "Deploy to prod",
            kind: "kr",
            status: "At Risk",
            citations: [{ sourceId: "src-1", chunkId: "c1" }],
          },
        ],
      },
    ];

    const facts = deriveKeyFacts(sections);
    const riskFact = facts.find(f => f.text.includes("At Risk"));
    assert.ok(riskFact, "Should include at-risk fact");
    assert.ok(riskFact!.citations.length > 0, "At-risk fact must have citation");
  });
});
