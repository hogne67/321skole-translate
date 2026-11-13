import type { FractionWorksheet } from "./types";
import { isStoredMathWorksheetLanguage, normalizeMathWorksheetLanguage } from "../taxonomy";
import { FRACTION_CALCULATION_OPERATIONS } from "./calculationOperations";

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const fraction = (value: unknown) => record(value) && Number.isInteger(value.numerator) && Number.isInteger(value.denominator) && Number(value.denominator) > 0;

/** Validate saved data without changing task IDs, numbers or answers. */
export function restoreFractionWorksheet(value: unknown): FractionWorksheet | null {
  if (!record(value) || typeof value.title !== "string" || typeof value.instructions !== "string" || !isStoredMathWorksheetLanguage(value.language)) return null;
  if (!["grade_2_4", "grade_5_7", "grade_8_10"].includes(String(value.level)) || !["easy", "medium", "hard"].includes(String(value.difficulty))) return null;
  if (!["part_of_whole", "write_fraction", "choose_fraction", "mixed", "calculation"].includes(String(value.topic))) return null;
  if (!Array.isArray(value.tasks) || !value.tasks.length || value.tasks.length > 100) return null;
  const ids = new Set<string>();
  for (const task of value.tasks) {
    if (!record(task) || typeof task.id !== "string" || !task.id || ids.has(task.id) || typeof task.prompt !== "string" || typeof task.answer !== "string" || !fraction(task.fraction)) return null;
    if (!["bar", "circle", "rectangle"].includes(String(task.visual))) return null;
    if (value.topic === "calculation") {
      if (task.type !== "calculate_fraction" || !record(task.calculation) || !fraction(task.calculation.left) || !fraction(task.calculation.right) || !FRACTION_CALCULATION_OPERATIONS.includes(task.calculation.operation as typeof FRACTION_CALCULATION_OPERATIONS[number])) return null;
    } else if (!["shade_fraction", "write_fraction", "choose_fraction"].includes(String(task.type))) return null;
    if (task.type === "choose_fraction" && (!Array.isArray(task.options) || !task.options.every(option => typeof option === "string"))) return null;
    ids.add(task.id);
  }
  if (value.topic === "calculation" && (!record(value.calculation) || ![...FRACTION_CALCULATION_OPERATIONS, "mixed"].includes(String(value.calculation.operation) as typeof FRACTION_CALCULATION_OPERATIONS[number]) || !Number.isInteger(value.calculation.denominatorMin) || !Number.isInteger(value.calculation.denominatorMax))) return null;
  if (value.visualKinds !== undefined && (!Array.isArray(value.visualKinds) || !value.visualKinds.length || !value.visualKinds.every(kind => ["bar", "circle", "rectangle"].includes(kind)))) return null;
  return { ...value, language: normalizeMathWorksheetLanguage(value.language) } as FractionWorksheet;
}
