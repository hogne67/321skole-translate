export const FRACTION_CALCULATION_FIRST_PAGE_COUNT = 42;
export const FRACTION_CALCULATION_FOLLOWING_PAGE_COUNT = 51;
export const FRACTION_CALCULATION_MIN_TASK_COUNT = 6;
export const FRACTION_CALCULATION_MAX_TASK_COUNT = 200;

export function fractionCalculationFullPageCounts(): number[] {
  return Array.from({ length: Math.floor((FRACTION_CALCULATION_MAX_TASK_COUNT - FRACTION_CALCULATION_FIRST_PAGE_COUNT) / FRACTION_CALCULATION_FOLLOWING_PAGE_COUNT) + 1 }, (_, page) => FRACTION_CALCULATION_FIRST_PAGE_COUNT + page * FRACTION_CALCULATION_FOLLOWING_PAGE_COUNT);
}

export function fractionCalculationPrintPages<T>(tasks: readonly T[]): { tasks: T[]; startIndex: number }[] {
  const pages: { tasks: T[]; startIndex: number }[] = [];
  for (let startIndex = 0; startIndex < tasks.length;) {
    const capacity = startIndex === 0 ? FRACTION_CALCULATION_FIRST_PAGE_COUNT : FRACTION_CALCULATION_FOLLOWING_PAGE_COUNT;
    pages.push({ tasks: tasks.slice(startIndex, startIndex + capacity), startIndex });
    startIndex += capacity;
  }
  return pages;
}
