import type { EquationSettings } from "./worksheet";

export const EQUATION_MAX_TASK_COUNT = 200;
export type EquationPrintOptions = Pick<EquationSettings, "taskType">;

export function equationPageCapacity(options: EquationPrintOptions) {
  if (["both_sides", "parentheses", "fraction"].includes(options.taskType)) return { first: 6, following: 8 };
  if (["mixed", "multiply_add", "multiply_subtract"].includes(options.taskType)) return { first: 10, following: 12 };
  if (options.taskType === "multiply") return { first: 16, following: 18 };
  return options.taskType === "divide" ? { first: 14, following: 16 } : { first: 18, following: 20 };
}

export function equationFullPageCounts(options: EquationPrintOptions): number[] {
  const { first, following } = equationPageCapacity(options);
  return Array.from({ length: Math.floor((EQUATION_MAX_TASK_COUNT - first) / following) + 1 }, (_, page) => first + page * following);
}

export function equationCountAfterOptionsChange(count: number, previous: EquationPrintOptions, next: EquationPrintOptions, custom: boolean): number {
  const page = equationFullPageCounts(previous).indexOf(count), counts = equationFullPageCounts(next);
  return custom || page < 0 ? count : counts[Math.min(page, counts.length - 1)];
}

export function equationPrintPages<T>(tasks: readonly T[], options: EquationPrintOptions): { tasks: T[]; startIndex: number }[] {
  const { first, following } = equationPageCapacity(options), pages: { tasks: T[]; startIndex: number }[] = [];
  for (let startIndex = 0; startIndex < tasks.length;) {
    const count = startIndex === 0 ? first : following;
    pages.push({ tasks: tasks.slice(startIndex, startIndex + count), startIndex });
    startIndex += count;
  }
  return pages;
}
