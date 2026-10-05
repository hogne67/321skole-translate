import assert from "node:assert/strict";
import test from "node:test";
import Fraction from "fraction.js";
import { generateCalculationWorksheet, normalizeCalculationRequest } from "./generateCalculationWorksheet";
import { gradeFractionTask, gradeFractionWorksheet } from "./gradeWorksheet";
import type { CalculationRequest } from "./generateCalculationWorksheet";
import type { FractionTask } from "./types";
import { FRACTION_CALCULATION_OPERATIONS, FRACTION_CALCULATION_SYMBOLS, type FractionCalculationOperation } from "./calculationOperations";
import { readAutoGrade } from "@/lib/submissions/readers";

const task: FractionTask = { id: "1", type: "calculate_fraction", visual: "bar", fraction: { numerator: 1, denominator: 2 }, answer: "1/2", prompt: "1/4 + 1/4 =", calculation: { left: { numerator: 1, denominator: 4 }, right: { numerator: 1, denominator: 4 }, operation: "addition" } };

function expectedResult(a: Fraction, b: Fraction, operation: FractionCalculationOperation) {
  switch (operation) {
    case "addition": return a.add(b);
    case "subtraction": return a.sub(b);
    case "multiplication": return a.mul(b);
    case "division": return a.div(b);
  }
}
function assertBalancedOperations(tasks: FractionTask[]) {
  const counts = FRACTION_CALCULATION_OPERATIONS.map(operation => tasks.filter(task => task.calculation!.operation === operation).length);
  assert.ok(counts.every(count => count > 0));
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
}
test("reduction is optional; equivalent unreduced answers get half credit only when required", () => {
  for (const answer of ["2/4", "4/8", " 2 : 4 "]) {
    assert.equal(gradeFractionTask(task, answer, false).points, 1);
    assert.equal(gradeFractionTask(task, answer, true).points, 0.5);
  }
  assert.equal(gradeFractionTask(task, "1/2", true).points, 1);
  for (const value of ["3/4", "1/0", "0/0", "1/", "word", "0.5", {}, "1/2/3"]) assert.equal(gradeFractionTask(task, value, true).points, 0);
  assert.equal(gradeFractionTask(task, "", true).hasAnswer, false);
});
test("whole answers require denominator one; reducible whole-number fractions are partial", () => {
  const whole = { ...task, answer: "1", fraction: { numerator: 1, denominator: 1 } };
  for (const answer of ["1", "1/"]) assert.equal(gradeFractionTask(whole, answer, true).points, 0);
  assert.equal(gradeFractionTask(whole, "1/1", true).points, 1);
  assert.equal(gradeFractionTask(whole, "1/1", true).correctAnswer, "1/1");
  assert.equal(gradeFractionTask(whole, "2/2", true).points, 0.5);
  assert.equal(gradeFractionTask(whole, "2/2", false).points, 1);
  assert.equal(gradeFractionTask({ ...whole, answer: "0" }, "0", true).points, 0);
  assert.equal(gradeFractionTask({ ...whole, answer: "0" }, "0/1", true).points, 1);
  assert.equal(gradeFractionTask({ ...whole, answer: "0" }, "0/4", true).points, 0.5);
});
test("mixed numbers and whitespace inside integers cannot be mistaken for improper fractions", () => {
  const improper = { ...task, answer: "11/2" };
  for (const answer of ["1 1/2", "1\t1/2", "1+1/2", "1og1/2", "1 1 / 2"]) {
    assert.equal(gradeFractionTask(improper, answer, false).points, 0);
  }
  assert.equal(gradeFractionTask(improper, " 11 / 2 ", true).points, 1);
  const proper = { ...task, answer: "3/2" };
  assert.equal(gradeFractionTask(proper, "1 1/2", false).points, 0);
});
test("fixed and varied generators honor denominators and balance operations without negative answers", () => {
  for (const mode of ["fixed", "varied"] as const) {
    for (const operation of [...FRACTION_CALCULATION_OPERATIONS, "mixed"] as const) {
      for (let run = 0; run < 10; run++) {
        const sheet = generateCalculationWorksheet(normalizeCalculationRequest({ denominatorMode: mode, denominatorMin: 4, denominatorMax: 100, taskCount: 37, operation }));
        assert.equal(sheet.tasks.length, 37);
        const denominators = sheet.tasks.map(task => task.calculation!.left.denominator);
        assert.ok(denominators.every(d => mode === "fixed" ? d === 4 : d >= 4 && d <= 100));
        for (const item of sheet.tasks) {
          const { left, right, operation } = item.calculation!;
          assert.equal(left.denominator, right.denominator);
          const a = new Fraction(left.numerator, left.denominator);
          assert.ok(new Fraction(item.answer).equals(expectedResult(a, new Fraction(right.numerator, right.denominator), operation)));
          assert.ok(new Fraction(item.answer).valueOf() >= 0);
          assert.match(item.answer, /^\d+\/\d+$/);
          assert.equal(item.expected?.answerText, item.answer);
          assert.equal(gradeFractionTask(item, item.answer, true).points, 1);
        }
        if (operation === "mixed") assertBalancedOperations(sheet.tasks);
      }
    }
  }
});
test("invalid settings are rejected, including impossible ranges and task counts", () => {
  for (const settings of [{ denominatorMin: 0 }, { denominatorMax: 101 }, { denominatorMin: 12, denominatorMax: 3 }, { denominatorMin: 2.5 }, { taskCount: 101 }, { taskCount: 5 }]) {
    assert.throws(() => normalizeCalculationRequest(settings), /INVALID_/);
  }
  assert.equal(normalizeCalculationRequest({ denominatorMode: "fixed", denominatorMin: 15, denominatorMax: 2 }).settings.denominatorMax, 15);
});
test("equal range endpoints select one common denominator without a fixed-mode control", () => {
  const sheet = generateCalculationWorksheet(normalizeCalculationRequest({ denominatorMin: 7, denominatorMax: 7 }));
  assert.equal(sheet.calculation?.denominatorRelation, "same");
  assert.ok(sheet.tasks.every(task => task.calculation!.left.denominator === 7 && task.calculation!.right.denominator === 7));
});
test("unlike denominators honor both ranges and produce exact, nonnegative answers for all operations", () => {
  for (const [min, max] of [[2, 3], [2, 12], [98, 100]]) {
    for (const operation of [...FRACTION_CALCULATION_OPERATIONS, "mixed"] as const) {
      for (let run = 0; run < 5; run++) {
        const sheet = generateCalculationWorksheet(normalizeCalculationRequest({ denominatorRelation: "different", denominatorMin: min, denominatorMax: max, operation, taskCount: 37, requireReduced: true }));
        assert.equal(sheet.calculation?.denominatorRelation, "different");
        for (const task of sheet.tasks) {
          const { left, right, operation: actualOperation } = task.calculation!;
          assert.notEqual(left.denominator, right.denominator);
          for (const operand of [left, right]) {
            assert.ok(operand.denominator >= min && operand.denominator <= max);
            assert.ok(operand.numerator > 0 && operand.numerator < operand.denominator);
          }
          const a = new Fraction(left.numerator, left.denominator), b = new Fraction(right.numerator, right.denominator);
          const expected = expectedResult(a, b, actualOperation);
          assert.ok(new Fraction(task.answer).equals(expected));
          assert.ok(expected.compare(0) >= 0);
          assert.equal(gradeFractionTask(task, task.answer, true).points, 1);
          assert.equal(task.prompt, `${left.numerator}/${left.denominator} ${FRACTION_CALCULATION_SYMBOLS[actualOperation]} ${right.numerator}/${right.denominator} =`);
        }
        if (operation === "mixed") assertBalancedOperations(sheet.tasks);
      }
    }
  }
});

