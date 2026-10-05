import type { ArithmeticNumberRange } from "./types";

export function alignDividendRange(
  dividend: ArithmeticNumberRange,
  divisor: ArithmeticNumberRange
): ArithmeticNumberRange {
  const min = Math.max(dividend.min, divisor.min, divisor.max);
  return { min, max: Math.max(min, dividend.max) };
}
