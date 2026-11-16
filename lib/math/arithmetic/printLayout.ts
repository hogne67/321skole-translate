import type { ArithmeticLayout } from "./types";

const counts = {
  grid: { default: 100, maximum: 120, perPage: 100 },
  vertical: { default: 32, maximum: 36, perPage: 32 },
  visual: { default: 8, maximum: 18, perPage: 8 },
} as const;

export function defaultArithmeticTaskCount(layout: ArithmeticLayout): number { return counts[layout].default; }
export function maxArithmeticTaskCount(layout: ArithmeticLayout): number { return counts[layout].maximum; }
export function arithmeticTasksPerPage(layout: ArithmeticLayout): number { return counts[layout].perPage; }
export function arithmeticPrintPages<T>(tasks: readonly T[], layout: ArithmeticLayout): T[][] {
  const perPage = arithmeticTasksPerPage(layout);
  return Array.from({ length: Math.ceil(tasks.length / perPage) }, (_, page) => tasks.slice(page * perPage, (page + 1) * perPage));
}
