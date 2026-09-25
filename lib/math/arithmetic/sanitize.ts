import {
  isArithmeticDifficulty,
  isArithmeticLayout,
  isArithmeticLevel,
  isArithmeticOperation,
  isStoredArithmeticLanguage,
  normalizeArithmeticLanguage,
  type ArithmeticTask,
  type ArithmeticWorksheet,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

  return task;
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

  return {
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
}
