import assert from "node:assert/strict";
import test from "node:test";
import { createWholeDivisionSampler, wholeDivisionChoices } from "./division";

function seededRandom() {
  let state = 42;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test("36 problems distribute divisors 1-15 evenly and stay within both ranges", () => {
  const choices = wholeDivisionChoices({ min: 15, max: 1600 }, { min: 1, max: 15 });
  const sample = createWholeDivisionSampler(choices, seededRandom());
  const counts = new Map<number, number>();
  for (let index = 0; index < 36; index += 1) {
    const { left, right } = sample();
    assert.ok(left >= 15 && left <= 1600);
    assert.ok(right >= 1 && right <= 15);
    assert.equal(left % right, 0);
    counts.set(right, (counts.get(right) ?? 0) + 1);
  }
  assert.equal(counts.size, 15);
  assert.ok((counts.get(1) ?? 0) <= 3);
  assert.ok(Math.max(...counts.values()) - Math.min(...counts.values()) <= 1);
});

test("only divisors with a multiple inside a narrow dividend range are used", () => {
  const choices = wholeDivisionChoices({ min: 100, max: 100 }, { min: 2, max: 15 });
  assert.deepEqual(choices.map((choice) => choice.divisor), [2, 4, 5, 10]);
  const sample = createWholeDivisionSampler(choices, seededRandom());
  for (let index = 0; index < 40; index += 1) {
    const { left, right } = sample();
    assert.equal(left, 100);
    assert.equal(left % right, 0);
  }
});

test("incompatible ranges have no whole division instead of falling back to a fraction", () => {
  const choices = wholeDivisionChoices({ min: 101, max: 101 }, { min: 2, max: 15 });
  assert.deepEqual(choices, []);
  assert.throws(createWholeDivisionSampler(choices), /No whole-number division/);
});

test("one explicitly selected divisor remains available on every problem", () => {
  const sample = createWholeDivisionSampler(
    wholeDivisionChoices({ min: 15, max: 1600 }, { min: 7, max: 7 }),
    seededRandom()
  );
  for (let index = 0; index < 36; index += 1) {
    const { left, right } = sample();
    assert.equal(right, 7);
    assert.equal(left % right, 0);
  }
});

test("visual choices respect the group limit and exclude division by zero", () => {
  const choices = wholeDivisionChoices(
    { min: 0, max: 40 },
    { min: 0, max: 40 },
    { allowZero: true, maxQuotient: 12 }
  );
  const sample = createWholeDivisionSampler(choices, seededRandom());
  for (let index = 0; index < 120; index += 1) {
    const { left, right } = sample();
    assert.ok(left >= 0 && left <= 40);
    assert.ok(right >= 1 && right <= 40);
    assert.equal(left % right, 0);
    assert.ok(left / right <= 12);
  }
});
