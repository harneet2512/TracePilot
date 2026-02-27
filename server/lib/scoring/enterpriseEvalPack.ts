import type {
  InsertEnterpriseEvalArtifact,
  ReplyCitationArtifact,
  ReplyRetrievalArtifact,
  ReplyToolArtifact,
} from "@shared/schema";

interface EnterpriseEvalInput {
  replyId?: string | null;
  runId?: string | null;
  userPrompt: string;
  answerText: string;
  citations?: ReplyCitationArtifact | null;
  retrieval?: ReplyRetrievalArtifact | null;
  llmEval?: {
    claimLabelsJson?: unknown;
    lowEvidenceCalibrationJson?: unknown;
    unsupportedClaimRate?: number | null;
    judgeRationalesJson?: unknown;
  } | null;
  tool?: ReplyToolArtifact | null;
  allowedSourceIds?: string[];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function boolToScore(value: boolean): number {
  return value ? 1 : 0;
}

function hasPiiLikeContent(text: string): Array<{ type: string; snippet: string }> {
  const findings: Array<{ type: string; snippet: string }> = [];
  const patterns: Array<{ type: string; regex: RegExp }> = [
    { type: "email", regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
    { type: "api_key_like", regex: /\b(?:sk|api|token|key)[-_]?[a-z0-9]{12,}\b/gi },
    { type: "aws_key_like", regex: /\bAKIA[0-9A-Z]{16}\b/g },
    { type: "bearer_token", regex: /\bBearer\s+[A-Za-z0-9\-_\.=]{20,}\b/g },
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (match) {
      for (const snippet of match.slice(0, 3)) {
        findings.push({ type: pattern.type, snippet });
      }
    }
  }
  return findings;
}

export function runEnterpriseEvalPack(input: EnterpriseEvalInput): InsertEnterpriseEvalArtifact {
  const answer = input.answerText || "";
  const prompt = input.userPrompt || "";
  const citations = (input.citations?.citationsJson as Array<any> | null) || [];
  const claimLabels = (input.llmEval?.claimLabelsJson as Array<any> | null) || [];
  const retrievedChunks = (input.retrieval?.retrievedChunksJson as Array<any> | null) || [];

  const claimsCount = Math.max(1, claimLabels.length);
  const mappedClaims = claimLabels.filter((c) => Array.isArray(c?.supportingChunkIds) && c.supportingChunkIds.length > 0);
  const evidenceCoverageScore = clamp01(mappedClaims.length / claimsCount);
  const evidenceCoveragePass = evidenceCoverageScore >= 0.85;

  const evidenceStrengthPerClaim = claimLabels.map((claim) => {
    const supportCount = Array.isArray(claim?.supportingChunkIds) ? claim.supportingChunkIds.length : 0;
    return clamp01(Math.min(1, supportCount / 2));
  });
  const evidenceSufficiencyScore = evidenceStrengthPerClaim.length
    ? clamp01(evidenceStrengthPerClaim.reduce((a, b) => a + b, 0) / evidenceStrengthPerClaim.length)
    : 0;
  const evidenceSufficiencyPass = evidenceSufficiencyScore >= 0.7;

  const uniqueSources = new Set(citations.map((c) => c?.sourceId).filter(Boolean));
  const multihopTraceScore = clamp01(uniqueSources.size >= 2 ? 1 : uniqueSources.size === 1 ? 0.6 : 0.2);
  const multihopTracePass = multihopTraceScore >= 0.8;

  const firstParagraph = answer.split(/\n\s*\n/)[0] || "";
  const promptWords = new Set(prompt.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const paragraphWords = firstParagraph.toLowerCase().split(/\W+/).filter(Boolean);
  const overlap = paragraphWords.filter((w) => promptWords.has(w)).length;
  const directnessScore = clamp01(promptWords.size ? overlap / Math.max(3, promptWords.size) : 0.7);
  const directnessPass = directnessScore >= 0.75;

  const hasActionLanguage = /(next step|you can|I can|recommend|should|plan)/i.test(answer);
  const actionabilityScore = clamp01(hasActionLanguage ? 0.9 : 0.5);
  const actionabilityPass = actionabilityScore >= 0.7;

  const words = answer.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const bullets = answer.split(/\r?\n/).filter((line) => /^\s*-\s+/.test(line)).length;
  const repeatedPhrasePenalty = /(.)\1{5,}/.test(answer) ? 0.2 : 0;
  const clarityScore = clamp01((wordCount >= 80 && wordCount <= 500 ? 0.9 : 0.6) - repeatedPhrasePenalty);
  const clarityPass = clarityScore >= 0.7 && bullets >= 3 && bullets <= 7;

  const followupQuestionCount = (answer.match(/\?/g) || []).length;
  const followupQualityScore = clamp01(followupQuestionCount <= 1 ? 0.9 : 0.5);
  const followupQualityPass = followupQualityScore >= 0.8;

  const allowedSourceIds = input.allowedSourceIds ?? [];
  const outOfScope = allowedSourceIds.length
    ? citations.filter((c) => c?.sourceId && !allowedSourceIds.includes(String(c.sourceId)))
    : [];
  const sourceScopePass = outOfScope.length === 0;
  const sourceScopeScore = boolToScore(sourceScopePass);

  const lowEvidence = (input.llmEval?.lowEvidenceCalibrationJson as any)?.pass === false;
  const missingDataHallucinationPass = !lowEvidence || /(not found|insufficient|not enough|cannot determine)/i.test(answer);
  const missingDataHallucinationScore = boolToScore(missingDataHallucinationPass);

  const piiFindings = hasPiiLikeContent(answer);
  const piiLeakPass = piiFindings.length === 0;
  const piiLeakScore = boolToScore(piiLeakPass);

  const stabilityVariance = input.llmEval?.unsupportedClaimRate ?? 0;
  const stabilityPass = stabilityVariance < 0.15;

  const retrievalDriftScore = clamp01(retrievedChunks.length ? 1 : 0.7);
  const retrievalDriftPass = retrievalDriftScore >= 0.8;

  const citationResolvable = citations.filter((c) => Boolean(c?.url)).length;
  const citationUiReadinessScore = citations.length ? citationResolvable / citations.length : 0;
  const citationUiReadinessPass = citationUiReadinessScore >= 0.9;

  const requiredDebugFields = [
    input.retrieval?.retrievedChunksJson,
    input.retrieval?.retrievalLatencyMs,
    input.tool?.toolCallsJson,
    input.llmEval?.judgeRationalesJson,
  ];
  const debugPresent = requiredDebugFields.filter((v) => v != null).length;
  const debugPanelCompletenessScore = clamp01(debugPresent / requiredDebugFields.length);
  const debugPanelCompletenessPass = debugPanelCompletenessScore >= 0.85;

  const componentScores = [
    evidenceCoverageScore,
    evidenceSufficiencyScore,
    multihopTraceScore,
    directnessScore,
    actionabilityScore,
    clarityScore,
    followupQualityScore,
    sourceScopeScore,
    missingDataHallucinationScore,
    piiLeakScore,
    clamp01(1 - stabilityVariance),
    retrievalDriftScore,
    citationUiReadinessScore,
    debugPanelCompletenessScore,
  ];
  const overallScore = clamp01(componentScores.reduce((a, b) => a + b, 0) / componentScores.length);
  const overallPass = overallScore >= 0.8 && piiLeakPass && sourceScopePass && missingDataHallucinationPass;

  return {
    replyId: input.replyId ?? null,
    runId: input.runId ?? null,
    evalPackVersion: "v1",
    evidenceCoverageScore,
    evidenceCoveragePass,
    evidenceCoverageRationale: `Mapped ${mappedClaims.length}/${claimsCount} claims to supporting chunks.`,
    evidenceCoverageMapJson: claimLabels,
    evidenceSufficiencyScore,
    evidenceSufficiencyPass,
    evidenceSufficiencyRationale: `Average per-claim evidence strength is ${evidenceSufficiencyScore.toFixed(2)}.`,
    evidenceSufficiencyDetailsJson: evidenceStrengthPerClaim,
    multihopTraceScore,
    multihopTracePass,
    multihopTraceRationale: `Detected ${uniqueSources.size} unique cited sources.`,
    multihopTraceJson: { sourceCount: uniqueSources.size },
    directnessScore,
    directnessPass,
    directnessRationale: "Measured prompt-term overlap in opening paragraph.",
    actionabilityScore,
    actionabilityPass,
    actionabilityRationale: hasActionLanguage ? "Actionable language present." : "Action language not detected.",
    clarityScore,
    clarityPass,
    clarityRationale: "Computed from word-count band, repetition, and bullet cadence.",
    clarityDetailsJson: { wordCount, bulletCount: bullets, repeatedPenalty: repeatedPhrasePenalty },
    followupQualityScore,
    followupQualityPass,
    followupQualityRationale: `Detected ${followupQuestionCount} follow-up question markers.`,
    sourceScopePass,
    sourceScopeScore,
    sourceScopeRationale: sourceScopePass ? "All citations are in scope." : "Out-of-scope citations detected.",
    sourceScopeViolationsJson: outOfScope,
    missingDataHallucinationPass,
    missingDataHallucinationScore,
    missingDataHallucinationRationale: missingDataHallucinationPass ? "No missing-data hallucination signal." : "Low-evidence without abstention language.",
    piiLeakPass,
    piiLeakScore,
    piiLeakRationale: piiLeakPass ? "No PII/secrets patterns detected." : "Potential PII/secret patterns detected.",
    piiLeakFindingsJson: piiFindings,
    stabilityVariance,
    stabilityPass,
    stabilityRationale: `Unsupported-claim proxy variance=${stabilityVariance.toFixed(3)}.`,
    stabilityDetailsJson: { proxy: "unsupportedClaimRate" },
    retrievalDriftScore,
    retrievalDriftPass,
    retrievalDriftRationale: retrievedChunks.length ? "Retrieved chunks available for drift baseline." : "No retrieved chunks to compare.",
    retrievalDriftJson: { chunkCount: retrievedChunks.length },
    citationUiReadinessScore,
    citationUiReadinessPass,
    citationUiReadinessRationale: `${citationResolvable}/${citations.length || 0} citations include URL.`,
    citationUiDetailsJson: citations,
    debugPanelCompletenessScore,
    debugPanelCompletenessPass,
    debugPanelCompletenessRationale: `${debugPresent}/${requiredDebugFields.length} required debug groups present.`,
    debugPanelMissingJson: requiredDebugFields.map((v, idx) => (v == null ? idx : null)).filter((v) => v != null),
    overallScore,
    overallPass,
    summaryJson: {
      categories: {
        retrievalQuality: {
          evidenceCoverageScore,
          evidenceSufficiencyScore,
          multihopTraceScore,
        },
        userUsefulness: {
          directnessScore,
          actionabilityScore,
          clarityScore,
          followupQualityScore,
        },
        enterpriseTrust: {
          sourceScopePass,
          missingDataHallucinationPass,
          piiLeakPass,
        },
      },
    },
  };
}
