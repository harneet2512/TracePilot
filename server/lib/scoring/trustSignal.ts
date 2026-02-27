import type { DeterministicScoringResult } from "./deterministicChecks";

export type TrustSignalLevel = "grounded" | "review" | "warning";

export interface TrustSignal {
  level: TrustSignalLevel;
  label: string;
  detail?: string;
}

/**
 * Compute trust signal from deterministic scoring result.
 * Smalltalk: same level logic but empty label so UI can hide the badge.
 */
export function computeTrustSignal(
  result: DeterministicScoringResult,
  options?: { smalltalk?: boolean }
): TrustSignal {
  const smalltalk = options?.smalltalk ?? false;
  const {
    citationCoverageRate: coverage,
    citationIntegrityRate: integrity,
    formatValidRate,
    piiLeakDetected,
    retrievalRelevanceProxy: relevance,
    failedChecks,
    mustCitePass,
  } = result;

  const formatValid = formatValidRate >= 1;
  const noFailedChecks = failedChecks.length === 0;

  // Lowest: warning
  if (
    coverage < 0.3 ||
    integrity < 0.5 ||
    piiLeakDetected ||
    relevance < 0.35 ||
    !mustCitePass
  ) {
    return {
      level: "warning",
      label: smalltalk ? "" : "warning",
      detail: smalltalk ? undefined : "source support limited, verify details",
    };
  }

  // Highest: grounded
  if (
    coverage >= 0.6 &&
    integrity >= 0.8 &&
    formatValid &&
    !piiLeakDetected &&
    relevance >= 0.4 &&
    noFailedChecks
  ) {
    return {
      level: "grounded",
      label: smalltalk ? "" : "grounded",
      detail: smalltalk ? undefined : "answer is supported by cited sources",
    };
  }

  // Middle: review sources
  return {
    level: "review",
    label: smalltalk ? "" : "review sources",
    detail: smalltalk ? undefined : "some claims may need checking",
  };
}
