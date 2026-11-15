import assert from "node:assert/strict";
import test from "node:test";
import { readingGenerationPolicy, readingStageTimeout } from "./generationBudget";

test("a slow or rejected B2 candidate cannot start five multi-minute attempts", () => {
  const policy = readingGenerationPolicy("B2");
  assert.ok(policy.totalMs < 120_000);
  assert.equal(policy.maxAttempts, 2);
  assert.equal(readingStageTimeout(policy, "review", 90_000, 45_000), 50_000);
});

test("late generation leaves time for review and stops when that reserve is exhausted", () => {
  const policy = readingGenerationPolicy("B2");
  assert.equal(readingStageTimeout(policy, "generation", 35_000, 45_000), 20_000);
  assert.equal(readingStageTimeout(policy, "review", 12_000, 45_000), 12_000);
  assert.equal(readingStageTimeout(policy, "generation", 15_000, 45_000), 0);
  assert.equal(readingStageTimeout(policy, "generation", -100, 45_000), 0);
});

test("the B2 limit leaves the existing advanced-level generation and review budgets intact", () => {
  for (const level of ["C1", "C2"] as const) {
    const policy = readingGenerationPolicy(level);
    assert.equal(policy.totalMs, 270_000);
    assert.equal(policy.maxAttempts, 5);
    assert.equal(readingStageTimeout(policy, "generation", 200_000, 90_000), 90_000);
    assert.equal(readingStageTimeout(policy, "review", 200_000, 90_000), 120_000);
  }
});
