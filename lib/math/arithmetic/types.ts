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

export const ARITHMETIC_TASK_TYPES = [
  "standard",
  "no_transition",
  "with_transition",
  "times_table",
  "two_digit_by_one_digit",
  "whole_division",
  "missing_number",
] as const;

export const ARITHMETIC_WORKSHEET_LANGUAGES = MATH_WORKSHEET_LANGUAGES;
export const STORED_ARITHMETIC_WORKSHEET_LANGUAGES =
  STORED_MATH_WORKSHEET_LANGUAGES;
export const ARITHMETIC_DIFFICULTIES = MATH_DIFFICULTIES;

export type ArithmeticLanguage = MathWorksheetLanguage;
export type StoredArithmeticLanguage = StoredMathWorksheetLanguage;
export type ArithmeticDifficulty = MathDifficulty;
export type ArithmeticOperation = (typeof ARITHMETIC_OPERATIONS)[number];
export type ArithmeticConcreteOperation = Exclude<ArithmeticOperation, "mixed">;
export type ArithmeticLevel = (typeof ARITHMETIC_LEVELS)[number];
export type ArithmeticLayout = (typeof ARITHMETIC_LAYOUTS)[number];
export type ArithmeticTaskType = (typeof ARITHMETIC_TASK_TYPES)[number];

export type ArithmeticNumberRange = {
  min: number;
  max: number;
};

export type ArithmeticGeneratorRules = {
  allowCarry?: boolean;
  allowBorrow?: boolean;
  allowNegative?: boolean;
  wholeNumberDivision?: boolean;
};

export type ArithmeticGeneratorConfig = {
  taskType: ArithmeticTaskType;
  operandA: ArithmeticNumberRange;
  operandB: ArithmeticNumberRange;
  rules?: ArithmeticGeneratorRules;
  mixedOperations?: ArithmeticConcreteOperation[];
  presetId?: string;
};

export type ArithmeticTask = {
  id: string;
  operation: ArithmeticConcreteOperation;
  left: number;
  right: number;
  answer: number;
  expression: string;
  prompt: string;
  unknownPosition?: "left" | "right";
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
  generatorConfig?: ArithmeticGeneratorConfig;
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

export function isArithmeticTaskType(value: unknown): value is ArithmeticTaskType {
  return ARITHMETIC_TASK_TYPES.includes(value as ArithmeticTaskType);
}
