import type { LessonTaskCounts } from "../lessons/tasks";

export const READING_PRACTICE_MODE = "reading_practice";

export const READING_PRACTICE_TEXT_TYPES = {
  one_syllable: "reading_practice_one_syllable",
  one_and_two_syllables: "reading_practice_one_and_two_syllables",
  one_to_three_syllables: "reading_practice_one_to_three_syllables",
} as const;

export type ReadingPracticeStage = keyof typeof READING_PRACTICE_TEXT_TYPES;
export const READING_PRACTICE_STAGES = Object.keys(READING_PRACTICE_TEXT_TYPES) as ReadingPracticeStage[];

export const READING_PRACTICE_TASK_DEFAULTS = { mcq: 2, trueFalse: 2, facts: 0, reflection: 1 } satisfies LessonTaskCounts;
export const READING_PRACTICE_OPEN_QUESTION = "Hva ser du?";

export function isReadingPracticeStage(value: unknown): value is ReadingPracticeStage {
  return typeof value === "string" && Object.hasOwn(READING_PRACTICE_TEXT_TYPES, value);
}

export function showsReadingPracticeWordDivisions(stage: ReadingPracticeStage | null): boolean {
  return stage !== null && stage !== "one_syllable";
}

export function supportsReadingPractice(language: string): boolean {
  return ["nb", "no"].includes(language.trim().toLowerCase());
}
