// lib/math/geometry/sanitize.ts

import type {
  Difficulty,
  FigureKind,
  FigureSpec,
  GeometryLevel,
  GeometryAnswerSpace,
  GeometryTopic,
  MathWorksheet,
  MathWorksheetTask,
  StoredWorksheetLanguage,
  WorksheetLanguage,
} from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function safeString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function isStoredWorksheetLanguage(value: unknown): value is StoredWorksheetLanguage {
  return value === "nb" || value === "no" || value === "en" || value === "pt";
}

export function normalizeWorksheetLanguage(value: unknown): WorksheetLanguage {
  if (value === "en" || value === "pt") return value;
  return "nb";
}

function isGeometryTopic(value: unknown): value is GeometryTopic {
  return value === "shapes" || value === "perimeter" || value === "area" || value === "all";
}

function isDifficulty(value: unknown): value is Difficulty {
  return value === "easy" || value === "medium" || value === "hard";
}

function isGeometryLevel(value: unknown): value is GeometryLevel {
  return value === "grade_3_4" || value === "grade_5_7" || value === "grade_8_10";
}

function isGeometryAnswerSpace(value: unknown): value is GeometryAnswerSpace {
  return value === "small" || value === "medium" || value === "large";
}

export function isFigureKind(value: unknown): value is FigureKind {
  return (
    value === "rectangle" ||
    value === "square" ||
    value === "parallelogram" ||
    value === "rhombus" ||
    value === "trapezoid" ||
    value === "triangle_right" ||
    value === "triangle_isosceles" ||
    value === "triangle_equilateral" ||
    value === "circle"
  );
}

export function sanitizeFigureSpec(value: unknown): FigureSpec | undefined {
  if (!isRecord(value)) return undefined;

  const toNumber = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;

  const widthCm = toNumber(value.widthCm);
  const heightCm = toNumber(value.heightCm);
  const sideCm = toNumber(value.sideCm);
  const baseCm = toNumber(value.baseCm);
  const topCm = toNumber(value.topCm);
  const sideLeftCm = toNumber(value.sideLeftCm);
  const sideRightCm = toNumber(value.sideRightCm);
  const sideAcm = toNumber(value.sideAcm);
  const sideBcm = toNumber(value.sideBcm);
  const sideCcm = toNumber(value.sideCcm);
  const radiusCm = toNumber(value.radiusCm);

  const rawKind = typeof value.kind === "string" ? value.kind : "";

  let normalizedKind: FigureKind | undefined;

  if (isFigureKind(rawKind)) {
    normalizedKind = rawKind;
  } else if (
    rawKind === "triangle" ||
    rawKind === "right_triangle" ||
    rawKind === "triangle-right" ||
    rawKind === "triangleRight" ||
    rawKind === "isosceles_triangle" ||
    rawKind === "triangle-isosceles" ||
    rawKind === "triangleIsosceles" ||
    rawKind === "equilateral_triangle" ||
    rawKind === "triangle-equilateral" ||
    rawKind === "triangleEquilateral"
  ) {
    if (
      rawKind === "right_triangle" ||
      rawKind === "triangle-right" ||
      rawKind === "triangleRight"
    ) {
      normalizedKind = "triangle_right";
    } else if (
      rawKind === "isosceles_triangle" ||
      rawKind === "triangle-isosceles" ||
      rawKind === "triangleIsosceles"
    ) {
      normalizedKind = "triangle_isosceles";
    } else if (
      rawKind === "equilateral_triangle" ||
      rawKind === "triangle-equilateral" ||
      rawKind === "triangleEquilateral"
    ) {
      normalizedKind = "triangle_equilateral";
    } else if (sideCm !== undefined || sideAcm !== undefined) {
      normalizedKind = "triangle_equilateral";
    } else if (
      sideBcm !== undefined &&
      sideCcm !== undefined &&
      sideBcm === sideCcm
    ) {
      normalizedKind = "triangle_isosceles";
    } else {
      normalizedKind = "triangle_right";
    }
  } else if (
    rawKind.includes("triangle") ||
    (sideAcm !== undefined || sideBcm !== undefined || sideCcm !== undefined) ||
    (
      baseCm !== undefined &&
      heightCm !== undefined &&
      widthCm === undefined &&
      topCm === undefined &&
      radiusCm === undefined &&
      sideLeftCm === undefined &&
      sideRightCm === undefined
    )
  ) {
    if (sideCm !== undefined || sideAcm !== undefined) {
      normalizedKind = "triangle_equilateral";
    } else if (
      sideBcm !== undefined &&
      sideCcm !== undefined &&
      sideBcm === sideCcm
    ) {
      normalizedKind = "triangle_isosceles";
    } else {
      normalizedKind = "triangle_right";
    }
  } else if (radiusCm !== undefined) {
    normalizedKind = "circle";
  } else if (
    topCm !== undefined &&
    baseCm !== undefined &&
    heightCm !== undefined
  ) {
    normalizedKind = "trapezoid";
  } else if (
    baseCm !== undefined &&
    sideCm !== undefined &&
    heightCm !== undefined
  ) {
    normalizedKind = "parallelogram";
  } else if (widthCm !== undefined && heightCm !== undefined) {
    normalizedKind = "rectangle";
  } else if (sideCm !== undefined) {
    normalizedKind = "square";
  }

  if (!normalizedKind) return undefined;

  return {
    kind: normalizedKind,
    widthCm,
    heightCm,
    sideCm,
    baseCm,
    topCm,
    sideLeftCm,
    sideRightCm,
    sideAcm,
    sideBcm,
    sideCcm,
    radiusCm,
  };
}

