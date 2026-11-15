import type { CefrLevel } from "./generationGuidance";

export const DEFAULT_READING_REVIEW_MODEL = "gpt-5-mini";
// The C1 workload needs close reading of implied stance and contextual nuance.
export const DEFAULT_C1_READING_MODEL = "gpt-5";
export const DEFAULT_C2_READING_MODEL = DEFAULT_C1_READING_MODEL;
type ModelEnvironment = Record<string, string | undefined>;

export function isReasoningReadingModel(model: string) {
  return /^(gpt-5|o[134])(?:-|$)/.test(model);
}

export function readingGenerationModel(level: CefrLevel, env: ModelEnvironment = process.env) {
  if (level === "C2") return env.OPENAI_READING_C2_MODEL || DEFAULT_C2_READING_MODEL;
  if (level === "C1") return env.OPENAI_READING_C1_MODEL || DEFAULT_C1_READING_MODEL;
  if (level === "B2") return env.OPENAI_READING_B2_MODEL || "gpt-4.1";
  return env.OPENAI_MODEL || "gpt-4o-mini";
}

export function listeningGenerationModel(level: CefrLevel, env: ModelEnvironment = process.env) {
  return env.OPENAI_LISTENING_MODEL || (level === "C1" || level === "C2" ? readingGenerationModel(level, env) : env.OPENAI_READING_B2_MODEL || "gpt-4.1");
}

export function readingReviewModel(level: CefrLevel, env: ModelEnvironment = process.env) {
  return (level === "C2" ? env.OPENAI_READING_C2_REVIEW_MODEL : level === "C1" ? env.OPENAI_READING_C1_REVIEW_MODEL : undefined)
    || env.OPENAI_READING_REVIEW_MODEL
    || (level === "C2" ? DEFAULT_C2_READING_MODEL : level === "C1" ? DEFAULT_C1_READING_MODEL : DEFAULT_READING_REVIEW_MODEL);
}

export function readingGenerationSettings(model: string) {
  return isReasoningReadingModel(model)
    ? { reasoning: { effort: "low" as const }, max_output_tokens: 12000 }
    : { temperature: 0.4, max_output_tokens: 5000 };
}

export function readingGenerationTimeout(model: string) {
  return isReasoningReadingModel(model) ? 90_000 : 45_000;
}

export function readingReviewSettings(level: CefrLevel, model: string) {
  if (!isReasoningReadingModel(model)) return { temperature: 0, max_output_tokens: 4500 };
  if (level === "B2") return { reasoning: { effort: "low" as const }, max_output_tokens: 8000 };
  return { reasoning: { effort: "medium" as const }, max_output_tokens: level === "C1" || level === "C2" ? 12000 : 9000 };
}
