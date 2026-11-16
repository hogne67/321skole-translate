export const MEASUREMENT_FIRST_PAGE_COUNT = 52;
export const MEASUREMENT_FOLLOWING_PAGE_COUNT = 60;
export const MEASUREMENT_MAX_TASK_COUNT = 200;

export function measurementFullPageCounts(): number[] {
  return Array.from({ length: Math.floor((MEASUREMENT_MAX_TASK_COUNT - MEASUREMENT_FIRST_PAGE_COUNT) / MEASUREMENT_FOLLOWING_PAGE_COUNT) + 1 }, (_, page) => MEASUREMENT_FIRST_PAGE_COUNT + page * MEASUREMENT_FOLLOWING_PAGE_COUNT);
}

export function measurementPrintPages<T>(tasks: readonly T[]): { tasks: T[]; startIndex: number }[] {
  const pages: { tasks: T[]; startIndex: number }[] = [];
  for (let startIndex = 0; startIndex < tasks.length;) {
    const count = startIndex === 0 ? MEASUREMENT_FIRST_PAGE_COUNT : MEASUREMENT_FOLLOWING_PAGE_COUNT;
    pages.push({ tasks: tasks.slice(startIndex, startIndex + count), startIndex });
    startIndex += count;
  }
  return pages;
}
