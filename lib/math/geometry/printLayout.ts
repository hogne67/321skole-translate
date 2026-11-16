import type { GeometryAnswerSpace } from "./types";

export const GEOMETRY_MAX_TASK_COUNT = 60;
export const DEFAULT_GEOMETRY_PRINT_OPTIONS: GeometryPrintOptions = { answerSpace: "medium", includeHints: false, showFormulas: false };
export type GeometryPrintOptions = { answerSpace: GeometryAnswerSpace; includeHints: boolean; showFormulas: boolean; showFigureMeta?: boolean };

export function geometryPageCapacity(options: GeometryPrintOptions) {
  const large = options.answerSpace === "large";
  const small = options.answerSpace === "small";
  const extras = Number(options.includeHints) + Number(options.showFormulas);
  const capacity = extras === 2 ? (large ? { first: 3, following: 3 } : small ? { first: 4, following: 5 } : { first: 3, following: 4 })
    : extras === 1 ? (large ? { first: 3, following: 4 } : small ? { first: 5, following: 6 } : { first: 4, following: options.showFormulas ? 5 : 6 })
      : large ? { first: 4, following: 5 } : { first: 5, following: 6 };
  return options.showFigureMeta ? { first: Math.min(3, capacity.first), following: Math.min(4, capacity.following) } : capacity;
}

export function geometryFullPageCounts(options: GeometryPrintOptions): number[] {
  const { first, following } = geometryPageCapacity(options);
  return Array.from({ length: Math.floor((GEOMETRY_MAX_TASK_COUNT - first) / following) + 1 }, (_, page) => first + page * following);
}

export function normalizeGeometryTaskCount(value: unknown, options: GeometryPrintOptions): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(GEOMETRY_MAX_TASK_COUNT, Math.round(value))) : geometryPageCapacity(options).first;
}

/** Keep the number of full sheets when display options change; custom counts stay exact. */
export function geometryTaskCountAfterOptionsChange(count: number, previous: GeometryPrintOptions, next: GeometryPrintOptions, custom: boolean): number {
  const page = geometryFullPageCounts(previous).indexOf(count), counts = geometryFullPageCounts(next);
  return custom || page < 0 ? count : counts[Math.min(page, counts.length - 1)];
}

export function geometryPrintPages<T>(tasks: readonly T[], options: GeometryPrintOptions): { tasks: T[]; startIndex: number }[] {
  const { first, following } = geometryPageCapacity(options), pages: { tasks: T[]; startIndex: number }[] = [];
  for (let startIndex = 0; startIndex < tasks.length;) {
    const capacity = startIndex === 0 ? first : following;
    pages.push({ tasks: tasks.slice(startIndex, startIndex + capacity), startIndex });
    startIndex += capacity;
  }
  return pages;
}
