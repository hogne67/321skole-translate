import assert from "node:assert/strict";
import test from "node:test";
import { generateWorksheet, makeWrongOptions, normalizeRequest } from "./generateWorksheet";
import { gradeFractionWorksheet } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/fractionGrade";

test("explicit whole-part ranges override legacy difficulty pools", () => {
  for (let min = 2; min <= 12; min += 1) {
    for (let max = min; max <= 12; max += 1) {
      const params = normalizeRequest({ denominatorMin: min, denominatorMax: max, difficulty: "easy", taskCount: 12 });
      assert.deepEqual(params.denominators, Array.from({ length: max - min + 1 }, (_, index) => min + index));
      const sheet = generateWorksheet(params);
      assert.deepEqual(sheet.denominatorRange, { min, max });
      sheet.tasks.forEach((task) => {
        assert.ok(task.fraction.denominator >= min && task.fraction.denominator <= max);
        assert.ok(task.fraction.numerator >= 1 && task.fraction.numerator <= task.fraction.denominator);
        assert.equal(task.answer, `${task.fraction.numerator}/${task.fraction.denominator}`);
        assert.equal(task.expected?.answerText, task.answer);
      });
    }
  }
});

test("invalid part counts fail instead of silently changing the requested range", () => {
  for (const [min, max] of [[1, 8], [8, 4], [2, 13], [2.5, 8], [2, Infinity], [NaN, 8]]) {
    assert.throws(() => normalizeRequest({ denominatorMin: min, denominatorMax: max }), /INVALID_DENOMINATOR_RANGE/);
  }
});

test("legacy request shapes still use their original language, level and pools", () => {
  assert.deepEqual(normalizeRequest({ difficulty: "easy" }).denominators, [2, 3, 4, 5]);
  assert.deepEqual(normalizeRequest({ difficulty: "medium" }).denominators, [2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(normalizeRequest({ difficulty: "hard" }).denominators, [2, 3, 4, 5, 6, 7, 8, 9, 10, 12]);
  const sheet = generateWorksheet(normalizeRequest({ language: "no", level: "grade_8_10", taskCount: 6, topic: "write_fraction", visualKinds: ["circle"] }));
  assert.equal(sheet.language, "nb");
  assert.equal(sheet.level, "grade_8_10");
  assert.ok(sheet.tasks.every((task) => task.type === "write_fraction" && task.visual === "circle"));
  assert.equal(sheet.denominatorRange, undefined);
});

test("mixed tasks and chosen figures are distributed evenly", () => {
  for (let count = 3; count <= 12; count += 1) {
    const sheet = generateWorksheet(normalizeRequest({ taskCount: count, visualKinds: ["bar", "rectangle", "circle"] }));
    for (const counts of [
      ["write_fraction", "shade_fraction", "choose_fraction"].map((type) => sheet.tasks.filter((task) => task.type === type).length),
      ["bar", "circle", "rectangle"].map((visual) => sheet.tasks.filter((task) => task.visual === visual).length),
    ]) {
      assert.ok(Math.min(...counts) >= 1);
      assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
    }
    assert.deepEqual(sheet.tasks.map((task) => task.id), Array.from({ length: count }, (_, index) => String(index + 1)));
  }
});

test("every choice task has three mathematically distinct options and only one correct value", () => {
  for (let d = 2; d <= 12; d += 1) {
    for (let n = 1; n <= d; n += 1) {
      const options = makeWrongOptions(n, d);
      assert.equal(options.length, 3);
      const values = options.map((option) => {
        const [numerator, denominator] = option.split("/").map(Number);
        return numerator / denominator;
      });
      assert.equal(new Set(values).size, 3);
      assert.equal(values.filter((value) => value === n / d).length, 1);
      assert.ok(values.every((value) => value >= 0 && value <= 1));
    }
  }
});

test("saved Spaces answer formats still grade by task id for every model", () => {
  for (const visual of ["bar", "rectangle", "circle"]) {
    const sheet = generateWorksheet(normalizeRequest({ visualKinds: [visual], denominatorMin: 12, denominatorMax: 12, taskCount: 12 }));
    const restored = JSON.parse(JSON.stringify(sheet));
    const answers = Object.fromEntries(sheet.tasks.map((task) => [task.id, task.type === "shade_fraction"
      ? { selectedParts: Array.from({ length: task.fraction.numerator }, (_, index) => 11 - index) }
      : task.answer]));
    assert.equal(gradeFractionWorksheet(restored, answers).correctAuto, 12);
    assert.equal(gradeFractionWorksheet(restored, {}).unansweredAuto, 12);
    assert.equal(gradeFractionWorksheet(restored, answers).percentAuto, 100);
  }
});

test("all task types retain localized hints, prompts and grading metadata", () => {
  for (const language of ["nb", "en", "pt"] as const) {
    const sheet = generateWorksheet(normalizeRequest({ language }));
    for (const task of sheet.tasks) {
      assert.ok(task.prompt);
      assert.ok(task.hint);
      assert.ok(task.explanation);
      assert.equal(task.shadedParts, task.type === "shade_fraction" ? 0 : task.fraction.numerator);
      assert.equal(task.expected?.numerator, task.fraction.numerator);
      assert.equal(task.expected?.denominator, task.fraction.denominator);
    }
  }
});
