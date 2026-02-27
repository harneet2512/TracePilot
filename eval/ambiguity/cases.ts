/**
 * Ambiguity test cases - queries that should trigger clarifying questions
 * instead of definitive answers.
 */

export interface AmbiguityCase {
  id: string;
  query: string;
  /** Keywords that should appear in the clarifying questions */
  expectedClarificationKeywords: string[];
  /** The model should NOT give a definitive answer */
  shouldNotAnswer: boolean;
}

export interface AmbiguityScoreResult {
  caseId: string;
  passed: boolean;
  needsClarificationSet: boolean;
  clarifyingQuestionsCount: number;
  keywordsMatched: string[];
  keywordsMissing: string[];
  gaveDefinitiveAnswer: boolean;
  failures: string[];
}

export const AMBIGUITY_CASES: AmbiguityCase[] = [
  {
    id: "amb1-okrs-vague",
    query: "What are our OKRs?",
    expectedClarificationKeywords: ["quarter", "project", "which"],
    shouldNotAnswer: true,
  },
  {
    id: "amb2-on-track",
    query: "Are we on track?",
    expectedClarificationKeywords: ["milestone", "project", "which", "goal"],
    shouldNotAnswer: true,
  },
  {
    id: "amb3-budget",
    query: "What's the budget?",
    expectedClarificationKeywords: ["project", "quarter", "which", "budget"],
    shouldNotAnswer: true,
  },
  {
    id: "amb4-owner",
    query: "Who owns this?",
    expectedClarificationKeywords: ["component", "feature", "which", "what"],
    shouldNotAnswer: true,
  },
  {
    id: "amb5-blocker",
    query: "What's the status of the blocker?",
    expectedClarificationKeywords: ["which", "blocker", "specific"],
    shouldNotAnswer: true,
  },
  {
    id: "amb6-next-steps",
    query: "What should I do next?",
    expectedClarificationKeywords: ["role", "context", "task", "project"],
    shouldNotAnswer: true,
  },
  {
    id: "amb7-architecture",
    query: "Summarize the architecture",
    expectedClarificationKeywords: ["depth", "component", "level", "which", "area"],
    shouldNotAnswer: true,
  },
  {
    id: "amb8-risks",
    query: "Show me risks",
    expectedClarificationKeywords: ["timeframe", "project", "which", "type"],
    shouldNotAnswer: true,
  },
];

/**
 * Score an ambiguity test case result.
 * Checks that the model asked for clarification instead of answering definitively.
 */
export function scoreAmbiguity(
  result: {
    needsClarification?: boolean;
    clarifyingQuestions?: string[];
    answerText: string;
  },
  testCase: AmbiguityCase
): AmbiguityScoreResult {
  const failures: string[] = [];
  const needsClarificationSet = result.needsClarification === true;
  const questions = result.clarifyingQuestions || [];

  if (!needsClarificationSet) {
    failures.push("needsClarification was not set to true");
  }

  if (questions.length === 0) {
    failures.push("No clarifying questions provided");
  }

  // Check that clarifying questions contain expected keywords
  const questionsLower = questions.join(" ").toLowerCase();
  const answerLower = result.answerText.toLowerCase();
  const allText = (questionsLower + " " + answerLower).toLowerCase();

  const keywordsMatched: string[] = [];
  const keywordsMissing: string[] = [];

  for (const keyword of testCase.expectedClarificationKeywords) {
    if (allText.includes(keyword.toLowerCase())) {
      keywordsMatched.push(keyword);
    } else {
      keywordsMissing.push(keyword);
    }
  }

  // Require at least 1 keyword match (flexible — model may phrase differently)
  if (keywordsMatched.length === 0) {
    failures.push(`No expected keywords found in clarification (expected any of: ${testCase.expectedClarificationKeywords.join(", ")})`);
  }

  // Check the model didn't give a definitive answer with specific data
  // Heuristic: if the answer contains numbers/dates/names that look like real data, it may be answering
  const definitiveIndicators = /\$[\d,]+|\d{1,2}\/\d{1,2}\/\d{4}|November \d+|Jordan Martinez|Alex Kim/i;
  const gaveDefinitiveAnswer = definitiveIndicators.test(result.answerText) && !needsClarificationSet;

  if (gaveDefinitiveAnswer && testCase.shouldNotAnswer) {
    failures.push("Model gave a definitive answer with specific data instead of asking for clarification");
  }

  return {
    caseId: testCase.id,
    passed: failures.length === 0,
    needsClarificationSet,
    clarifyingQuestionsCount: questions.length,
    keywordsMatched,
    keywordsMissing,
    gaveDefinitiveAnswer,
    failures,
  };
}

export const AMBIGUITY_CASE_IDS = AMBIGUITY_CASES.map(c => c.id);
