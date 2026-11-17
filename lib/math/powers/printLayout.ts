import type { PowersSettings } from "./worksheet";

export const POWERS_MAX_TASK_COUNT = 60;
export type PowersPrintOptions = Pick<PowersSettings, "taskType" | "showSupport">;

export function powersPageCapacity(options: PowersPrintOptions) {
  if (options.taskType === "evaluate") return options.showSupport ? { first: 18, following: 22 } : { first: 28, following: 32 };
  if (options.taskType === "expand") return options.showSupport ? { first: 16, following: 20 } : { first: 22, following: 28 };
  return options.showSupport ? { first: 14, following: 16 } : { first: 20, following: 24 };
}

export function powersFullPageCounts(options: PowersPrintOptions): number[] {
  const { first, following } = powersPageCapacity(options);
  return Array.from({ length: Math.floor((POWERS_MAX_TASK_COUNT - first) / following) + 1 }, (_, page) => first + page * following);
}

export function powersCountAfterOptionsChange(count: number, previous: PowersPrintOptions, next: PowersPrintOptions, custom: boolean): number {
  const page = powersFullPageCounts(previous).indexOf(count), counts = powersFullPageCounts(next);
  return custom || page < 0 ? count : counts[Math.min(page, counts.length - 1)];
}

export function powersPrintPages<T>(tasks: readonly T[], options: PowersPrintOptions): { tasks: T[]; startIndex: number }[] {
  const { first, following } = powersPageCapacity(options), pages: { tasks: T[]; startIndex: number }[] = [];
  for (let startIndex = 0; startIndex < tasks.length;) {
    const count = startIndex === 0 ? first : following;
    pages.push({ tasks: tasks.slice(startIndex, startIndex + count), startIndex });
    startIndex += count;
  }
  return pages;
}
