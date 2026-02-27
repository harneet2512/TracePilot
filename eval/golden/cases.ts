/**
 * Golden eval cases - 10 demo queries with expected facts
 * Each fact MUST appear in the answer with proper citations
 */

export interface ExpectedFact {
  text: string;
  // Specific values that must appear (numbers, dates, names)
  requiredValues?: string[];
  // If true, this fact requires multi-source citation
  requiresMultiSource?: boolean;
}

export interface EvalCase {
  id: string;
  query: string;
  expectedFacts: ExpectedFact[];
  // Minimum number of sources that must be cited
  minSources?: number;
  // Expected source documents (by filename prefix)
  expectedSourcePrefixes?: string[];
}

export const GOLDEN_EVAL_CASES: EvalCase[] = [
  {
    id: "q1-q4-okrs",
    query: "What are our Q4 OKRs for the AI search project?",
    expectedFacts: [
      { text: "Launch semantic search", requiredValues: ["November 15, 2024"] },
      { text: "P95 latency target", requiredValues: ["2s"] },
      { text: "Document indexing target", requiredValues: ["500K"] },
      { text: "Q4 budget", requiredValues: ["$180,000"] },
    ],
    expectedSourcePrefixes: ["Q4_2024_OKRs"],
  },
  {
    id: "q2-blockers",
    query: "Are there any blockers for the AI search launch?",
    expectedFacts: [
      { text: "AWS EU region quota delays", requiresMultiSource: true },
      { text: "Pinecone costs over budget", requiredValues: ["15%"] },
      { text: "Google Drive API rate limits" },
    ],
    minSources: 2,
    expectedSourcePrefixes: ["Engineering_AllHands", "JIRA_INFRA"],
  },
  {
    id: "q3-vector-db",
    query: "What vector database are we using and why?",
    expectedFacts: [
      { text: "Pinecone selected" },
      { text: "Faster time-to-market vs self-hosted" },
      { text: "Pod configuration", requiredValues: ["p1.x4"] },
      { text: "Embedding dimensions", requiredValues: ["3072"] },
      { text: "Similarity metric", requiredValues: ["cosine"] },
      { text: "Monthly cost", requiredValues: ["$300"] },
    ],
    expectedSourcePrefixes: ["AI_Search_Architecture"],
  },
  {
    id: "q4-aws-owner-deadline",
    query: "Who is responsible for fixing the AWS blocker and when is the deadline?",
    expectedFacts: [
      { text: "Owner", requiredValues: ["Jordan Martinez"] },
      { text: "Deadline", requiredValues: ["November 11, 2024"] },
      { text: "Escalation", requiredValues: ["November 1"] },
      { text: "Revenue impact", requiredValues: ["$500K", "ARR"], requiresMultiSource: true },
    ],
    minSources: 2,
    expectedSourcePrefixes: ["JIRA_INFRA", "Engineering_AllHands"],
  },
  {
    id: "q5-2025-roadmap",
    query: "What's our 2025 product roadmap?",
    expectedFacts: [
      { text: "Q1 features", requiredValues: ["Multi-tenancy", "real-time sync", "advanced filters"] },
      { text: "Q2 features", requiredValues: ["Conversational search", "automated summaries"] },
      { text: "Q3 features", requiredValues: ["Microsoft 365", "Slack bot", "mobile apps"] },
      { text: "Q4 features", requiredValues: ["Multi-language", "custom fine-tuning", "analytics"] },
    ],
    expectedSourcePrefixes: ["Product_Roadmap_2025"],
  },
  {
    id: "q6-infra-contact",
    query: "Who should I contact about infrastructure issues?",
    expectedFacts: [
      { text: "Contact name", requiredValues: ["Jordan Martinez"] },
      { text: "Email", requiredValues: ["jordan.m@company.com"] },
      { text: "Slack", requiredValues: ["@jordan"] },
      { text: "Responsibilities", requiredValues: ["AWS", "Pinecone", "scaling"] },
    ],
    expectedSourcePrefixes: ["Team_Quick_Reference"],
  },
  {
    id: "q7-project-cost",
    query: "How much is the AI search project costing us?",
    expectedFacts: [
      { text: "Total budget allocated", requiredValues: ["$2,565,000", "$2.565M"] },
      { text: "Amount spent", requiredValues: ["$214,000", "$214K"] },
      { text: "Infrastructure allocation", requiredValues: ["$2,300,000", "$2.3M"] },
      { text: "LLM API costs", requiredValues: ["$180,000", "$180K"] },
      { text: "Tooling costs", requiredValues: ["$85,000", "$85K"] },
    ],
    expectedSourcePrefixes: ["Q4_2024_OKRs"],
  },
  {
    id: "q8-biggest-risk",
    query: "What's the biggest risk to our Nov 15 launch and what are we doing about it?",
    expectedFacts: [
      { text: "Biggest risk", requiredValues: ["AWS EU", "quota"] },
      { text: "Impact", requiredValues: ["$500K", "EU customers"], requiresMultiSource: true },
      { text: "Escalation action", requiredValues: ["AWS VP", "November 1"] },
      { text: "Fallback plan", requiredValues: ["50 instances"] },
      { text: "Expected resolution", requiredValues: ["November 11"] },
    ],
    minSources: 2,
    expectedSourcePrefixes: ["JIRA_INFRA", "Engineering_AllHands"],
  },
  {
    id: "q9-claude-vs-gpt",
    query: "Why did we choose Claude over GPT-4?",
    expectedFacts: [
      { text: "Cost comparison", requiredValues: ["30%", "cheaper"] },
      { text: "Citation accuracy comparison", requiredValues: ["95%", "78%"] },
      { text: "Decision date", requiredValues: ["September 20, 2024"] },
    ],
    expectedSourcePrefixes: ["AI_Search_Architecture"],
  },
  {
    id: "q10-project-phoenix-overview",
    query: "I'm new to the team - what should I know about Project Phoenix?",
    expectedFacts: [
      { text: "What it is", requiredValues: ["AI-powered", "semantic search"] },
      { text: "Launch date", requiredValues: ["November 15, 2024"] },
      { text: "Project lead", requiredValues: ["Alex Kim"] },
      { text: "Team size", requiredValues: ["15", "engineers"] },
      { text: "Status", requiredValues: ["beta", "on track"] },
      { text: "Latency target", requiredValues: ["2s", "p95"] },
      { text: "Document target", requiredValues: ["500K"] },
      { text: "Satisfaction score", requiredValues: ["92%", "94%"] },
      { text: "Budget", requiredValues: ["$2,565,000", "$2.565M"] },
      { text: "Current blocker", requiredValues: ["AWS", "EU", "quota"] },
    ],
    minSources: 3,
    expectedSourcePrefixes: ["Q4_2024_OKRs", "AI_Search_Architecture", "Engineering_AllHands"],
  },
];

// Export case IDs for reference
export const GOLDEN_CASE_IDS = GOLDEN_EVAL_CASES.map(c => c.id);

// Helper to get case by ID
export function getGoldenCase(id: string): EvalCase | undefined {
  return GOLDEN_EVAL_CASES.find(c => c.id === id);
}
