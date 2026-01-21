/**
 * PII (Personally Identifiable Information) Redaction
 * 
 * Redacts sensitive information from content while preserving shape/structure
 * for debugging and analysis purposes.
 */

export interface RedactionResult {
  redacted: string;
  redactions: Array<{
    type: string;
    count: number;
    pattern: string;
  }>;
}

/**
 * Email pattern: user@domain.com
 */
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

/**
 * Phone number patterns (US format and international)
 */
const PHONE_PATTERNS = [
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // US: 123-456-7890
  /\b\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b/g, // International
];

/**
 * SSN pattern: XXX-XX-XXXX
 */
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;

/**
 * Credit card pattern (basic - 13-19 digits with optional dashes/spaces)
 */
const CREDIT_CARD_PATTERN = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g;

/**
 * API key patterns (common formats)
 */
const API_KEY_PATTERNS = [
  /\b[A-Za-z0-9]{32,}\b/g, // Generic long alphanumeric
  /\bsk-[A-Za-z0-9]{20,}\b/gi, // OpenAI-style
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gi, // Slack tokens
  /\bghp_[A-Za-z0-9]{36,}\b/gi, // GitHub personal access tokens
  /\bgho_[A-Za-z0-9]{36,}\b/gi, // GitHub OAuth tokens
  /\bghu_[A-Za-z0-9]{36,}\b/gi, // GitHub user-to-server tokens
  /\bghs_[A-Za-z0-9]{36,}\b/gi, // GitHub server-to-server tokens
  /\bghr_[A-Za-z0-9]{36,}\b/gi, // GitHub refresh tokens
];

/**
 * IP address pattern
 */
const IP_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

/**
 * Address pattern (basic - street number + street name)
 */
const ADDRESS_PATTERN = /\b\d+\s+[A-Za-z0-9\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Circle|Cir)\b/gi;

/**
 * Redacts PII from content, preserving shape with markers.
 * 
 * @param content - Content that may contain PII
 * @param options - Redaction options
 * @returns Redacted content and metadata
 */
export function redactPII(content: string): RedactionResult {
  let redacted = content;
  const redactions: Array<{ type: string; count: number; pattern: string }> = [];

  // Redact emails
  const emailMatches = redacted.match(EMAIL_PATTERN);
  if (emailMatches) {
    redacted = redacted.replace(EMAIL_PATTERN, "[EMAIL_REDACTED]");
    redactions.push({
      type: "email",
      count: emailMatches.length,
      pattern: "email@domain.com",
    });
  }

  // Redact phone numbers
  let phoneCount = 0;
  for (const pattern of PHONE_PATTERNS) {
    const matches = redacted.match(pattern);
    if (matches) {
      phoneCount += matches.length;
      redacted = redacted.replace(pattern, "[PHONE_REDACTED]");
    }
  }
  if (phoneCount > 0) {
    redactions.push({
      type: "phone",
      count: phoneCount,
      pattern: "XXX-XXX-XXXX",
    });
  }

  // Redact SSNs
  const ssnMatches = redacted.match(SSN_PATTERN);
  if (ssnMatches) {
    redacted = redacted.replace(SSN_PATTERN, "[SSN_REDACTED]");
    redactions.push({
      type: "ssn",
      count: ssnMatches.length,
      pattern: "XXX-XX-XXXX",
    });
  }

  // Redact credit cards
  const ccMatches = redacted.match(CREDIT_CARD_PATTERN);
  if (ccMatches) {
    redacted = redacted.replace(CREDIT_CARD_PATTERN, "[CREDIT_CARD_REDACTED]");
    redactions.push({
      type: "credit_card",
      count: ccMatches.length,
      pattern: "XXXX-XXXX-XXXX-XXXX",
    });
  }

  // Redact API keys
  let apiKeyCount = 0;
  for (const pattern of API_KEY_PATTERNS) {
    const matches = redacted.match(pattern);
    if (matches) {
      apiKeyCount += matches.length;
      redacted = redacted.replace(pattern, "[API_KEY_REDACTED]");
    }
  }
  if (apiKeyCount > 0) {
    redactions.push({
      type: "api_key",
      count: apiKeyCount,
      pattern: "sk-... or token format",
    });
  }

  // Redact IP addresses (optional - may be legitimate in some contexts)
  // Uncomment if needed:
  // const ipMatches = redacted.match(IP_PATTERN);
  // if (ipMatches) {
  //   redacted = redacted.replace(IP_PATTERN, "[IP_REDACTED]");
  //   redactions.push({
  //     type: "ip_address",
  //     count: ipMatches.length,
  //     pattern: "XXX.XXX.XXX.XXX",
  //   });
  // }

  // Redact addresses
  const addressMatches = redacted.match(ADDRESS_PATTERN);
  if (addressMatches) {
    redacted = redacted.replace(ADDRESS_PATTERN, "[ADDRESS_REDACTED]");
    redactions.push({
      type: "address",
      count: addressMatches.length,
      pattern: "123 Main Street",
    });
  }

  return {
    redacted,
    redactions,
  };
}

/**
 * Redacts PII from an object recursively.
 * Useful for redacting JSON objects (e.g., audit logs).
 * 
 * @param obj - Object that may contain PII
 * @returns Redacted object (new object, original unchanged)
 */
export function redactPIIFromObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    return redactPII(obj).redacted;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactPIIFromObject(item));
  }

  if (typeof obj === "object") {
    const redacted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      redacted[key] = redactPIIFromObject(value);
    }
    return redacted;
  }

  return obj;
}
