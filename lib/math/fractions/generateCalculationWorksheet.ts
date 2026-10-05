import Fraction from "fraction.js";
import { normalizeMathWorksheetLanguage } from "@/lib/math/taxonomy";
import { getCalculationCopy } from "./calculationCopy";
import { FRACTION_CALCULATION_OPERATIONS, FRACTION_CALCULATION_SYMBOLS, type FractionCalculationOperation } from "./calculationOperations";
import type { FractionCalculationSettings, FractionSpec, FractionTask, FractionWorksheet } from "./types";

export type CalculationRequest = Partial<FractionCalculationSettings> & {
  language?: string;
  taskCount?: number;
  showAnswerKey?: boolean;
};

export function normalizeCalculationRequest(body: CalculationRequest) {
  const operation = body.operation ?? "addition";
  const denominatorMode = body.denominatorMode ?? "varied";
  const denominatorRelation = body.denominatorRelation ?? "same";
  const denominatorMin = body.denominatorMin ?? 2;
  const denominatorMax = denominatorMode === "fixed" ? denominatorMin : body.denominatorMax ?? 12;
  const taskCount = body.taskCount ?? 36;
  if (![...FRACTION_CALCULATION_OPERATIONS, "mixed"].includes(operation) || !["fixed", "varied"].includes(denominatorMode) || !["same", "different"].includes(denominatorRelation)) {
    throw new Error("INVALID_CALCULATION_SETTINGS");
  }
  if (!Number.isInteger(denominatorMin) || !Number.isInteger(denominatorMax) || denominatorMin < 2 || denominatorMax > 100 || denominatorMin > denominatorMax) {
    throw new Error("INVALID_DENOMINATOR_RANGE");
  }
  if (denominatorRelation === "different" && denominatorMin === denominatorMax) throw new Error("INVALID_DIFFERENT_DENOMINATORS");
  if (!Number.isInteger(taskCount) || taskCount < 6 || taskCount > 100) throw new Error("INVALID_TASK_COUNT");
  return {
    language: normalizeMathWorksheetLanguage(body.language), taskCount, showAnswerKey: body.showAnswerKey === true,
    settings: { operation, denominatorMode, denominatorRelation, denominatorMin, denominatorMax, requireReduced: body.requireReduced === true } satisfies FractionCalculationSettings,
  };
}

function shuffled<T>(values: T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function calculateResult(left: FractionSpec, right: FractionSpec, operation: FractionCalculationOperation) {
  const a = new Fraction(left.numerator, left.denominator), b = new Fraction(right.numerator, right.denominator);
  switch (operation) {
    case "addition": return a.add(b);
    case "subtraction": return a.sub(b);
    case "multiplication": return a.mul(b);
    case "division": return a.div(b);
  }
}

export function generateCalculationWorksheet(params: ReturnType<typeof normalizeCalculationRequest>): FractionWorksheet {
  const { settings, taskCount, language } = params;
  const copy = getCalculationCopy(language);
  const pool = shuffled(Array.from({ length: settings.denominatorMax - settings.denominatorMin + 1 }, (_, i) => settings.denominatorMin + i));
  const denominators = shuffled(Array.from({ length: taskCount }, (_, i) => pool[i % pool.length]));
  const operations = shuffled(Array.from({ length: taskCount }, (_, i) => settings.operation === "mixed" ? FRACTION_CALCULATION_OPERATIONS[i % FRACTION_CALCULATION_OPERATIONS.length] : settings.operation));
  const seen = new Set<string>();
  const tasks: FractionTask[] = denominators.map((denominator, i) => {
    const operation = operations[i];
    const secondDenominator = settings.denominatorRelation === "different"
      ? pool[(pool.indexOf(denominator) + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length]
      : denominator;
    let left: FractionSpec = { numerator: 1, denominator }, right: FractionSpec = { numerator: 1, denominator: secondDenominator };
    // Retry duplicates when the configured pool permits variety; tiny pools remain usable.
    for (let attempt = 0; attempt < 40; attempt++) {
      left = { numerator: 1 + Math.floor(Math.random() * (denominator - 1)), denominator };
      right = { numerator: 1 + Math.floor(Math.random() * (secondDenominator - 1)), denominator: secondDenominator };
      if (operation === "subtraction" && new Fraction(left.numerator, left.denominator).compare(new Fraction(right.numerator, right.denominator)) < 0) [left, right] = [right, left];
      if (!seen.has(`${operation}:${left.numerator}/${left.denominator}:${right.numerator}/${right.denominator}`)) break;
    }
    seen.add(`${operation}:${left.numerator}/${left.denominator}:${right.numerator}/${right.denominator}`);
    const value = calculateResult(left, right, operation);
    const answer = `${value.s * value.n}/${value.d}`;
    return {
      id: String(i + 1), type: "calculate_fraction", visual: "bar", calculation: { left, right, operation },
      fraction: { numerator: Number(value.s * value.n), denominator: Number(value.d) },
      prompt: `${left.numerator}/${left.denominator} ${FRACTION_CALCULATION_SYMBOLS[operation]} ${right.numerator}/${right.denominator} =`,
      answer, expected: { answerText: answer },
    };
  });
  return {
    version: 2, topic: "calculation", calculation: settings, language, level: "grade_5_7", difficulty: "medium",
    title: `${copy.title} – ${copy[settings.operation].toLowerCase()}`,
    instructions: settings.requireReduced ? copy.reducedInstructions : copy.instructions,
    showHints: false, showAnswerKey: params.showAnswerKey, tasks,
  };
}
