import type { ArithmeticNumberRange } from "./types";

type DivisionChoice = {
  divisor: number;
  minQuotient: number;
  maxQuotient: number;
};

export function wholeDivisionChoices(
  dividend: ArithmeticNumberRange,
  divisor: ArithmeticNumberRange,
  options: { allowZero?: boolean; maxQuotient?: number } = {}
): DivisionChoice[] {
  const choices: DivisionChoice[] = [];
  for (let value = Math.max(1, Math.ceil(divisor.min)); value <= divisor.max; value += 1) {
    const minQuotient = Math.max(options.allowZero ? 0 : 1, Math.ceil(dividend.min / value));
    const maxQuotient = Math.min(Math.floor(dividend.max / value), options.maxQuotient ?? Infinity);
    if (minQuotient <= maxQuotient) {
      choices.push({ divisor: value, minQuotient, maxQuotient });
    }
  }
  return choices;
}

export function createWholeDivisionSampler(
  choices: DivisionChoice[],
  random: () => number = Math.random
) {
  let remaining: DivisionChoice[] = [];
  return () => {
    if (choices.length === 0) {
      throw new Error("No whole-number division fits the selected ranges.");
    }
    // Each valid divisor appears once before the next shuffled round starts.
    if (remaining.length === 0) remaining = [...choices];
    const index = Math.floor(random() * remaining.length);
    const [choice] = remaining.splice(index, 1);
    const quotient = choice.minQuotient +
      Math.floor(random() * (choice.maxQuotient - choice.minQuotient + 1));
    return { left: choice.divisor * quotient, right: choice.divisor };
  };
}
