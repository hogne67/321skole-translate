export const FRACTION_CALCULATION_OPERATIONS = ["addition", "subtraction", "multiplication", "division"] as const;

export type FractionCalculationOperation = typeof FRACTION_CALCULATION_OPERATIONS[number];

export const FRACTION_CALCULATION_SYMBOLS: Record<FractionCalculationOperation, string> = {
  addition: "+",
  subtraction: "−",
  multiplication: "×",
  division: "÷",
};
