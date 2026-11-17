import type { FactorizationSettings } from "./worksheet";

export const FACTORIZATION_MAX_TASK_COUNT = 60;
export type FactorizationPrintOptions = Pick<FactorizationSettings, "taskType" | "maximum" | "showSupport">;

export function factorizationPageCapacity(options: FactorizationPrintOptions) {
  if (options.taskType === "factor_tree" || (options.taskType === "mixed" && options.maximum === 1000)) return { first: 4, following: 6 };
  if (options.taskType === "mixed") return { first: 6, following: 8 };
  if (options.taskType === "missing_factor") return options.showSupport ? { first: 20, following: 24 } : { first: 24, following: 30 };
  if (options.taskType === "prime_factors") return options.showSupport ? { first: 14, following: 16 } : { first: 20, following: 24 };
  const counts = options.maximum === 20 ? (options.showSupport ? [14, 18] : [18, 22])
    : options.maximum === 50 ? (options.showSupport ? [10, 12] : [14, 16])
      : options.maximum === 100 ? (options.showSupport ? [10, 12] : [12, 14])
        : options.maximum === 200 ? (options.showSupport ? [6, 8] : [8, 10]) : [4, 6];
  return { first: counts[0], following: counts[1] };
}

export function factorizationFullPageCounts(options: FactorizationPrintOptions): number[] {
  const { first, following } = factorizationPageCapacity(options);
  return Array.from({ length: Math.floor((FACTORIZATION_MAX_TASK_COUNT - first) / following) + 1 }, (_, page) => first + page * following);
}

export function factorizationCountAfterOptionsChange(count: number, previous: FactorizationPrintOptions, next: FactorizationPrintOptions, custom: boolean): number {
  const page = factorizationFullPageCounts(previous).indexOf(count), counts = factorizationFullPageCounts(next);
  return custom || page < 0 ? count : counts[Math.min(page, counts.length - 1)];
}

export function factorizationPrintPages<T>(tasks: readonly T[], options: FactorizationPrintOptions): { tasks: T[]; startIndex: number }[] {
  const { first, following } = factorizationPageCapacity(options), pages: { tasks: T[]; startIndex: number }[] = [];
  for (let startIndex = 0; startIndex < tasks.length;) {
    const count = startIndex === 0 ? first : following;
    pages.push({ tasks: tasks.slice(startIndex, startIndex + count), startIndex });
    startIndex += count;
  }
  return pages;
}
