import { chatCompletion } from "../openai";

export interface JudgeClaimLabel {
  claim: string;
  label: "entailed" | "unsupported" | "contradicted";
  supportingChunkIds: string[];
  rationale: string;
}

export interface LlmJudgeInput {
  userPrompt: string;
  answerText: string;
  retrievedChunks: Array<{
    chunkId: string;
    sourceId: string;
    title?: string;
    snippet?: string;
    score?: number;
  }>;
  expectedPoints?: string[];
}

export interface LlmJudgeResult {
  claims: string[];
  claimLabels: JudgeClaimLabel[];
  groundedClaimRate: number;
  unsupportedClaimRate: number;
  contradictionRate: number;
  completenessScore: number;
  missingPoints: string[];
  answerRelevanceScore: number;
  contextRelevanceScore: number;
  contextRecallScore: number;
  lowEvidenceCalibration: { pass: boolean; rationale: string };
  formatValidRate: number;
  judgeModel: string;
  judgeVersion: string;
  judgeRationales: string[];
}

const judgeJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "claims",
    "claimLabels",
    "scores",
    "missingPoints",
    "lowEvidenceCalibration",
    "judgeRationales",
  ],
  properties: {
    claims: { type: "array", items: { type: "string" } },
    claimLabels: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "label", "supportingChunkIds", "rationale"],
        properties: {
          claim: { type: "string" },
          label: { type: "string", enum: ["entailed", "unsupported", "contradicted"] },
          supportingChunkIds: { type: "array", items: { type: "string" } },
          rationale: { type: "string" },
        },
      },
    },
    scores: {
      type: "object",
      additionalProperties: false,
      required: ["answerRelevance", "contextRelevance", "contextRecall", "completeness", "formatValidRate"],
      properties: {
        answerRelevance: { type: "number", minimum: 0, maximum: 1 },
        contextRelevance: { type: "number", minimum: 0, maximum: 1 },
        contextRecall: { type: "number", minimum: 0, maximum: 1 },
        completeness: { type: "number", minimum: 0, maximum: 1 },
        formatValidRate: { type: "number", minimum: 0, maximum: 1 },
      },
    },
    missingPoints: { type: "array", items: { type: "string" } },
    lowEvidenceCalibration: {
      type: "object",
      additionalProperties: false,
      required: ["pass", "rationale"],
      properties: {
        pass: { type: "boolean" },
        rationale: { type: "string" },
      },
    },
    judgeRationales: { type: "array", items: { type: "string" } },
  },
} as const;

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function runLlmJudge(input: LlmJudgeInput): Promise<LlmJudgeResult> {
  const chunksPrompt = input.retrievedChunks
    .slice(0, 25)
    .map(
      (chunk, idx) =>
        `[Chunk ${idx + 1}] chunkId=${chunk.chunkId} sourceId=${chunk.sourceId} score=${chunk.score ?? 0}\n${chunk.snippet ?? ""}`,
    )
    .join("\n\n");

  const expectedPointsText = (input.expectedPoints ?? []).length
    ? `Expected points to cover:\n- ${(input.expectedPoints ?? []).join("\n- ")}`
    : "No expected-points rubric was provided.";

  const systemPrompt = [
    "You are a strict RAG quality judge.",
    "Score the answer against the provided retrieval evidence.",
    "Return only valid JSON matching schema.",
    "Keep rationales short and concrete.",
  ].join(" ");

  const userPrompt = [
    `User prompt:\n${input.userPrompt}`,
    `Assistant answer:\n${input.answerText}`,
    expectedPointsText,
    `Retrieved evidence:\n${chunksPrompt}`,
    "Tasks:",
    "1) Extract atomic claims.",
    "2) Label each claim as entailed/unsupported/contradicted against evidence.",
    "3) Score answerRelevance/contextRelevance/contextRecall/completeness/formatValidRate from 0 to 1.",
    "4) Judge low-evidence calibration (did answer abstain/clarify when evidence is weak).",
  ].join("\n\n");

  const raw = await chatCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0, jsonSchema: judgeJsonSchema as unknown as Record<string, unknown> },
  );

  const parsed = safeJsonParse<any>(raw);
  if (!parsed) {
    return {
      claims: [],
      claimLabels: [],
      groundedClaimRate: 0,
      unsupportedClaimRate: 1,
      contradictionRate: 0,
      completenessScore: 0,
      missingPoints: [],
      answerRelevanceScore: 0,
      contextRelevanceScore: 0,
      contextRecallScore: 0,
      lowEvidenceCalibration: { pass: false, rationale: "Judge parsing failed." },
      formatValidRate: 0,
      judgeModel: "gpt-4o-mini",
      judgeVersion: "v1",
      judgeRationales: ["Judge output parse failure"],
    };
  }

  const claimLabels: JudgeClaimLabel[] = Array.isArray(parsed.claimLabels) ? parsed.claimLabels : [];
  const claims = Array.isArray(parsed.claims) ? parsed.claims : claimLabels.map((c) => c.claim);
  const totalClaims = Math.max(1, claimLabels.length || claims.length);
  const entailed = claimLabels.filter((c) => c.label === "entailed").length;
  const unsupported = claimLabels.filter((c) => c.label === "unsupported").length;
  const contradicted = claimLabels.filter((c) => c.label === "contradicted").length;

  return {
    claims,
    claimLabels,
    groundedClaimRate: entailed / totalClaims,
    unsupportedClaimRate: unsupported / totalClaims,
    contradictionRate: contradicted / totalClaims,
    completenessScore: parsed?.scores?.completeness ?? 0,
    missingPoints: Array.isArray(parsed?.missingPoints) ? parsed.missingPoints : [],
    answerRelevanceScore: parsed?.scores?.answerRelevance ?? 0,
    contextRelevanceScore: parsed?.scores?.contextRelevance ?? 0,
    contextRecallScore: parsed?.scores?.contextRecall ?? 0,
    lowEvidenceCalibration: parsed?.lowEvidenceCalibration ?? { pass: false, rationale: "Missing field." },
    formatValidRate: parsed?.scores?.formatValidRate ?? 0,
    judgeModel: "gpt-4o-mini",
    judgeVersion: "v1",
    judgeRationales: Array.isArray(parsed?.judgeRationales) ? parsed.judgeRationales.slice(0, 20) : [],
  };
}
