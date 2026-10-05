import {
  isArithmeticDifficulty,
  isArithmeticLayout,
  isArithmeticLevel,
  isArithmeticOperation,
  isArithmeticTaskType,
  isStoredArithmeticLanguage,
  normalizeArithmeticLanguage,
  type ArithmeticConcreteOperation,
  type ArithmeticGeneratorConfig,
  type ArithmeticNumberRange,
  type ArithmeticTask,
  type ArithmeticWorksheet,
} from "./types";
import { normalizeArithmeticTask } from "./normalizeTask";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeRange(value: unknown, fallback: ArithmeticNumberRange): ArithmeticNumberRange {
  if (!isRecord(value)) return fallback;

  const min = safeNumber(value.min) ?? fallback.min;
  const max = safeNumber(value.max) ?? fallback.max;

  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
  };
}

function sanitizeMixedOperations(value: unknown): ArithmeticConcreteOperation[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const operations = value.filter(
    (operation): operation is ArithmeticConcreteOperation =>
      operation === "addition" ||
      operation === "subtraction" ||
      operation === "multiplication" ||
      operation === "division"
  );

  return operations.length > 0 ? Array.from(new Set(operations)) : undefined;
}

function sanitizeGeneratorConfig(value: unknown): ArithmeticGeneratorConfig | undefined {
  if (!isRecord(value)) return undefined;

  const taskType = isArithmeticTaskType(value.taskType) ? value.taskType : "standard";
  const rules = isRecord(value.rules) ? value.rules : {};
  const presetId = safeString(value.presetId);

  const config: ArithmeticGeneratorConfig = {
    taskType,
    operandA: sanitizeRange(value.operandA, { min: 0, max: 50 }),
    operandB: sanitizeRange(value.operandB, { min: 0, max: 50 }),
    rules: {
      allowCarry: rules.allowCarry === true,
      allowBorrow: rules.allowBorrow === true,
      allowNegative: rules.allowNegative === true,
      wholeNumberDivision: rules.wholeNumberDivision !== false,
    },
  };

  if (presetId) {
    config.presetId = presetId;
  }

  const mixedOperations = sanitizeMixedOperations(value.mixedOperations);
  if (mixedOperations) {
    config.mixedOperations = mixedOperations;
  }

  return config;
}

function sanitizeTask(value: unknown, index: number): ArithmeticTask | null {
  if (!isRecord(value)) return null;

  const operation = value.operation;
  if (
    operation !== "addition" &&
    operation !== "subtraction" &&
    operation !== "multiplication" &&
    operation !== "division"
  ) {
    return null;
  }

  const left = safeNumber(value.left);
  const right = safeNumber(value.right);
  const answer = safeNumber(value.answer);
  const expression = safeString(value.expression);
  const prompt = safeString(value.prompt);

  if (left === null || right === null || answer === null || !expression || !prompt) {
    return null;
  }

  const visualCount = safeNumber(value.visualCount);
  const unknownPosition =
    value.unknownPosition === "left" || value.unknownPosition === "right"
      ? value.unknownPosition
      : null;
  const task: ArithmeticTask = {
    id: safeString(value.id, String(index + 1)),
    operation,
    left,
    right,
    answer,
    expression,
    prompt,
  };

  if (visualCount !== null) {
    task.visualCount = visualCount;
  }

  if (unknownPosition) {
    task.unknownPosition = unknownPosition;
  }

  return normalizeArithmeticTask(task);
}

export function sanitizeArithmeticWorksheet(
  value: unknown
): ArithmeticWorksheet | null {
  if (!isRecord(value)) return null;

  const title = safeString(value.title);
  const instructions = safeString(value.instructions);

  if (!title || !instructions) return null;
  if (!isStoredArithmeticLanguage(value.language)) return null;
  if (!isArithmeticLevel(value.level)) return null;
  if (!isArithmeticOperation(value.operation)) return null;
  if (!isArithmeticDifficulty(value.difficulty)) return null;
  if (!isArithmeticLayout(value.layout)) return null;
  if (!Array.isArray(value.tasks)) return null;

  const tasks = value.tasks
    .map((task, index) => sanitizeTask(task, index))
    .filter((task): task is ArithmeticTask => task !== null);

  if (tasks.length === 0) return null;

  const range = isRecord(value.numberRange) ? value.numberRange : {};
  const min = safeNumber(range.min) ?? 0;
  const max = safeNumber(range.max) ?? 20;

  const worksheet: ArithmeticWorksheet = {
    version: typeof value.version === "number" ? value.version : 1,
    title,
    language: normalizeArithmeticLanguage(value.language),
    level: value.level,
    operation: value.operation,
    difficulty: value.difficulty,
    layout: value.layout,
    instructions,
    showAnswerKey: value.showAnswerKey === true,
    taskCount: tasks.length,
    numberRange: {
      min,
      max: Math.max(min, max),
    },
    tasks,
  };

  const generatorConfig = sanitizeGeneratorConfig(value.generatorConfig);
  if (generatorConfig) {
    worksheet.generatorConfig = generatorConfig;
  }

  return worksheet;
}
