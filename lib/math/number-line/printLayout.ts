export const NUMBER_LINE_MAX_TASK_COUNT = 60;
export const NUMBER_LINE_FIRST_PAGE_COUNT = 7;
export const NUMBER_LINE_FOLLOWING_PAGE_COUNT = 8;

export function numberLineFullPageCounts(): number[] {
  return Array.from({ length: Math.floor((NUMBER_LINE_MAX_TASK_COUNT - NUMBER_LINE_FIRST_PAGE_COUNT) / NUMBER_LINE_FOLLOWING_PAGE_COUNT) + 1 }, (_, page) => NUMBER_LINE_FIRST_PAGE_COUNT + page * NUMBER_LINE_FOLLOWING_PAGE_COUNT);
}

export function numberLinePrintPages<T>(tasks: readonly T[]): { tasks: T[]; startIndex: number }[] {
  const pages: { tasks: T[]; startIndex: number }[] = [];
  for (let startIndex = 0; startIndex < tasks.length;) {
    const count = startIndex === 0 ? NUMBER_LINE_FIRST_PAGE_COUNT : NUMBER_LINE_FOLLOWING_PAGE_COUNT;
    pages.push({ tasks: tasks.slice(startIndex, startIndex + count), startIndex });
    startIndex += count;
  }
  return pages;
}
