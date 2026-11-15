import type { CefrLevel } from "./generationGuidance";

export function readingGenerationPolicy(level: CefrLevel) {
  return level === "B2"
    ? { totalMs: 110_000, maxAttempts: 2, reviewTimeoutMs: 50_000, minimumReviewMs: 15_000 }
    : { totalMs: 270_000, maxAttempts: 5, reviewTimeoutMs: level === "C1" || level === "C2" ? 120_000 : 90_000, minimumReviewMs: 1_000 };
}

/** Reserve time for review: a late replacement is never returned unchecked. */
export function readingStageTimeout(policy: ReturnType<typeof readingGenerationPolicy>, stage: "generation" | "review", remainingMs: number, generationTimeoutMs: number) {
  const available = remainingMs - (stage === "generation" ? policy.minimumReviewMs : 0);
  return Math.max(0, Math.min(stage === "generation" ? generationTimeoutMs : policy.reviewTimeoutMs, available));
}
