/**
 * Eval case types and assertions
 */

export interface EvalAssertion {
  sectionsEmpty?: boolean;
  sourcesEmpty?: boolean;
  answerNotEmpty?: boolean;
  answerContainsAny?: string[];
  answerContainsAll?: string[];
  sourcesDeduped?: boolean;
  sourceTypeLabelsValid?: boolean;
  maxLatencyMs?: number;
}

export interface EvalCase {
  id: string;
  input: string;
  assertions: EvalAssertion;
}

export interface EvalFixture {
  name: string;
  description: string;
  cases: EvalCase[];
}

export interface EvalCaseResult {
  caseId: string;
  input: string;
  passed: boolean;
  failures: string[];
  latencyMs: number;
  response?: {
    answer: string;
    sections: any[];
    sources: any[];
  };
}

export interface EvalReport {
  timestamp: string;
  totalCases: number;
  passed: number;
  failed: number;
  passRate: number;
  results: EvalCaseResult[];
  fixtureResults: Record<string, {
    name: string;
    passed: number;
    failed: number;
    cases: EvalCaseResult[];
  }>;
}
