// lib/math/geometry/types.ts

export type WorksheetLanguage = "nb" | "en" | "pt";
export type StoredWorksheetLanguage = "nb" | "no" | "en" | "pt";

export type GeometryTopic = "shapes" | "perimeter" | "area" | "all";
export type Difficulty = "easy" | "medium" | "hard";
export type GeometryLevel = "grade_3_4" | "grade_5_7" | "grade_8_10";

export type FigureKind =
  | "rectangle"
  | "square"
  | "parallelogram"
  | "rhombus"
  | "trapezoid"
  | "triangle_right"
  | "triangle_isosceles"
  | "triangle_equilateral"
  | "circle";

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

export type MathWorksheetTask = {
  id: string;
  type: "shape_name" | "perimeter" | "area" | "all_in_one";
  prompt: string;
  figure?: FigureSpec;
  answer: string;
  explanation?: string;
  hint?: string;
  formula?: string;
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