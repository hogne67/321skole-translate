import type {
  ArithmeticGeneratorRules,
  ArithmeticLayout,
  ArithmeticNumberRange,
  ArithmeticOperation,
  ArithmeticTaskType,
} from "@/lib/math/arithmetic/types";
import type { ArithmeticUiCopy } from "@/lib/math/arithmetic/uiCopy";

export type RulesState = Required<ArithmeticGeneratorRules>;

export type ArithmeticPreset = {
  id: string;
  label: string;
  operation: ArithmeticOperation;
  taskType: ArithmeticTaskType;
  operandA: ArithmeticNumberRange;
  operandB: ArithmeticNumberRange;
  rules: RulesState;
};

export type TaskTypeOption = {
  value: ArithmeticTaskType;
  label: string;
};

export const DEFAULT_RULES: RulesState = {
  allowCarry: true,
  allowBorrow: true,
  allowNegative: false,
  wholeNumberDivision: true,
};

export const PRESETS: ArithmeticPreset[] = [
  {
    id: "addition_small",
    label: "0-10",
    operation: "addition",
    taskType: "standard",
    operandA: { min: 0, max: 10 },
    operandB: { min: 0, max: 10 },
    rules: DEFAULT_RULES,
  },
  {
    id: "addition_no_carry",
    label: "Uten tierovergang",
    operation: "addition",
    taskType: "no_transition",
    operandA: { min: 10, max: 50 },
    operandB: { min: 10, max: 50 },
    rules: { ...DEFAULT_RULES, allowCarry: false },
  },
  {
    id: "addition_carry",
    label: "Med tierovergang",
    operation: "addition",
    taskType: "with_transition",
    operandA: { min: 20, max: 100 },
    operandB: { min: 20, max: 100 },
    rules: { ...DEFAULT_RULES, allowCarry: true },
  },
  {
    id: "subtraction_no_borrow",
    label: "Uten lån",
    operation: "subtraction",
    taskType: "no_transition",
    operandA: { min: 10, max: 100 },
    operandB: { min: 1, max: 50 },
    rules: { ...DEFAULT_RULES, allowBorrow: false },
  },
  {
    id: "subtraction_borrow",
    label: "Med lån",
    operation: "subtraction",
    taskType: "with_transition",
    operandA: { min: 20, max: 100 },
    operandB: { min: 10, max: 90 },
    rules: { ...DEFAULT_RULES, allowBorrow: true },
  },
  {
    id: "times_table_0_10",
    label: "Lille gangetabell",
    operation: "multiplication",
    taskType: "times_table",
    operandA: { min: 0, max: 10 },
    operandB: { min: 0, max: 10 },
    rules: DEFAULT_RULES,
  },
  {
    id: "times_table_0_12",
    label: "Gangetabell 0-12",
    operation: "multiplication",
    taskType: "times_table",
    operandA: { min: 0, max: 12 },
    operandB: { min: 0, max: 12 },
    rules: DEFAULT_RULES,
  },
  {
    id: "two_digit_by_one_digit",
    label: "Tosifret x ensifret",
    operation: "multiplication",
    taskType: "two_digit_by_one_digit",
    operandA: { min: 10, max: 50 },
    operandB: { min: 2, max: 9 },
    rules: DEFAULT_RULES,
  },
  {
    id: "division_whole_0_10",
    label: "Deling uten rest",
    operation: "division",
    taskType: "whole_division",
    operandA: { min: 10, max: 100 },
    operandB: { min: 1, max: 10 },
    rules: DEFAULT_RULES,
  },
  {
    id: "mixed_0_10",
    label: "Alle 0-10",
    operation: "mixed",
    taskType: "standard",
    operandA: { min: 0, max: 10 },
    operandB: { min: 0, max: 10 },
    rules: DEFAULT_RULES,
  },
  {
    id: "mixed_0_20",
    label: "Alle 0-20",
    operation: "mixed",
    taskType: "standard",
    operandA: { min: 0, max: 20 },
    operandB: { min: 0, max: 20 },
    rules: DEFAULT_RULES,
  },
  {
    id: "mixed_without_zero",
    label: "Uten 0",
    operation: "mixed",
    taskType: "standard",
    operandA: { min: 1, max: 10 },
    operandB: { min: 1, max: 10 },
    rules: DEFAULT_RULES,
  },
];

export function defaultPresetFor(operation: ArithmeticOperation) {
  return PRESETS.find((preset) => preset.operation === operation) ?? PRESETS[0];
}

export function rulesForTaskType(
  taskType: ArithmeticTaskType,
  current: RulesState
): RulesState {
  if (taskType === "no_transition") {
    return {
      ...current,
      allowCarry: false,
      allowBorrow: false,
    };
  }

  if (taskType === "with_transition") {
    return {
      ...current,
      allowCarry: true,
      allowBorrow: true,
    };
  }

  return current;
}

export function taskTypeOptionsFor(
  operation: ArithmeticOperation,
  copy: ArithmeticUiCopy,
  layout?: ArithmeticLayout
): TaskTypeOption[] {
  const includeMissingNumber = layout !== "visual";

  if (operation === "addition") {
    const options: TaskTypeOption[] = [
      { value: "standard", label: copy.taskTypes.standard },
      { value: "no_transition", label: copy.taskTypes.noTransitionAddition },
      { value: "with_transition", label: copy.taskTypes.withTransitionAddition },
    ];

    if (includeMissingNumber) {
      options.push({ value: "missing_number", label: copy.taskTypes.missingNumber });
    }

    return options;
  }

  if (operation === "subtraction") {
    const options: TaskTypeOption[] = [
      { value: "standard", label: copy.taskTypes.standard },
      { value: "no_transition", label: copy.taskTypes.noTransitionSubtraction },
      { value: "with_transition", label: copy.taskTypes.withTransitionSubtraction },
    ];

    if (includeMissingNumber) {
      options.push({ value: "missing_number", label: copy.taskTypes.missingNumber });
    }

    return options;
  }

  if (operation === "multiplication") {
    const options: TaskTypeOption[] = [
      { value: "standard", label: copy.taskTypes.standard },
      { value: "times_table", label: copy.taskTypes.timesTable },
    ];

    if (layout !== "visual") {
      options.push({ value: "two_digit_by_one_digit", label: copy.taskTypes.twoDigitByOneDigit });
    }

    if (includeMissingNumber) {
      options.push({ value: "missing_number", label: copy.taskTypes.missingNumber });
    }

    return options;
  }

  if (operation === "division") {
    const options: TaskTypeOption[] = [
      { value: "whole_division", label: copy.taskTypes.wholeDivision },
    ];

    if (layout !== "visual") {
      options.push({ value: "standard", label: copy.taskTypes.standard });
    }

    if (includeMissingNumber) {
      options.push({ value: "missing_number", label: copy.taskTypes.missingNumber });
    }

    return options;
  }

  const options: TaskTypeOption[] = [
    { value: "standard", label: copy.taskTypes.standard },
  ];

  if (includeMissingNumber) {
    options.push({ value: "missing_number", label: copy.taskTypes.missingNumber });
  }

  return options;
}
