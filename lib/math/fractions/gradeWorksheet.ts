import Fraction from "fraction.js";
import type { FractionTask, FractionWorksheet } from "./types";

export type FractionGradeEntry = {
  type: "fraction";
  hasAnswer: boolean;
  isCorrect: boolean;
  isPartial: boolean;
  points: 0 | 0.5 | 1;
  studentAnswer: unknown;
  correctAnswer: string;
};
export type FractionAutoGrade = {
  totalAuto: number;
  correctAuto: number;
  partialAuto: number;
  wrongAuto: number;
  unansweredAuto: number;
  percentAuto: number | null;
  byTask: Record<string, FractionGradeEntry>;
};

export function normalizeFractionText(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim().toLowerCase().replace(/\s+/g, "").replace(",", ".").replace(/[:÷]/g, "/")
    : "";
}

export function parseFractionNumber(value: unknown): number | null {
  const text = normalizeFractionText(value);
  if (!/^-?\d+(?:\.\d+|\/-?\d+)?$/.test(text) || text.length > 60) return null;
  try { return new Fraction(text).valueOf(); } catch { return null; }
}

export function isCorrectFraction(studentAnswer: unknown, correctAnswer: unknown): boolean {
  const text = normalizeFractionText(studentAnswer), expected = normalizeFractionText(correctAnswer);
  if (parseFractionNumber(text) === null || parseFractionNumber(expected) === null) return false;
  return new Fraction(text).equals(new Fraction(expected));
}

export function gradeFractionTask(task: FractionTask, value: unknown, requireReduced = false): FractionGradeEntry {
  const expectedAnswer = task.answer || task.expected?.answerText || `${task.fraction.numerator}/${task.fraction.denominator}`;
  const correctAnswer = task.type === "calculate_fraction" && /^-?\d+$/.test(expectedAnswer.trim()) ? `${expectedAnswer.trim()}/1` : expectedAnswer;
  const text = normalizeFractionText(value);
  let hasAnswer = text.length > 0, equivalent = false, reduced = true;
  if (task.type === "shade_fraction") {
    const parts = value && typeof value === "object" && !Array.isArray(value) ? (value as { selectedParts?: unknown }).selectedParts : null;
    const selected = Array.isArray(parts) ? [...new Set(parts.map(Number).filter(part => Number.isInteger(part) && part >= 0 && part < task.fraction.denominator))] : [];
    hasAnswer = selected.length > 0;
    equivalent = hasAnswer && selected.length === task.fraction.numerator;
  } else if (task.type === "calculate_fraction") {
    const rawText = String(value ?? "").trim();
    const match = /\d\s+\d/.test(rawText) ? null : text.match(/^(-?\d+)\/(\d+)$/);
    if (match && text.length <= 60) {
      try {
        const rawNumerator = BigInt(match[1]), rawDenominator = BigInt(match[2]);
        const fraction = new Fraction(text);
        equivalent = fraction.equals(new Fraction(correctAnswer));
        reduced = fraction.n === (rawNumerator < 0 ? -rawNumerator : rawNumerator) && fraction.d === rawDenominator;
      } catch { /* Zero denominators and invalid fractions are incorrect answers. */ }
    }
  } else {
    equivalent = isCorrectFraction(text, correctAnswer);
  }
  const points = !hasAnswer || !equivalent ? 0 : task.type === "calculate_fraction" && requireReduced && !reduced ? 0.5 : 1;
  return { type: "fraction", hasAnswer, isCorrect: points === 1, isPartial: points === 0.5, points, studentAnswer: hasAnswer ? value : null, correctAnswer };
}

export function gradeFractionWorksheet(worksheet: FractionWorksheet, answers: Record<string, unknown>): FractionAutoGrade {
  const byTask = Object.fromEntries(worksheet.tasks.map((task, index) => {
    const id = String(task.id || `task-${index}`);
    return [id, gradeFractionTask(task, answers[id], worksheet.calculation?.requireReduced)];
  }));
  const results = Object.values(byTask);
  return {
    totalAuto: worksheet.tasks.length,
    correctAuto: results.filter(result => result.isCorrect).length,
    partialAuto: results.filter(result => result.isPartial).length,
    wrongAuto: results.filter(result => result.hasAnswer && result.points === 0).length,
    unansweredAuto: results.filter(result => !result.hasAnswer).length,
    percentAuto: results.length ? Math.round(results.reduce((sum, result) => sum + result.points, 0) / results.length * 100) : null,
    byTask,
  };
}
