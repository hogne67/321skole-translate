export const SCALE_MAX_TASK_COUNT = 60;
export function scalePageCapacity(showSupport: boolean) {
  return showSupport ? { first: 6, following: 6 } : { first: 6, following: 8 };
}
export function scaleFullPageCounts(showSupport: boolean): number[] {
  const { first, following } = scalePageCapacity(showSupport);
  return Array.from({ length: Math.floor((SCALE_MAX_TASK_COUNT - first) / following) + 1 }, (_, page) => first + page * following);
}
export function scalePrintPages<T>(tasks: readonly T[], showSupport: boolean): { tasks: T[]; startIndex: number }[] {
  const pages: { tasks: T[]; startIndex: number }[] = [];
  for (let startIndex = 0; startIndex < tasks.length;) {
    const capacity = startIndex === 0 ? scalePageCapacity(showSupport).first : scalePageCapacity(showSupport).following;
    pages.push({ tasks: tasks.slice(startIndex, startIndex + capacity), startIndex });
    startIndex += capacity;
  }
  return pages;
}