export function sanitizeTask(value: unknown, index: number): MathWorksheetTask | null {
  if (!isRecord(value)) return null;

  const type = value.type;
  if (
    type !== "shape_name" &&
    type !== "perimeter" &&
    type !== "area" &&
    type !== "all_in_one"
  ) {
    return null;
  }

  const prompt = safeString(value.prompt).trim();
  if (!prompt) return null;

  return {
    id: safeString(value.id, String(index + 1)),
    type,
    prompt,
    figure: sanitizeFigureSpec(value.figure),
    answer: safeString(value.answer).trim(),
    explanation: safeString(value.explanation).trim() || undefined,
    hint: safeString(value.hint).trim() || undefined,
    formula: safeString(value.formula).trim() || undefined,
  };
}

export function sanitizeWorksheet(value: unknown): MathWorksheet | null {
  if (!isRecord(value)) return null;

  const title = safeString(value.title).trim();
  const instructions = safeString(value.instructions).trim();

  if (!title || !instructions) return null;
  if (!isStoredWorksheetLanguage(value.language)) return null;
  if (!isGeometryLevel(value.level)) return null;
  if (!isGeometryTopic(value.topic)) return null;
  if (!isDifficulty(value.difficulty)) return null;
  if (!Array.isArray(value.tasks)) return null;

  const tasks = value.tasks
    .map((task, index) => sanitizeTask(task, index))
    .filter((task): task is MathWorksheetTask => task !== null);

  if (tasks.length === 0) return null;

  return {
    version: typeof value.version === "number" ? value.version : 1,
    title,
    language: normalizeWorksheetLanguage(value.language),
    level: value.level,
    topic: value.topic,
    difficulty: value.difficulty,
    instructions,
    showAnswerKey: value.showAnswerKey === true,
    showFormulas: value.showFormulas === true,
    answerSpace: isGeometryAnswerSpace(value.answerSpace)
      ? value.answerSpace
      : undefined,
    selectedShapes: Array.isArray(value.selectedShapes)
      ? value.selectedShapes.filter(isFigureKind)
      : [],
    tasks,
  };
}
