import assert from "node:assert/strict";
import test from "node:test";
import { alignDividendRange } from "./ranges";
import { constrainVisualConfig } from "./visualLimits";

test("raising the upper divisor bound raises the minimum dividend", () => {
  assert.deepEqual(
    alignDividendRange({ min: 14, max: 1600 }, { min: 1, max: 15 }),
    { min: 15, max: 1600 }
  );
});

test("preserves a higher chosen minimum when the divisor is lowered", () => {
  assert.deepEqual(
    alignDividendRange({ min: 100, max: 1600 }, { min: 1, max: 15 }),
    { min: 100, max: 1600 }
  );
});

test("raises the maximum as needed to keep a valid dividend range", () => {
  assert.deepEqual(
    alignDividendRange({ min: 10, max: 20 }, { min: 1, max: 50 }),
    { min: 50, max: 50 }
  );
});

test("linked visual ranges remain within the dot limit", () => {
  const config = constrainVisualConfig("division", {
    taskType: "whole_division",
    operandA: { min: 10, max: 30 },
    operandB: { min: 1, max: 100 },
  });
  assert.deepEqual(alignDividendRange(config.operandA, config.operandB), { min: 40, max: 40 });
});
