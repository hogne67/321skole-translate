import { LessonError, onlyKeys, record, requiredString, stringField } from "./validation";

export type LessonTaskType = "truefalse" | "mcq" | "open";
export type LessonTask = {
  id: string;
  order?: number;
  type: LessonTaskType;
  prompt: string;
  options?: string[];
  correctAnswer?: string;
  answerSpace?: "short" | "medium" | "long";
};

/** Canonical persisted format, shared by the editor and the server boundary. */
export function normalizeLessonTasks(input: unknown): LessonTask[] {
  if (!Array.isArray(input) || input.length > 200) {
    throw new LessonError("tasks must be an array of at most 200 tasks.", 400);
  }
  const ids = new Set<string>();
  return input.map((value, index) => {
    const field = `tasks[${index}]`;
    const task = record(value, field);
    onlyKeys(task, ["id", "order", "type", "prompt", "options", "correctAnswer", "answerSpace"], field);
    const id = task.id === undefined ? crypto.randomUUID() : requiredString(task.id, `${field}.id`, 128);
    if (ids.has(id)) throw new LessonError("Task IDs must be unique.", 400);
    ids.add(id);
    if (task.order !== undefined && (!Number.isSafeInteger(task.order) || Number(task.order) < 1)) {
      throw new LessonError(`${field}.order must be a positive integer.`, 400);
    }
    if (task.type !== "truefalse" && task.type !== "mcq" && task.type !== "open") {
      throw new LessonError(`${field}.type is invalid.`, 400);
    }
    const result: LessonTask = {
      id, order: index + 1, type: task.type,
      prompt: requiredString(task.prompt, `${field}.prompt`, 8000),
    };
    if (task.type === "mcq") {
      if (!Array.isArray(task.options) || task.options.length < 2 || task.options.length > 10) {
        throw new LessonError(`${field}.options must contain 2–10 options.`, 400);
      }
      result.options = task.options.map((option) => requiredString(option, `${field}.options`, 2000));
      if (new Set(result.options).size !== result.options.length) {
        throw new LessonError(`${field}.options must be unique.`, 400);
      }
      result.correctAnswer = requiredString(task.correctAnswer, `${field}.correctAnswer`, 2000);
      if (!result.options.includes(result.correctAnswer)) {
        throw new LessonError(`${field}.correctAnswer must match an option.`, 400);
      }
    } else {
      if (task.options !== undefined) throw new LessonError(`${field}.options only applies to mcq.`, 400);
      if (task.type === "truefalse") {
        if (![true, false, "true", "false"].includes(task.correctAnswer as string | boolean)) {
          throw new LessonError(`${field}.correctAnswer must be true or false.`, 400);
        }
        result.correctAnswer = String(task.correctAnswer);
      } else if (task.correctAnswer !== undefined) {
        result.correctAnswer = stringField(task.correctAnswer, `${field}.correctAnswer`, 8000);
      }
    }
    if (task.answerSpace !== undefined) {
      if (task.type !== "open" || typeof task.answerSpace !== "string" || !["short", "medium", "long"].includes(task.answerSpace)) {
        throw new LessonError(`${field}.answerSpace is invalid.`, 400);
      }
      result.answerSpace = task.answerSpace as LessonTask["answerSpace"];
    }
    return result;
  });
}
