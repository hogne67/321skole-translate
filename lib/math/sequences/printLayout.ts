export const SEQUENCES_MAX_TASK_COUNT = 60;
export function sequencesPageCapacity(taskType: string, showSupport: boolean) {
  if (taskType === "figures" || taskType === "mixed") return { first: 6, following: 6 };
  if (taskType === "rule" && !showSupport) return { first: 12, following: 14 };
  return showSupport ? { first: 8, following: 10 } : { first: 12, following: 16 };
}
export function sequencesFullPageCounts(taskType: string, showSupport: boolean): number[] {
  const { first, following } = sequencesPageCapacity(taskType, showSupport);
  return Array.from({ length: Math.floor((SEQUENCES_MAX_TASK_COUNT - first) / following) + 1 }, (_, i) => first + i * following);
}
export function sequencesPrintPages<T>(tasks: readonly T[], taskType: string, showSupport: boolean) {
  const pages: { tasks: T[]; startIndex: number }[] = [];
  const capacity = sequencesPageCapacity(taskType, showSupport);
  for (let startIndex = 0; startIndex < tasks.length;) {
    const count = startIndex === 0 ? capacity.first : capacity.following;
    pages.push({ tasks: tasks.slice(startIndex, startIndex + count), startIndex });
    startIndex += count;
  }
  return pages;
}
