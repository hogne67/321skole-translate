import type { WordProblemsSettings } from "./worksheet";

export function wordProblemsPageCapacity(showSupport: boolean) {
  return showSupport ? { first: 4, following: 5 } : { first: 5, following: 6 };
}

/** Total task counts that fill complete A4 worksheets; the answer key is separate. */
export function wordProblemsFullPageCounts(showSupport: boolean): number[] {
  const { first, following } = wordProblemsPageCapacity(showSupport);
  return Array.from({ length: Math.floor((60 - first) / following) + 1 }, (_, page) => first + page * following);
}

export function wordProblemsPrintPages<T>(tasks: readonly T[], settings: Pick<WordProblemsSettings, "showSupport">): { tasks: T[]; startIndex: number }[] {
  const { first, following } = wordProblemsPageCapacity(settings.showSupport);
  const pages: { tasks: T[]; startIndex: number }[] = [];
  for (let startIndex = 0; startIndex < tasks.length;) {
    const capacity = startIndex === 0 ? first : following;
    pages.push({ tasks: tasks.slice(startIndex, startIndex + capacity), startIndex });
    startIndex += capacity;
  }
  return pages;
}
