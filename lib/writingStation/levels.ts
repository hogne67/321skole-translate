import type { WritingLevel } from "./types";

export const WRITING_AI_MIN_WORDS_BY_LEVEL: Record<WritingLevel, number> = {
  A1: 5,
  A2: 10,
  B1: 25,
  B2: 40,
  C1: 60,
  C2: 60,
};

export function normalizeWritingLevel(level: unknown): WritingLevel | null {
  const value = String(level ?? "").trim().toUpperCase();
  if (value === "A1") return "A1";
  if (value === "A2") return "A2";
  if (value === "B1") return "B1";
  if (value === "B2") return "B2";
  if (value === "C1") return "C1";
  if (value === "C2") return "C2";
  return null;
}

export function getWritingAiMinWords(level: unknown): number {
  const normalized = normalizeWritingLevel(level);
  if (!normalized) return WRITING_AI_MIN_WORDS_BY_LEVEL.A2;
  return WRITING_AI_MIN_WORDS_BY_LEVEL[normalized];
}

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function meetsWritingAiMinWords(text: string, level: unknown): boolean {
  return countWords(text) >= getWritingAiMinWords(level);
}
