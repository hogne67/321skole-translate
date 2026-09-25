import {
  MATH_DIFFICULTIES,
  MATH_WORKSHEET_LANGUAGES,
  STORED_MATH_WORKSHEET_LANGUAGES,
  isMathDifficulty,
  isMathWorksheetLanguage,
  isStoredMathWorksheetLanguage,
  normalizeMathWorksheetLanguage,
  type MathDifficulty,
  type MathWorksheetLanguage,
  type StoredMathWorksheetLanguage,
} from "@/lib/math/taxonomy";

export const ARITHMETIC_OPERATIONS = [
  "addition",
  "subtraction",
  "multiplication",
  "division",
  "mixed",
] as const;

export const ARITHMETIC_LEVELS = [
  "grade_1_2",
  "grade_3_4",
  "grade_5_7",
  "grade_8_10",
] as const;

export const ARITHMETIC_LAYOUTS = ["grid", "vertical", "visual"] as const;

export const ARITHMETIC_WORKSHEET_LANGUAGES = MATH_WORKSHEET_LANGUAGES;
export const STORED_ARITHMETIC_WORKSHEET_LANGUAGES =
  STORED_MATH_WORKSHEET_LANGUAGES;
export const ARITHMETIC_DIFFICULTIES = MATH_DIFFICULTIES;

export type ArithmeticLanguage = MathWorksheetLanguage;
export type StoredArithmeticLanguage = StoredMathWorksheetLanguage;
export type ArithmeticDifficulty = MathDifficulty;
export type ArithmeticOperation = (typeof ARITHMETIC_OPERATIONS)[number];
export type ArithmeticLevel = (typeof ARITHMETIC_LEVELS)[number];
export type ArithmeticLayout = (typeof ARITHMETIC_LAYOUTS)[number];

export type ArithmeticTask = {
  id: string;
  operation: Exclude<ArithmeticOperation, "mixed">;
  left: number;
  right: number;
  answer: number;
  expression: string;
  prompt: string;
  visualCount?: number;
};

export type ArithmeticWorksheet = {
  version?: number;
  title: string;
  language: ArithmeticLanguage;
  level: ArithmeticLevel;
  operation: ArithmeticOperation;
  difficulty: ArithmeticDifficulty;
  layout: ArithmeticLayout;
  instructions: string;
  showAnswerKey: boolean;
  taskCount: number;
  numberRange: {
    min: number;
    max: number;
  };
  tasks: ArithmeticTask[];
};

export function isArithmeticLanguage(value: unknown): value is ArithmeticLanguage {
  return isMathWorksheetLanguage(value);
}

export function isStoredArithmeticLanguage(
  value: unknown
): value is StoredArithmeticLanguage {
  return isStoredMathWorksheetLanguage(value);
}

export function normalizeArithmeticLanguage(value: unknown): ArithmeticLanguage {
  return normalizeMathWorksheetLanguage(value);
}

export function isArithmeticDifficulty(
  value: unknown
): value is ArithmeticDifficulty {
  return isMathDifficulty(value);
}

export function isArithmeticOperation(
  value: unknown
): value is ArithmeticOperation {
  return ARITHMETIC_OPERATIONS.includes(value as ArithmeticOperation);
}

export function isArithmeticLevel(value: unknown): value is ArithmeticLevel {
  return ARITHMETIC_LEVELS.includes(value as ArithmeticLevel);
}

export function isArithmeticLayout(value: unknown): value is ArithmeticLayout {
  return ARITHMETIC_LAYOUTS.includes(value as ArithmeticLayout);
}
