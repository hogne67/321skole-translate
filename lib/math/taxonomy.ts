export const MATH_WORKSHEET_LANGUAGES = ["nb", "en", "pt"] as const;
export const STORED_MATH_WORKSHEET_LANGUAGES = ["nb", "no", "en", "pt"] as const;
export const MATH_DIFFICULTIES = ["easy", "medium", "hard"] as const;

export type MathWorksheetLanguage = (typeof MATH_WORKSHEET_LANGUAGES)[number];
export type StoredMathWorksheetLanguage =
  (typeof STORED_MATH_WORKSHEET_LANGUAGES)[number];
export type MathDifficulty = (typeof MATH_DIFFICULTIES)[number];

export function isMathWorksheetLanguage(
  value: unknown
): value is MathWorksheetLanguage {
  return MATH_WORKSHEET_LANGUAGES.includes(value as MathWorksheetLanguage);
}

export function isStoredMathWorksheetLanguage(
  value: unknown
): value is StoredMathWorksheetLanguage {
  return STORED_MATH_WORKSHEET_LANGUAGES.includes(
    value as StoredMathWorksheetLanguage
  );
}

export function normalizeMathWorksheetLanguage(
  value: unknown
): MathWorksheetLanguage {
  if (value === "no") return "nb";
  return isMathWorksheetLanguage(value) ? value : "nb";
}

export function isMathDifficulty(value: unknown): value is MathDifficulty {
  return MATH_DIFFICULTIES.includes(value as MathDifficulty);
}
