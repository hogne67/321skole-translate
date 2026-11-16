export const COMPARISON_MAX_TASK_COUNT = 200;

export function comparisonPageCapacity(visualSupport: boolean) {
  return visualSupport ? { first: 14, following: 16 } : { first: 60, following: 69 };
}

export function comparisonFullPageCounts(visualSupport: boolean): number[] {
  const { first, following } = comparisonPageCapacity(visualSupport);
  return Array.from({ length: Math.floor((COMPARISON_MAX_TASK_COUNT - first) / following) + 1 }, (_, page) => first + page * following);
}

/** Keep the chosen number of sheets; exact custom counts remain unchanged. */
export function comparisonCountAfterSupportChange(count: number, previous: boolean, next: boolean, custom: boolean): number {
  const page = comparisonFullPageCounts(previous).indexOf(count), counts = comparisonFullPageCounts(next);
  return custom || page < 0 ? count : counts[Math.min(page, counts.length - 1)];
}

export function comparisonPrintPages<T>(tasks: readonly T[], visualSupport: boolean): { tasks: T[]; startIndex: number }[] {
  const { first, following } = comparisonPageCapacity(visualSupport), pages: { tasks: T[]; startIndex: number }[] = [];
  for (let startIndex = 0; startIndex < tasks.length;) {
    const count = startIndex === 0 ? first : following;
    pages.push({ tasks: tasks.slice(startIndex, startIndex + count), startIndex });
    startIndex += count;
  }
  return pages;
}
