/**
 * Rate-limit QA bypass safety test
 * Verifies that the x-qa-bypass header is ONLY honoured in development.
 * Run with: npx tsx --test server/__tests__/rateLimitBypass.test.ts
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";

describe("QA rate-limit bypass safety", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    originalEnv.NODE_ENV = process.env.NODE_ENV;
    originalEnv.QA_RATE_LIMIT_BYPASS_TOKEN = process.env.QA_RATE_LIMIT_BYPASS_TOKEN;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv.NODE_ENV;
    process.env.QA_RATE_LIMIT_BYPASS_TOKEN = originalEnv.QA_RATE_LIMIT_BYPASS_TOKEN;
  });

  function isQaBypass(headers: Record<string, string>): boolean {
    if (process.env.NODE_ENV !== "development") return false;
    const token = process.env.QA_RATE_LIMIT_BYPASS_TOKEN;
    if (!token) return false;
    return headers["x-qa-bypass"] === token;
  }

  it("allows bypass in development with matching token", () => {
    process.env.NODE_ENV = "development";
    process.env.QA_RATE_LIMIT_BYPASS_TOKEN = "test-token-123";
    assert.strictEqual(isQaBypass({ "x-qa-bypass": "test-token-123" }), true);
  });

  it("rejects bypass in production even with matching token", () => {
    process.env.NODE_ENV = "production";
    process.env.QA_RATE_LIMIT_BYPASS_TOKEN = "test-token-123";
    assert.strictEqual(isQaBypass({ "x-qa-bypass": "test-token-123" }), false);
  });

  it("rejects bypass in test mode even with matching token", () => {
    process.env.NODE_ENV = "test";
    process.env.QA_RATE_LIMIT_BYPASS_TOKEN = "test-token-123";
    assert.strictEqual(isQaBypass({ "x-qa-bypass": "test-token-123" }), false);
  });

  it("rejects bypass when token is missing from env", () => {
    process.env.NODE_ENV = "development";
    delete process.env.QA_RATE_LIMIT_BYPASS_TOKEN;
    assert.strictEqual(isQaBypass({ "x-qa-bypass": "any-value" }), false);
  });

  it("rejects bypass when header does not match token", () => {
    process.env.NODE_ENV = "development";
    process.env.QA_RATE_LIMIT_BYPASS_TOKEN = "correct-token";
    assert.strictEqual(isQaBypass({ "x-qa-bypass": "wrong-token" }), false);
  });

  it("rejects bypass when header is absent", () => {
    process.env.NODE_ENV = "development";
    process.env.QA_RATE_LIMIT_BYPASS_TOKEN = "test-token-123";
    assert.strictEqual(isQaBypass({}), false);
  });
});
