// lib/math/geometry/types.ts
import {
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

export const WORKSHEET_LANGUAGES = MATH_WORKSHEET_LANGUAGES;
export const STORED_WORKSHEET_LANGUAGES = STORED_MATH_WORKSHEET_LANGUAGES;
export const GEOMETRY_TOPICS = ["shapes", "perimeter", "area", "all"] as const;
export const GEOMETRY_LEVELS = ["grade_3_4", "grade_5_7", "grade_8_10"] as const;
export const GEOMETRY_ANSWER_SPACES = ["small", "medium", "large"] as const;
export const GEOMETRY_FIGURES = [
  "square",
  "rectangle",
  "parallelogram",
  "rhombus",
  "trapezoid",
  "triangle_right",
  "triangle_isosceles",
  "triangle_equilateral",
  "circle",
] as const;

export type WorksheetLanguage = MathWorksheetLanguage;
export type StoredWorksheetLanguage = StoredMathWorksheetLanguage;

export type GeometryTopic = (typeof GEOMETRY_TOPICS)[number];
export type Difficulty = MathDifficulty;
export type GeometryLevel = (typeof GEOMETRY_LEVELS)[number];
export type GeometryAnswerSpace = (typeof GEOMETRY_ANSWER_SPACES)[number];

export type FigureKind = (typeof GEOMETRY_FIGURES)[number];

export function isWorksheetLanguage(value: unknown): value is WorksheetLanguage {
  return isMathWorksheetLanguage(value);
}

export function isStoredWorksheetLanguage(value: unknown): value is StoredWorksheetLanguage {
  return isStoredMathWorksheetLanguage(value);
}

export function normalizeWorksheetLanguage(value: unknown): WorksheetLanguage {
  return normalizeMathWorksheetLanguage(value);
}

export function isGeometryLevel(value: unknown): value is GeometryLevel {
  return GEOMETRY_LEVELS.includes(value as GeometryLevel);
}

export function isGeometryTopic(value: unknown): value is GeometryTopic {
  return GEOMETRY_TOPICS.includes(value as GeometryTopic);
}

export function isDifficulty(value: unknown): value is Difficulty {
  return isMathDifficulty(value);
}

export function isGeometryAnswerSpace(value: unknown): value is GeometryAnswerSpace {
  return GEOMETRY_ANSWER_SPACES.includes(value as GeometryAnswerSpace);
}

export function isFigureKind(value: unknown): value is FigureKind {
  return GEOMETRY_FIGURES.includes(value as FigureKind);
}

export type FigureSpec = {
  kind: FigureKind;
  widthCm?: number;
  heightCm?: number;
  sideCm?: number;
  baseCm?: number;
  topCm?: number;
  sideLeftCm?: number;
  sideRightCm?: number;
  sideAcm?: number;
  sideBcm?: number;
  sideCcm?: number;
  radiusCm?: number;
};

export type GeometryTaskInputMode =
  | "shape_name"
  | "number_with_unit"
  | "split_name_perimeter_area";

export type MathWorksheetTask = {
  id: string;
  type: "shape_name" | "perimeter" | "area" | "all_in_one";
  prompt: string;
  figure?: FigureSpec;
  answer: string;
  explanation?: string;
  hint?: string;
  formula?: string;

  // Valgfrie felt for digital løsning senere.
  // De påvirker ikke dagens print-visning.
  inputMode?: GeometryTaskInputMode;
  expected?: {
    shapeName?: string;
    perimeterValue?: number | null;
    areaValue?: number | null;
    perimeterUnit?: "cm" | null;
    areaUnit?: "cm2" | null;
  };
};

export type MathWorksheet = {
  version?: number;
  title: string;
  language: WorksheetLanguage;
  level: GeometryLevel;
  topic: GeometryTopic;
  difficulty: Difficulty;
  instructions: string;
  showAnswerKey: boolean;
  showFormulas: boolean;
  answerSpace?: GeometryAnswerSpace;
  selectedShapes: FigureKind[];
  tasks: MathWorksheetTask[];
};

export type LessonDocWithMathWorksheet = {
  ownerId?: string;
  title?: string;
  level?: string;
  producerName?: string;
  mathWorksheet?: unknown;
};
