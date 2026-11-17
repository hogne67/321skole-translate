import type { PlaceValueSettings } from "./worksheet";

export const PLACE_VALUE_MAX_TASK_COUNT = 60;
export type PlaceValuePrintOptions = Pick<PlaceValueSettings, "taskType" | "integerDigits" | "decimalPlaces" | "showPlaceValueTable">;

export function placeValuePageCapacity(options: PlaceValuePrintOptions) {
  const marked = options.taskType === "digit_value" || options.taskType === "mixed";
  if (!options.showPlaceValueTable) return marked ? { first: 12, following: 14 } : { first: 18, following: 20 };
  const wide = options.integerDigits + options.decimalPlaces >= 7;
  return marked ? (wide ? { first: 6, following: 7 } : { first: 7, following: 8 }) : wide ? { first: 7, following: 9 } : { first: 8, following: 10 };
}

export function placeValueFullPageCounts(options: PlaceValuePrintOptions): number[] {
  const { first, following } = placeValuePageCapacity(options);
  return Array.from({ length: Math.floor((PLACE_VALUE_MAX_TASK_COUNT - first) / following) + 1 }, (_, page) => first + page * following);
}

export function placeValueCountAfterOptionsChange(count: number, previous: PlaceValuePrintOptions, next: PlaceValuePrintOptions, custom: boolean): number {
  const page = placeValueFullPageCounts(previous).indexOf(count), counts = placeValueFullPageCounts(next);
  return custom || page < 0 ? count : counts[Math.min(page, counts.length - 1)];
}

export function placeValuePrintPages<T>(tasks: readonly T[], options: PlaceValuePrintOptions): { tasks: T[]; startIndex: number }[] {
  const { first, following } = placeValuePageCapacity(options), pages: { tasks: T[]; startIndex: number }[] = [];
  for (let startIndex = 0; startIndex < tasks.length;) {
    const count = startIndex === 0 ? first : following;
    pages.push({ tasks: tasks.slice(startIndex, startIndex + count), startIndex });
    startIndex += count;
  }
  return pages;
}