test("multiplication and division use their own rules even when denominators match", () => {
  for (const operation of ["multiplication", "division"] as const) {
    const sheet = generateCalculationWorksheet(normalizeCalculationRequest({ operation, denominatorMin: 2, denominatorMax: 2, taskCount: 6 }));
    assert.ok(sheet.tasks.every(task => task.calculation!.operation === operation));
    assert.ok(sheet.tasks.every(task => task.answer === (operation === "multiplication" ? "1/4" : "1/1")));
    assert.ok(sheet.tasks.every(task => task.prompt.includes(operation === "multiplication" ? "×" : "÷")));
  }
});

test("division never divides by a zero fraction and mixed worksheets balance all four operations", () => {
  for (const denominatorRelation of ["same", "different"] as const) {
    const sheet = generateCalculationWorksheet(normalizeCalculationRequest({ operation: "mixed", denominatorRelation, taskCount: 100 }));
    assertBalancedOperations(sheet.tasks);
    assert.ok(FRACTION_CALCULATION_OPERATIONS.every(operation => sheet.tasks.filter(task => task.calculation!.operation === operation).length === 25));
    assert.ok(sheet.tasks.filter(task => task.calculation!.operation === "division").every(task => task.calculation!.right.numerator > 0));
  }
});

test("multiplication and division preserve optional simplification and saved half credit", () => {
  for (const operation of ["multiplication", "division"] as const) {
    const sheet = generateCalculationWorksheet(normalizeCalculationRequest({ operation, denominatorRelation: "different", requireReduced: true }));
    const answers = Object.fromEntries(sheet.tasks.map(task => {
      const value = new Fraction(task.answer);
      return [task.id, `${value.n * BigInt(2)}/${value.d * BigInt(2)}`];
    }));
    const auto = readAutoGrade(JSON.parse(JSON.stringify({ auto: gradeFractionWorksheet(sheet, answers) })));
    assert.equal(auto?.partialAuto, 36);
    assert.equal(auto?.percentAuto, 50);
    assert.equal(auto?.wrongAuto, 0);
    assert.equal(gradeFractionWorksheet({ ...sheet, calculation: { ...sheet.calculation!, requireReduced: false } }, answers).percentAuto, 100);
  }
});
test("unlike denominators reject one-value ranges and invalid relation settings", () => {
  assert.throws(() => normalizeCalculationRequest({ denominatorRelation: "different", denominatorMin: 7, denominatorMax: 7 }), /INVALID_DIFFERENT_DENOMINATORS/);
  assert.throws(() => normalizeCalculationRequest({ denominatorRelation: "different", denominatorMode: "fixed", denominatorMin: 7 }), /INVALID_DIFFERENT_DENOMINATORS/);
  assert.throws(() => normalizeCalculationRequest({ denominatorRelation: "unsupported" } as unknown as CalculationRequest), /INVALID_CALCULATION_SETTINGS/);
});
test("unlike-denominator answers and half credit survive the saved teacher assessment", () => {
  const sheet = JSON.parse(JSON.stringify(generateCalculationWorksheet(normalizeCalculationRequest({ denominatorRelation: "different", requireReduced: true })))) as ReturnType<typeof generateCalculationWorksheet>;
  const answers = Object.fromEntries(sheet.tasks.map(task => {
    const value = new Fraction(task.answer);
    return [task.id, `${value.s * value.n * BigInt(2)}/${value.d * BigInt(2)}`];
  }));
  const auto = readAutoGrade(JSON.parse(JSON.stringify({ auto: gradeFractionWorksheet(sheet, answers) })));
  assert.equal(auto?.partialAuto, 36);
  assert.equal(auto?.percentAuto, 50);
  assert.equal(auto?.wrongAuto, 0);
});
test("saved teacher summary uses partial points, not incorrect answers, in its score", () => {
  const sheet = generateCalculationWorksheet(normalizeCalculationRequest({ requireReduced: true }));
  sheet.tasks = Array.from({ length: 4 }, (_, index) => ({ ...task, id: String(index + 1) }));
  const answers = { "1": "1/2", "2": "2/4", "3": "3/4" };
  const auto = readAutoGrade(JSON.parse(JSON.stringify({ auto: gradeFractionWorksheet(sheet, answers) })));
  assert.ok(auto);
  assert.equal(auto.correctAuto, 1);
  assert.equal(auto.partialAuto, 1);
  assert.equal(auto.wrongAuto, 1);
  assert.equal(auto.unansweredAuto, 1);
  assert.equal(auto.percentAuto, 38);
});
