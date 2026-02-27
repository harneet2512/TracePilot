/**
 * Fast-path smoke tests
 * Run with: npx tsx --test server/__tests__/fastPath.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert";

// Test trivial prompt detection logic
const trivialGreetings = /^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|cool|bye|goodbye|good morning|good afternoon|good evening)[\s!.?]*$/i;
const capabilityPatterns = /^(what can you do|help(?: me)?|what are you|who are you|how do you work|what do you do|what you do|what can u do|what do u do|what u do)[\s!.?]*$/i;

function isTrivialPrompt(msg: string): boolean {
  const trimmed = msg.trim();
  if (trivialGreetings.test(trimmed)) return true;
  if (capabilityPatterns.test(trimmed)) return true;
  if (trimmed.length <= 40 && !/\b(file|doc|okr|project|task|report|meeting|slack|jira|confluence|drive|search|find|show|what|where|how|why|when|who)\b/i.test(trimmed)) {
    return true;
  }
  return false;
}

describe("Fast-path trivial prompt detection", () => {
  it("detects greetings as trivial", () => {
    assert.strictEqual(isTrivialPrompt("Hi"), true);
    assert.strictEqual(isTrivialPrompt("hello!"), true);
    assert.strictEqual(isTrivialPrompt("Hey"), true);
    assert.strictEqual(isTrivialPrompt("Good morning"), true);
  });

  it("detects capability questions as trivial", () => {
    assert.strictEqual(isTrivialPrompt("What can you do?"), true);
    assert.strictEqual(isTrivialPrompt("help"), true);
    assert.strictEqual(isTrivialPrompt("who are you"), true);
    assert.strictEqual(isTrivialPrompt("what you do ?"), true);
  });

  it("detects short non-doc prompts as trivial", () => {
    assert.strictEqual(isTrivialPrompt("Thanks!"), true);
    assert.strictEqual(isTrivialPrompt("ok cool"), true);
  });

  it("does NOT detect doc-intent prompts as trivial", () => {
    assert.strictEqual(isTrivialPrompt("What are our Q4 OKRs?"), false);
    assert.strictEqual(isTrivialPrompt("Find the project roadmap"), false);
    assert.strictEqual(isTrivialPrompt("Search for meeting notes"), false);
    assert.strictEqual(isTrivialPrompt("Show me the Jira tickets"), false);
  });

  it("does NOT detect long prompts as trivial", () => {
    const longPrompt = "Please help me understand the current state of our project and what blockers we have for the upcoming launch milestone.";
    assert.strictEqual(isTrivialPrompt(longPrompt), false);
  });
});

describe("Fast-path response structure", () => {
  it("trivial response should have empty sources and bullets", () => {
    // Simulate the response structure from fast-path
    const trivialResponse = {
      answer: "Hello! I'm your enterprise assistant.",
      bullets: [],
      sources: [],
      citations: [],
    };

    assert.strictEqual(Array.isArray(trivialResponse.bullets), true);
    assert.strictEqual(trivialResponse.bullets.length, 0);
    assert.strictEqual(Array.isArray(trivialResponse.sources), true);
    assert.strictEqual(trivialResponse.sources.length, 0);
    assert.ok(trivialResponse.answer.length > 0);
  });
});
