export const PYTHAGORAS_MAX_TASK_COUNT = 60;
export function pythagorasPageCapacity(showSupport: boolean) {
  return showSupport ? { first: 6, following: 6 } : { first: 6, following: 8 };
}
export function pythagorasFullPageCounts(showSupport: boolean): number[] {
  const { first, following } = pythagorasPageCapacity(showSupport);
  return Array.from({ length: Math.floor((PYTHAGORAS_MAX_TASK_COUNT - first) / following) + 1 }, (_, page) => first + page * following);
}
export function pythagorasPrintPages<T>(tasks: readonly T[], showSupport: boolean): { tasks: T[]; startIndex: number }[] {
  const pages: { tasks: T[]; startIndex: number }[] = [];
  for (let startIndex = 0; startIndex < tasks.length;) {
    const capacity = startIndex === 0 ? pythagorasPageCapacity(showSupport).first : pythagorasPageCapacity(showSupport).following;
    pages.push({ tasks: tasks.slice(startIndex, startIndex + capacity), startIndex });
    startIndex += capacity;
  }
  return pages;
}
