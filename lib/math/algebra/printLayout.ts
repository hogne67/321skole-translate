import type { AlgebraSettings } from "./worksheet";

export const ALGEBRA_MAX_TASK_COUNT = 60;
export type AlgebraPrintOptions = Pick<AlgebraSettings, "level" | "showSupport" | "includeParentheses">;

export function algebraPageCapacity(options: AlgebraPrintOptions) {
  if (options.level === "mixed") {
    if (options.includeParentheses) return options.showSupport ? { first: 12, following: 14 } : { first: 16, following: 20 };
    return options.showSupport ? { first: 14, following: 16 } : { first: 20, following: 24 };
  }
  if (options.includeParentheses) return options.showSupport ? { first: 14, following: 16 } : { first: 20, following: 24 };
  return options.showSupport ? { first: 16, following: 20 } : { first: 24, following: 30 };
}

export function algebraFullPageCounts(options: AlgebraPrintOptions): number[] {
  const { first, following } = algebraPageCapacity(options);
  return Array.from({ length: Math.floor((ALGEBRA_MAX_TASK_COUNT - first) / following) + 1 }, (_, page) => first + page * following);
}

export function algebraCountAfterOptionsChange(count: number, previous: AlgebraPrintOptions, next: AlgebraPrintOptions, custom: boolean): number {
  const page = algebraFullPageCounts(previous).indexOf(count), counts = algebraFullPageCounts(next);
  return custom || page < 0 ? count : counts[Math.min(page, counts.length - 1)];
}

export function algebraPrintPages<T>(tasks: readonly T[], options: AlgebraPrintOptions): { tasks: T[]; startIndex: number }[] {
  const { first, following } = algebraPageCapacity(options), pages: { tasks: T[]; startIndex: number }[] = [];
  for (let startIndex = 0; startIndex < tasks.length;) {
    const count = startIndex === 0 ? first : following;
    pages.push({ tasks: tasks.slice(startIndex, startIndex + count), startIndex });
    startIndex += count;
  }
  return pages;
}
