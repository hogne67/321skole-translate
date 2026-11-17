import type { StatisticsSettings } from "./worksheet";

export const STATISTICS_MAX_TASK_COUNT = 60;
export type StatisticsPrintOptions = Pick<StatisticsSettings, "taskType" | "showSupport">;

export function statisticsPageCapacity(options: StatisticsPrintOptions) {
  if (options.taskType === "frequency_table") return { first: 6, following: 7 };
  if (options.taskType === "central_tendency") return options.showSupport ? { first: 5, following: 6 } : { first: 7, following: 8 };
  return { first: 3, following: 4 };
}

export function statisticsFullPageCounts(options: StatisticsPrintOptions): number[] {
  const { first, following } = statisticsPageCapacity(options);
  return Array.from({ length: Math.floor((STATISTICS_MAX_TASK_COUNT - first) / following) + 1 }, (_, page) => first + page * following);
}

export function statisticsCountAfterOptionsChange(count: number, previous: StatisticsPrintOptions, next: StatisticsPrintOptions, custom: boolean): number {
  const page = statisticsFullPageCounts(previous).indexOf(count), counts = statisticsFullPageCounts(next);
  return custom || page < 0 ? count : counts[Math.min(page, counts.length - 1)];
}

export function statisticsPrintPages<T>(tasks: readonly T[], options: StatisticsPrintOptions): { tasks: T[]; startIndex: number }[] {
  const { first, following } = statisticsPageCapacity(options), pages: { tasks: T[]; startIndex: number }[] = [];
  for (let startIndex = 0; startIndex < tasks.length;) {
    const count = startIndex === 0 ? first : following;
    pages.push({ tasks: tasks.slice(startIndex, startIndex + count), startIndex });
    startIndex += count;
  }
  return pages;
}
