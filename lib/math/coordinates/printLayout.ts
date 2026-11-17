export const COORDINATES_MAX_TASK_COUNT = 60;
export const COORDINATES_FIRST_PAGE_COUNT = 4;
export const COORDINATES_FOLLOWING_PAGE_COUNT = 4;

export function coordinatesFullPageCounts(): number[] {
  return Array.from({ length: Math.floor((COORDINATES_MAX_TASK_COUNT - COORDINATES_FIRST_PAGE_COUNT) / COORDINATES_FOLLOWING_PAGE_COUNT) + 1 }, (_, page) => COORDINATES_FIRST_PAGE_COUNT + page * COORDINATES_FOLLOWING_PAGE_COUNT);
}

export function coordinatesPrintPages<T>(tasks: readonly T[]): { tasks: T[]; startIndex: number }[] {
  const pages: { tasks: T[]; startIndex: number }[] = [];
  for (let startIndex = 0; startIndex < tasks.length;) {
    const count = startIndex === 0 ? COORDINATES_FIRST_PAGE_COUNT : COORDINATES_FOLLOWING_PAGE_COUNT;
    pages.push({ tasks: tasks.slice(startIndex, startIndex + count), startIndex });
    startIndex += count;
  }
  return pages;
}
