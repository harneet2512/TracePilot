import { test, expect } from "@playwright/test";
import { detectIntent } from "../server/lib/rag/structuredExtractor";

const STABILITY_CASES = [
  "What’s our 2025 product roadmap?",
  "Are there any blockers for the AI search launch?",
  "What’s the biggest risk to our November 15 launch and what are we doing about it?",
];

for (const query of STABILITY_CASES) {
  test(`intent remains stable for: ${query}`, async () => {
    const observed = Array.from({ length: 5 }, () => detectIntent(query));
    const unique = Array.from(new Set(observed));
    expect(unique.length).toBe(1);
  });
}
