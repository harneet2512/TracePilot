import type { Citation } from "@shared/schema";
import { storage } from "../../storage";
import { runDeterministicChecks } from "./deterministicChecks";
import { computeTrustSignal, type TrustSignal } from "./trustSignal";
import { runLlmJudge } from "./llmJudge";
import { runEnterpriseEvalPack } from "./enterpriseEvalPack";

export interface CaptureReplyArtifactsInput {
  chatId: string;
  messageId: string;
  answerText: string;
  traceId?: string;
  streamed?: boolean;
  latencyMs?: number;
  ttftMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  status?: "ok" | "error";
  errorType?: string;
  citations?: Citation[];
  retrieval?: {
    mode?: string;
    topK?: number;
    chunksReturnedCount?: number;
    sourcesReturnedCount?: number;
    topSimilarity?: number;
    retrievalLatencyMs?: number;
    retrievedChunks?: Array<{
      chunkId: string;
      sourceId: string;
      title?: string;
      snippet?: string;
      score?: number;
      url?: string;
    }>;
    dedupStats?: Record<string, unknown>;
  };
  tools?: {
    toolCalls?: unknown[];
    toolSelectionAccuracy?: number;
    parameterCorrectness?: number;
    idempotencyKey?: string;
    duplicateActionDetected?: boolean;
    retryCount?: number;
  };
  expectedRefusal?: boolean;
  mustCite?: boolean;
  expectedPoints?: string[];
  userPromptForJudge?: string;
  /** When true, trust signal uses empty label so UI can hide badge (e.g. smalltalk). */
  smalltalk?: boolean;
}

export interface CaptureReplyArtifactsResult {
  replyId: string;
  trustSignal: TrustSignal;
}

export async function captureReplyArtifacts(input: CaptureReplyArtifactsInput): Promise<CaptureReplyArtifactsResult> {
  const createdReply = await storage.createChatReply({
    chatId: input.chatId,
    messageId: input.messageId,
    latencyMs: input.latencyMs,
    ttftMs: input.ttftMs,
    tokensIn: input.tokensIn,
    tokensOut: input.tokensOut,
    costUsd: input.costUsd,
    status: input.status ?? "ok",
    errorType: input.errorType,
    traceId: input.traceId,
    streamed: input.streamed ?? true,
  });

  const deterministic = runDeterministicChecks({
    userPrompt: input.userPromptForJudge ?? "",
    answerText: input.answerText,
    citations: input.citations ?? [],
    retrievedChunks: (input.retrieval?.retrievedChunks ?? []).map((chunk) => ({
      chunkId: chunk.chunkId,
      sourceId: chunk.sourceId,
      snippet: chunk.snippet,
      score: chunk.score,
    })),
    mustCite: input.mustCite,
    expectedRefusal: input.expectedRefusal,
  });

  const trustSignal = computeTrustSignal(deterministic, { smalltalk: input.smalltalk });

  await storage.createRetrievalArtifact({
    replyId: createdReply.id,
    retrievalMode: input.retrieval?.mode ?? "hybrid",
    topK: input.retrieval?.topK ?? 0,
    chunksReturnedCount: input.retrieval?.chunksReturnedCount ?? (input.retrieval?.retrievedChunks?.length ?? 0),
    sourcesReturnedCount: input.retrieval?.sourcesReturnedCount ?? 0,
    topSimilarity: input.retrieval?.topSimilarity ?? 0,
    retrievalLatencyMs: input.retrieval?.retrievalLatencyMs ?? 0,
    retrievedChunksJson: input.retrieval?.retrievedChunks ?? [],
    dedupStatsJson: {
      ...(input.retrieval?.dedupStats ?? {}),
      queryText: input.userPromptForJudge ?? "",
      answerTextPreview: input.answerText.slice(0, 500),
    },
  });

  await storage.createCitationArtifact({
    replyId: createdReply.id,
    citationsJson: input.citations ?? [],
    citationCoverageRate: deterministic.citationCoverageRate,
    citationIntegrityRate: deterministic.citationIntegrityRate,
    citationMisattributionRate: deterministic.citationMisattributionRate,
    repairApplied: false,
    repairNotesJson: deterministic.failedChecks,
  });

  if (input.tools && ((input.tools.toolCalls?.length ?? 0) > 0 || input.tools.idempotencyKey)) {
    await storage.createToolArtifact({
      replyId: createdReply.id,
      toolCallsJson: input.tools.toolCalls ?? [],
      toolSelectionAccuracy: input.tools.toolSelectionAccuracy,
      parameterCorrectness: input.tools.parameterCorrectness,
      idempotencyKey: input.tools.idempotencyKey,
      duplicateActionDetected: input.tools.duplicateActionDetected ?? false,
      retryCount: input.tools.retryCount ?? 0,
    });
  }

  // Keep deterministic results immediately available.
  await storage.createEvalArtifact({
    replyId: createdReply.id,
    claimsJson: [],
    claimLabelsJson: [],
    groundedClaimRate: Math.max(0, 1 - deterministic.citationMisattributionRate),
    unsupportedClaimRate: Math.max(0, 1 - deterministic.citationCoverageRate),
    contradictionRate: 0,
    completenessScore: deterministic.citationCoverageRate,
    missingPointsJson: input.expectedPoints ?? [],
    answerRelevanceScore: deterministic.retrievalRelevanceProxy,
    contextRelevanceScore: deterministic.retrievalRelevanceProxy,
    contextRecallScore: deterministic.citationCoverageRate,
    lowEvidenceCalibrationJson: {
      pass: !deterministic.piiLeakDetected && deterministic.retrievalRelevanceProxy >= 0.35,
      rationale: deterministic.failedChecks.length
        ? `Deterministic checks: ${deterministic.failedChecks.join(", ")}`
        : "Deterministic checks passed.",
      safety: { piiLeakDetected: deterministic.piiLeakDetected },
      overCitingRate: deterministic.overCitingRate,
    },
    formatValidRate: deterministic.formatValidRate,
    judgeModel: "deterministic",
    judgeVersion: "v1",
    judgeRationalesJson: deterministic.failedChecks.length ? deterministic.failedChecks : ["deterministic_pass"],
  });

  return { replyId: createdReply.id, trustSignal };
}

