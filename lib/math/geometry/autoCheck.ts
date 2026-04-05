// lib/math/geometry/autoCheck.ts
import type { MathWorksheet, MathWorksheetTask } from "@/lib/math/geometry/types";
import type {
  GeometryAnswersByTaskId,
  GeometryAutoFieldResult,
  GeometryAutoResult,
  GeometryAutoTaskResult,
  GeometryTaskAnswer,
} from "@/lib/math/geometry/submissionTypes";
import {
  SHAPE_NAME_ALIASES,
  normalizeGeometryLanguage,
} from "@/lib/math/geometry/shapeAliases";

function normalizeText(value: string | undefined | null): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeShapeName(
  value: string | undefined | null,
  language: string | undefined | null
): string {
  const normalized = normalizeText(value);
  const lang = normalizeGeometryLanguage(language);
  const aliases = SHAPE_NAME_ALIASES[lang];

  return aliases[normalized] ?? normalized;
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const normalized = trimmed
      .replace(",", ".")
      .replace(/\s+/g, "")
      .replace(/cm²|cm2|cm/gi, "");

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function numbersClose(
  actual: unknown,
  expected: unknown,
  tolerance = 0.05
): boolean {
  const actualNumber = toNumberOrNull(actual);
  const expectedNumber = toNumberOrNull(expected);

  if (actualNumber == null || expectedNumber == null) return false;
  return Math.abs(actualNumber - expectedNumber) <= tolerance;
}

function formatCm(value: unknown): string | undefined {
  const numberValue = toNumberOrNull(value);
  if (numberValue == null) return undefined;
  return `${numberValue} cm`;
}

function formatCm2(value: unknown): string | undefined {
  const numberValue = toNumberOrNull(value);
  if (numberValue == null) return undefined;
  return `${numberValue} cm²`;
}

function stringifyExpected(task: MathWorksheetTask): string | undefined {
  if (task.type === "shape_name") {
    return task.expected?.shapeName ?? task.answer;
  }

  if (task.type === "perimeter") {
    if (task.expected?.perimeterValue == null) return task.answer;
    return formatCm(task.expected.perimeterValue) ?? task.answer;
  }

  if (task.type === "area") {
    if (task.expected?.areaValue == null) return task.answer;
    return formatCm2(task.expected.areaValue) ?? task.answer;
  }

  const parts: string[] = [];

  if (task.expected?.shapeName) {
    parts.push(`Navn: ${task.expected.shapeName}`);
  }
  if (task.expected?.perimeterValue != null) {
    parts.push(`Omkrets: ${formatCm(task.expected.perimeterValue)}`);
  }
  if (task.expected?.areaValue != null) {
    parts.push(`Areal: ${formatCm2(task.expected.areaValue)}`);
  }

  return parts.join(" | ") || task.answer;
}

function stringifyStudentAnswer(
  task: MathWorksheetTask,
  answer: GeometryTaskAnswer | undefined
): string | undefined {
  if (!answer) return undefined;

  if (task.type === "shape_name") {
    return answer.shapeName?.trim() || undefined;
  }

  if (task.type === "perimeter") {
    return formatCm(answer.perimeterValue);
  }

  if (task.type === "area") {
    return formatCm2(answer.areaValue);
  }

  const parts: string[] = [];

  if (!isBlank(answer.shapeName)) {
    parts.push(`Navn: ${String(answer.shapeName).trim()}`);
  }
  if (answer.perimeterValue != null) {
    parts.push(`Omkrets: ${formatCm(answer.perimeterValue)}`);
  }
  if (answer.areaValue != null) {
    parts.push(`Areal: ${formatCm2(answer.areaValue)}`);
  }

  return parts.join(" | ") || undefined;
}

function buildShapePart(
  worksheet: MathWorksheet,
  task: MathWorksheetTask,
  answer: GeometryTaskAnswer | undefined
): GeometryAutoFieldResult {
  const expectedRaw = task.expected?.shapeName ?? task.answer ?? "";
  const actualRaw = answer?.shapeName?.trim() ?? "";

  const expected = normalizeShapeName(expectedRaw, worksheet.language);
  const actual = normalizeShapeName(actualRaw, worksheet.language);

  const answered = !!actual;
  const isCorrect = answered ? actual === expected : null;

  return {
    key: "shapeName",
    label: "Figurnavn",
    isCorrect,
    expected: String(expectedRaw || "").trim() || undefined,
    actual: actualRaw || undefined,
  };
}

function buildPerimeterPart(
  task: MathWorksheetTask,
  answer: GeometryTaskAnswer | undefined
): GeometryAutoFieldResult {
  const expectedValue = task.expected?.perimeterValue ?? null;
  const actualValue = answer?.perimeterValue ?? null;

  const answered = toNumberOrNull(actualValue) != null;
  const isCorrect = answered ? numbersClose(actualValue, expectedValue) : null;

  return {
    key: "perimeter",
    label: "Omkrets",
    isCorrect,
    expected: formatCm(expectedValue),
    actual: formatCm(actualValue),
  };
}

function buildAreaPart(
  task: MathWorksheetTask,
  answer: GeometryTaskAnswer | undefined
): GeometryAutoFieldResult {
  const expectedValue = task.expected?.areaValue ?? null;
  const actualValue = answer?.areaValue ?? null;

  const answered = toNumberOrNull(actualValue) != null;
  const isCorrect = answered ? numbersClose(actualValue, expectedValue) : null;

  return {
    key: "area",
    label: "Areal",
    isCorrect,
    expected: formatCm2(expectedValue),
    actual: formatCm2(actualValue),
  };
}

function finalizeSinglePartResult(
  method: "exact" | "numeric_tolerance",
  expected: string | undefined,
  studentAnswer: string | undefined,
  part: GeometryAutoFieldResult
): GeometryAutoTaskResult {
  if (part.isCorrect === null) {
    return {
      isCorrect: null,
      status: "unanswered",
      score: 0,
      method,
      expected,
      studentAnswer,
      parts: {
        [part.key]: part,
      },
    };
  }

  if (part.isCorrect === true) {
    return {
      isCorrect: true,
      status: "correct",
      score: 1,
      method,
      expected,
      studentAnswer,
      parts: {
        [part.key]: part,
      },
    };
  }

  return {
    isCorrect: false,
    status: "wrong",
    score: 0,
    method,
    expected,
    studentAnswer,
    parts: {
      [part.key]: part,
    },
  };
}

function gradeShapeNameTask(
  worksheet: MathWorksheet,
  task: MathWorksheetTask,
  answer: GeometryTaskAnswer | undefined
): GeometryAutoTaskResult {
  const expected = stringifyExpected(task);
  const studentAnswer = stringifyStudentAnswer(task, answer);
  const shapePart = buildShapePart(worksheet, task, answer);

  return finalizeSinglePartResult("exact", expected, studentAnswer, shapePart);
}

function gradePerimeterTask(
  task: MathWorksheetTask,
  answer: GeometryTaskAnswer | undefined
): GeometryAutoTaskResult {
  const expected = stringifyExpected(task);
  const studentAnswer = stringifyStudentAnswer(task, answer);
  const perimeterPart = buildPerimeterPart(task, answer);

  return finalizeSinglePartResult(
    "numeric_tolerance",
    expected,
    studentAnswer,
    perimeterPart
  );
}

function gradeAreaTask(
  task: MathWorksheetTask,
  answer: GeometryTaskAnswer | undefined
): GeometryAutoTaskResult {
  const expected = stringifyExpected(task);
  const studentAnswer = stringifyStudentAnswer(task, answer);
  const areaPart = buildAreaPart(task, answer);

  return finalizeSinglePartResult(
    "numeric_tolerance",
    expected,
    studentAnswer,
    areaPart
  );
}

function gradeAllInOneTask(
  worksheet: MathWorksheet,
  task: MathWorksheetTask,
  answer: GeometryTaskAnswer | undefined
): GeometryAutoTaskResult {
  const expected = stringifyExpected(task);
  const studentAnswer = stringifyStudentAnswer(task, answer);

  const shapePart = buildShapePart(worksheet, task, answer);
  const perimeterPart = buildPerimeterPart(task, answer);
  const areaPart = buildAreaPart(task, answer);

  const parts = {
    shapeName: shapePart,
    perimeter: perimeterPart,
    area: areaPart,
  };

  const allParts = [shapePart, perimeterPart, areaPart];
  const answeredParts = allParts.filter((part) => part.isCorrect !== null);
  const correctParts = allParts.filter((part) => part.isCorrect === true);

  if (answeredParts.length === 0) {
    return {
      isCorrect: null,
      status: "unanswered",
      score: 0,
      method: "composite",
      expected,
      studentAnswer,
      parts,
    };
  }

  const score = correctParts.length / allParts.length;

  if (correctParts.length === allParts.length) {
    return {
      isCorrect: true,
      status: "correct",
      score,
      method: "composite",
      expected,
      studentAnswer,
      parts,
    };
  }

  if (correctParts.length > 0) {
    return {
      isCorrect: false,
      status: "partial",
      score,
      method: "composite",
      expected,
      studentAnswer,
      parts,
    };
  }

  return {
    isCorrect: false,
    status: "wrong",
    score: 0,
    method: "composite",
    expected,
    studentAnswer,
    parts,
  };
}

export function gradeGeometryTask(
  worksheet: MathWorksheet,
  task: MathWorksheetTask,
  answer: GeometryTaskAnswer | undefined
): GeometryAutoTaskResult {
  if (task.type === "shape_name") {
    return gradeShapeNameTask(worksheet, task, answer);
  }

  if (task.type === "perimeter") {
    return gradePerimeterTask(task, answer);
  }

  if (task.type === "area") {
    return gradeAreaTask(task, answer);
  }

  return gradeAllInOneTask(worksheet, task, answer);
}

export function gradeGeometryWorksheet(
  worksheet: MathWorksheet,
  answersByTaskId: GeometryAnswersByTaskId
): GeometryAutoResult {
  const byTaskId: Record<string, GeometryAutoTaskResult> = {};

  let correct = 0;
  let partial = 0;
  let wrong = 0;
  let unanswered = 0;
  let scoreSum = 0;

  for (const task of worksheet.tasks) {
    const result = gradeGeometryTask(worksheet, task, answersByTaskId[task.id]);
    byTaskId[task.id] = result;
    scoreSum += result.score;

    if (result.status === "correct") {
      correct += 1;
    } else if (result.status === "partial") {
      partial += 1;
    } else if (result.status === "wrong") {
      wrong += 1;
    } else {
      unanswered += 1;
    }
  }

  const total = worksheet.tasks.length;
  const percent = total > 0 ? Math.round((scoreSum / total) * 100) : 0;

  return {
    total,
    correct,
    partial,
    wrong,
    unanswered,
    percent,
    byTaskId,
  };
}