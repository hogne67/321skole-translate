export const CLOCK_MAX_TASK_COUNT = 60;
export const CLOCK_FIRST_PAGE_COUNT = 8;
export const CLOCK_FOLLOWING_PAGE_COUNT = 10;

export function clockFullPageCounts(): number[] {
  return Array.from({ length: Math.floor((CLOCK_MAX_TASK_COUNT - CLOCK_FIRST_PAGE_COUNT) / CLOCK_FOLLOWING_PAGE_COUNT) + 1 }, (_, page) => CLOCK_FIRST_PAGE_COUNT + page * CLOCK_FOLLOWING_PAGE_COUNT);
}

export function clockPrintPages<T>(tasks: readonly T[]): { tasks: T[]; startIndex: number }[] {
  const pages: { tasks: T[]; startIndex: number }[] = [];
  for (let startIndex = 0; startIndex < tasks.length;) {
    const count = startIndex === 0 ? CLOCK_FIRST_PAGE_COUNT : CLOCK_FOLLOWING_PAGE_COUNT;
    pages.push({ tasks: tasks.slice(startIndex, startIndex + count), startIndex });
    startIndex += count;
  }
  return pages;
}
