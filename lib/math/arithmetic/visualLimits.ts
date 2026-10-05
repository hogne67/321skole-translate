import type {
  ArithmeticConcreteOperation,
  ArithmeticGeneratorConfig,
  ArithmeticNumberRange,
  ArithmeticOperation,
} from "./types";
import { wholeDivisionChoices } from "./division";

export const VISUAL_DOT_LIMIT = 40;
export const VISUAL_GROUP_LIMIT = 12;

export function visualOperandLimits(
  operation: ArithmeticOperation,
  mixedOperations: ArithmeticConcreteOperation[] = [
    "addition", "subtraction", "multiplication", "division",
  ]
) {
  const operations = operation === "mixed" ? mixedOperations : [operation];
  const max = operations.includes("multiplication")
    ? VISUAL_GROUP_LIMIT
    : VISUAL_DOT_LIMIT;
  return {
    operandA: { min: 0, max },
    operandB: { min: operations.includes("division") ? 1 : 0, max },
  };
}

export function clampVisualRange(
  range: ArithmeticNumberRange,
  limits: ArithmeticNumberRange
): ArithmeticNumberRange {
  const clamp = (value: number) =>
    Math.max(limits.min, Math.min(limits.max, Math.round(value)));
  const min = clamp(range.min);
  const max = clamp(range.max);
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

export function constrainVisualConfig(
  operation: ArithmeticOperation,
  config: ArithmeticGeneratorConfig
): ArithmeticGeneratorConfig {
  const limits = visualOperandLimits(operation, config.mixedOperations);
  return {
    ...config,
    taskType: operation === "division"
      ? "whole_division"
      : config.taskType === "missing_number" || config.taskType === "two_digit_by_one_digit"
        ? "standard"
        : config.taskType,
    operandA: clampVisualRange(config.operandA, limits.operandA),
    operandB: clampVisualRange(config.operandB, limits.operandB),
    rules: { ...config.rules, allowNegative: false, wholeNumberDivision: true },
  };
}

export function visualDivisionPairs(config: ArithmeticGeneratorConfig) {
  const pairs: { left: number; right: number }[] = [];
  const choices = wholeDivisionChoices(config.operandA, config.operandB, {
    allowZero: true,
    maxQuotient: VISUAL_GROUP_LIMIT,
  });
  for (const { divisor, minQuotient, maxQuotient } of choices) {
    for (let quotient = minQuotient; quotient <= maxQuotient; quotient += 1) {
      pairs.push({ left: divisor * quotient, right: divisor });
    }
  }
  return pairs;
}