export async function scoreReplyWithJudge(replyId: string, userPromptForJudge?: string): Promise<void> {
  const reply = await storage.getChatReply(replyId);
  if (!reply) {
    throw new Error(`Reply not found: ${replyId}`);
  }

  const message = await storage.getMessages(reply.chatId);
  const assistantMessage = message.find((m) => m.id === reply.messageId);
  if (!assistantMessage) {
    throw new Error(`Assistant message not found for reply: ${replyId}`);
  }

  const retrieval = await storage.getRetrievalArtifact(replyId);
  const citations = await storage.getCitationArtifact(replyId);
  const tool = await storage.getToolArtifact(replyId);
  const llmEval = await runLlmJudge({
    userPrompt: userPromptForJudge ?? "",
    answerText: assistantMessage.content,
    retrievedChunks: ((retrieval?.retrievedChunksJson as any[]) ?? []).map((chunk) => ({
      chunkId: String(chunk.chunkId ?? ""),
      sourceId: String(chunk.sourceId ?? ""),
      title: chunk.title ? String(chunk.title) : undefined,
      snippet: chunk.snippet ? String(chunk.snippet) : undefined,
      score: typeof chunk.score === "number" ? chunk.score : undefined,
    })),
    expectedPoints: (retrieval?.dedupStatsJson as any)?.expectedPoints ?? [],
  });

  await storage.createEvalArtifact({
    replyId,
    claimsJson: llmEval.claims,
    claimLabelsJson: llmEval.claimLabels,
    groundedClaimRate: llmEval.groundedClaimRate,
    unsupportedClaimRate: llmEval.unsupportedClaimRate,
    contradictionRate: llmEval.contradictionRate,
    completenessScore: llmEval.completenessScore,
    missingPointsJson: llmEval.missingPoints,
    answerRelevanceScore: llmEval.answerRelevanceScore,
    contextRelevanceScore: llmEval.contextRelevanceScore,
    contextRecallScore: llmEval.contextRecallScore,
    lowEvidenceCalibrationJson: llmEval.lowEvidenceCalibration,
    formatValidRate: llmEval.formatValidRate,
    judgeModel: llmEval.judgeModel,
    judgeVersion: llmEval.judgeVersion,
    judgeRationalesJson: llmEval.judgeRationales,
  });

  const enterpriseEvalArtifact = runEnterpriseEvalPack({
    replyId,
    userPrompt: userPromptForJudge ?? "",
    answerText: assistantMessage.content,
    citations,
    retrieval,
    llmEval,
    tool,
  });
  await storage.createEnterpriseEvalArtifact(enterpriseEvalArtifact);

  await storage.updateChatReply(replyId, {
    scored: true,
    scoredAt: new Date(),
    status: reply.status,
  });

  if (citations && citations.citationIntegrityRate !== null && citations.citationIntegrityRate !== undefined) {
    // No-op placeholder to keep compile happy and clarify future extensibility.
  }
}
