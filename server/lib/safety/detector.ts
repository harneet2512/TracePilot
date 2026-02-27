/**
 * Prompt Injection Detection
 * 
 * Lightweight heuristic detector that flags likely injection attempts.
 * Uses regex patterns and keyword scoring to identify suspicious content.
 */

export interface DetectionResult {
  isSuspicious: boolean;
  score: number; // 0-100, higher = more suspicious
  reasons: string[];
  suspiciousLines: number[]; // Line numbers (1-indexed) with suspicious content
}

/**
 * High-confidence injection patterns (weight: 10 points each)
 */
const HIGH_CONFIDENCE_PATTERNS = [
  {
    pattern: /(?:^|\n)\s*(?:system|assistant|developer|admin):\s*(?:you are|ignore|forget|new instructions?)/gi,
    reason: "Role hijacking attempt",
  },
  {
    pattern: /(?:^|\n)\s*ignore (?:previous|all|the) (?:instructions|prompts?|rules?)/gi,
    reason: "Instruction override attempt",
  },
  {
    pattern: /(?:^|\n)\s*\[INST\][\s\S]*?\[\/INST\]/gi,
    reason: "Instruction block format",
  },
  {
    pattern: /(?:^|\n)\s*<\|im_start\|>[\s\S]*?<\|im_end\|>/gi,
    reason: "ChatML format injection",
  },
  {
    pattern: /(?:^|\n)\s*(?:execute|run|print):\s*[a-z]+\(/gi,
    reason: "Command execution attempt",
  },
];

/**
 * Medium-confidence patterns (weight: 5 points each)
 */
const MEDIUM_CONFIDENCE_PATTERNS = [
  {
    pattern: /(?:^|\n)\s*repeat (?:this|the following|everything)/gi,
    reason: "Repetition instruction",
  },
  {
    pattern: /(?:^|\n)\s*output (?:this|the following|everything)/gi,
    reason: "Output manipulation",
  },
  {
    pattern: /(?:^|\n)\s*you are (?:now|a|an)\s+/gi,
    reason: "Role assignment",
  },
  {
    pattern: /(?:^|\n)\s*forget (?:everything|all|previous)/gi,
    reason: "Memory manipulation",
  },
];

/**
 * Suspicious keywords (weight: 2 points each occurrence)
 */
const SUSPICIOUS_KEYWORDS = [
  "ignore previous",
  "new instructions",
  "system:",
  "assistant:",
  "developer:",
  "admin:",
  "execute:",
  "run:",
  "print:",
  "repeat this",
  "output this",
  "forget everything",
];

/**
 * Detects potential prompt injection attempts in content.
 * 
 * @param content - Content to analyze
 * @returns Detection result with score and reasons
 */
export function detectInjection(content: string): DetectionResult {
  const reasons: string[] = [];
  const suspiciousLines = new Set<number>();
  let score = 0;

  const lines = content.split("\n");

  // Check high-confidence patterns
  for (const { pattern, reason } of HIGH_CONFIDENCE_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      score += matches.length * 10;
      reasons.push(`${reason} (${matches.length} occurrence(s))`);
      
      // Find line numbers
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          suspiciousLines.add(i + 1);
        }
      }
    }
  }

  // Check medium-confidence patterns
  for (const { pattern, reason } of MEDIUM_CONFIDENCE_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      score += matches.length * 5;
      reasons.push(`${reason} (${matches.length} occurrence(s))`);
      
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          suspiciousLines.add(i + 1);
        }
      }
    }
  }

  // Check suspicious keywords
  const lowerContent = content.toLowerCase();
  for (const keyword of SUSPICIOUS_KEYWORDS) {
    const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matches = content.match(regex);
    if (matches) {
      score += matches.length * 2;
      
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          suspiciousLines.add(i + 1);
        }
      }
    }
  }

  // Threshold: score >= 10 is suspicious
  const isSuspicious = score >= 10;

  return {
    isSuspicious,
    score: Math.min(score, 100), // Cap at 100
    reasons: isSuspicious ? reasons : [],
    suspiciousLines: Array.from(suspiciousLines).sort((a, b) => a - b),
  };
}

/**
 * Strips suspicious lines from content if detection score is high.
 * 
 * @param content - Content to clean
 * @param detection - Detection result
 * @param threshold - Score threshold for stripping (default: 20)
 * @returns Cleaned content and metadata
 */
export function stripSuspiciousLines(
  content: string,
  detection: DetectionResult,
  threshold: number = 20
): { cleaned: string; linesRemoved: number } {
  if (detection.score < threshold || detection.suspiciousLines.length === 0) {
    return { cleaned: content, linesRemoved: 0 };
  }

  const lines = content.split("\n");
  const cleanedLines: string[] = [];
  let linesRemoved = 0;

  for (let i = 0; i < lines.length; i++) {
    if (detection.suspiciousLines.includes(i + 1)) {
      linesRemoved++;
      // Replace with placeholder
      cleanedLines.push("[Suspicious content removed]");
    } else {
      cleanedLines.push(lines[i]);
    }
  }

  return {
    cleaned: cleanedLines.join("\n"),
    linesRemoved,
  };
}
