import type { FractionTopic, FractionVisualKind } from "./types";

export type FractionVisualPrintOptions = { topic: FractionTopic; visualKinds: readonly FractionVisualKind[]; showHints: boolean; denominatorMax: number };
export const FRACTION_VISUAL_MAX_TASK_COUNT = 60;
export const DEFAULT_FRACTION_VISUAL_PRINT_OPTIONS: FractionVisualPrintOptions = { topic: "mixed", visualKinds: ["bar"], showHints: true, denominatorMax: 8 };

export function fractionVisualPageCapacity(options: FractionVisualPrintOptions) {
  const circle = options.visualKinds.includes("circle");
  const tallRectangle = options.visualKinds.includes("rectangle") && options.denominatorMax >= 9;
  const shading = options.topic === "mixed" || options.topic === "part_of_whole";
  if (circle) return shading ? (options.showHints ? { first: 6, following: 8 } : { first: 8, following: 10 })
    : options.showHints ? { first: 8, following: 10 } : { first: 10, following: 12 };
  if (tallRectangle) return shading ? (options.showHints ? { first: 8, following: 8 } : { first: 8, following: 10 })
    : options.showHints ? { first: 8, following: 10 } : { first: 10, following: 12 };
  return shading ? (options.showHints ? { first: 8, following: 10 } : { first: 10, following: 12 })
    : options.showHints ? { first: 10, following: 10 } : { first: 12, following: 14 };
}

export function fractionVisualFullPageCounts(options: FractionVisualPrintOptions): number[] {
  const { first, following } = fractionVisualPageCapacity(options);
  return Array.from({ length: Math.floor((FRACTION_VISUAL_MAX_TASK_COUNT - first) / following) + 1 }, (_, page) => first + page * following);
}

export function normalizeFractionVisualTaskCount(value: unknown, options: FractionVisualPrintOptions): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(FRACTION_VISUAL_MAX_TASK_COUNT, Math.round(value))) : fractionVisualPageCapacity(options).first;
}

export function fractionVisualCountAfterOptionsChange(count: number, previous: FractionVisualPrintOptions, next: FractionVisualPrintOptions, custom: boolean): number {
  const page = fractionVisualFullPageCounts(previous).indexOf(count), counts = fractionVisualFullPageCounts(next);
  return custom || page < 0 ? count : counts[Math.min(page, counts.length - 1)];
}

export function fractionVisualPrintPages<T>(tasks: readonly T[], options: FractionVisualPrintOptions): { tasks: T[]; startIndex: number }[] {
  const { first, following } = fractionVisualPageCapacity(options), pages: { tasks: T[]; startIndex: number }[] = [];
  for (let startIndex = 0; startIndex < tasks.length;) {
    const capacity = startIndex === 0 ? first : following;
    pages.push({ tasks: tasks.slice(startIndex, startIndex + capacity), startIndex });
    startIndex += capacity;
  }
  return pages;
}
