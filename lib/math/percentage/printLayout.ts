import type { PercentageSettings } from "./worksheet";

export const PERCENTAGE_MAX_TASK_COUNT = 200;
export type PercentagePrintOptions = Pick<PercentageSettings, "taskType" | "showConclusion"> & Partial<Pick<PercentageSettings, "showSupport">>;

export function percentagePageCapacity(options: PercentagePrintOptions) {
  const support = options.showSupport !== false;
  const change = options.taskType === "discount" || options.taskType === "increase";
  if (change) return options.showConclusion ? { first: 10, following: 12 }
    : support ? { first: 10, following: 12 } : { first: 12, following: 14 };
  return options.showConclusion ? (support ? { first: 12, following: 14 } : { first: 14, following: 16 })
    : support ? { first: 14, following: 16 } : { first: 16, following: 18 };
}

export function percentageFullPageCounts(options: PercentagePrintOptions): number[] {
  const { first, following } = percentagePageCapacity(options);
  return Array.from({ length: Math.floor((PERCENTAGE_MAX_TASK_COUNT - first) / following) + 1 }, (_, page) => first + page * following);
}

export function percentageCountAfterOptionsChange(count: number, previous: PercentagePrintOptions, next: PercentagePrintOptions, custom: boolean): number {
  const page = percentageFullPageCounts(previous).indexOf(count), counts = percentageFullPageCounts(next);
  return custom || page < 0 ? count : counts[Math.min(page, counts.length - 1)];
}

export function percentagePrintPages<T>(tasks: readonly T[], options: PercentagePrintOptions): { tasks: T[]; startIndex: number }[] {
  const { first, following } = percentagePageCapacity(options), pages: { tasks: T[]; startIndex: number }[] = [];
  for (let startIndex = 0; startIndex < tasks.length;) {
    const count = startIndex === 0 ? first : following;
    pages.push({ tasks: tasks.slice(startIndex, startIndex + count), startIndex });
    startIndex += count;
  }
  return pages;
}
