import assert from "node:assert/strict";
import test from "node:test";
import {
  clampVisualRange,
  constrainVisualConfig,
  visualDivisionPairs,
  visualOperandLimits,
  VISUAL_DOT_LIMIT,
  VISUAL_GROUP_LIMIT,
} from "./visualLimits";
import type { ArithmeticGeneratorConfig } from "./types";

const config: ArithmeticGeneratorConfig = {
  taskType: "standard",
  operandA: { min: 0, max: 50 },
  operandB: { min: 0, max: 50 },
  rules: { allowNegative: true },
};

test("visual add/sub ranges cannot exceed the number of displayed dots", () => {
  for (const operation of ["addition", "subtraction"] as const) {
    const constrained = constrainVisualConfig(operation, config);
    assert.deepEqual(constrained.operandA, { min: 0, max: VISUAL_DOT_LIMIT });
    assert.deepEqual(constrained.operandB, { min: 0, max: VISUAL_DOT_LIMIT });
    assert.equal(constrained.rules?.allowNegative, false);
  }
  assert.equal(config.operandA.max, 50);
});

test("both endpoints are limited, including pasted and reversed ranges", () => {
  assert.deepEqual(clampVisualRange({ min: 90, max: -20 }, { min: 0, max: 40 }), { min: 0, max: 40 });
  assert.deepEqual(clampVisualRange({ min: 100, max: 500 }, { min: 0, max: 40 }), { min: 40, max: 40 });
});

test("multiplication and mixed ranges respect the group model", () => {
  const multiplication = constrainVisualConfig("multiplication", {
    ...config,
    taskType: "two_digit_by_one_digit",
  });
  assert.equal(multiplication.operandA.max, VISUAL_GROUP_LIMIT);
  assert.equal(multiplication.operandB.max, VISUAL_GROUP_LIMIT);
  assert.equal(multiplication.taskType, "standard");
  assert.equal(visualOperandLimits("mixed", ["addition", "subtraction"]).operandA.max, 40);
  assert.equal(visualOperandLimits("mixed", ["addition", "multiplication"]).operandA.max, 12);
  assert.equal(visualOperandLimits("mixed", ["addition", "division"]).operandB.min, 1);
});

test("visual division always represents the dividend exactly with whole groups", () => {
  const division = constrainVisualConfig("division", config);
  assert.equal(division.taskType, "whole_division");
  const pairs = visualDivisionPairs(division);
  assert.ok(pairs.length > 0);
  for (const { left, right } of pairs) {
    assert.ok(left >= division.operandA.min && left <= division.operandA.max);
    assert.ok(right >= division.operandB.min && right <= division.operandB.max);
    assert.ok(Number.isInteger(left / right));
    assert.ok(left / right <= VISUAL_GROUP_LIMIT);
    assert.ok(right <= VISUAL_DOT_LIMIT);
    assert.equal((left / right) * right, left);
  }
  assert.deepEqual(visualDivisionPairs({ ...division, operandA: { min: 40, max: 40 }, operandB: { min: 3, max: 3 } }), []);
});
