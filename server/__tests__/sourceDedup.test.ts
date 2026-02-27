/**
 * Source deduplication tests
 * Run with: npx tsx --test server/__tests__/sourceDedup.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert";

// Simulate the dedup logic from routes_v2.ts
function getSourceTypeLabel(type: string, url?: string): string {
  if (type === "drive" || type === "google") return "Drive";
  if (type === "slack") return "Slack";
  if (type === "jira" || (url && url.includes("atlassian.net/browse"))) return "Jira";
  if (type === "confluence" || (url && url.includes("atlassian.net/wiki"))) return "Confluence";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function dedupSources(rawSources: any[]): any[] {
  const uniqueSourcesMap = new Map<string, any>();

  rawSources.forEach((s: any) => {
    const id = s.sourceId || s.id;
    const type = s.sourceType || s.type || "unknown";
    if (id && !uniqueSourcesMap.has(id)) {
      uniqueSourcesMap.set(id, {
        ...s,
        id,
        sourceType: type,
        sourceTypeLabel: getSourceTypeLabel(type, s.url),
        title: s.title || s.label || s.name,
      });
    }
  });

  return Array.from(uniqueSourcesMap.values());
}

describe("Source deduplication", () => {
  it("deduplicates sources by sourceId", () => {
    const rawSources = [
      { sourceId: "src-1", title: "Doc A", sourceType: "drive" },
      { sourceId: "src-1", title: "Doc A", sourceType: "drive" }, // duplicate
      { sourceId: "src-2", title: "Doc B", sourceType: "slack" },
    ];

    const deduped = dedupSources(rawSources);

    assert.strictEqual(deduped.length, 2);
    assert.strictEqual(deduped[0].id, "src-1");
    assert.strictEqual(deduped[1].id, "src-2");
  });

  it("handles mixed id field names", () => {
    const rawSources = [
      { id: "src-1", title: "Doc A", type: "drive" },
      { sourceId: "src-2", title: "Doc B", sourceType: "jira" },
    ];

    const deduped = dedupSources(rawSources);

    assert.strictEqual(deduped.length, 2);
    assert.strictEqual(deduped[0].id, "src-1");
    assert.strictEqual(deduped[1].id, "src-2");
  });

  it("preserves source order (first occurrence wins)", () => {
    const rawSources = [
      { sourceId: "src-1", title: "First", sourceType: "drive" },
      { sourceId: "src-1", title: "Second", sourceType: "drive" },
    ];

    const deduped = dedupSources(rawSources);

    assert.strictEqual(deduped.length, 1);
    assert.strictEqual(deduped[0].title, "First");
  });
});

describe("Source type labeling", () => {
  it("labels Drive sources correctly", () => {
    assert.strictEqual(getSourceTypeLabel("drive"), "Drive");
    assert.strictEqual(getSourceTypeLabel("google"), "Drive");
  });

  it("labels Slack sources correctly", () => {
    assert.strictEqual(getSourceTypeLabel("slack"), "Slack");
  });

  it("labels Jira sources correctly", () => {
    assert.strictEqual(getSourceTypeLabel("jira"), "Jira");
    assert.strictEqual(getSourceTypeLabel("unknown", "https://company.atlassian.net/browse/PROJ-123"), "Jira");
  });

  it("labels Confluence sources correctly", () => {
    assert.strictEqual(getSourceTypeLabel("confluence"), "Confluence");
    assert.strictEqual(getSourceTypeLabel("unknown", "https://company.atlassian.net/wiki/spaces/TEAM"), "Confluence");
  });

  it("capitalizes unknown types", () => {
    assert.strictEqual(getSourceTypeLabel("upload"), "Upload");
    assert.strictEqual(getSourceTypeLabel("custom"), "Custom");
  });
});

describe("Source structure validation", () => {
  it("enriched source has required fields", () => {
    const rawSources = [
      { sourceId: "src-1", title: "Q4 OKRs", sourceType: "drive", url: "https://docs.google.com/..." },
    ];

    const deduped = dedupSources(rawSources);
    const source = deduped[0];

    assert.ok(source.id, "source should have id");
    assert.ok(source.title, "source should have title");
    assert.ok(source.sourceType, "source should have sourceType");
    assert.ok(source.sourceTypeLabel, "source should have sourceTypeLabel");
  });
});
