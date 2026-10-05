import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_EQUATION_SETTINGS as defaults, BASIC_EQUATION_TYPES, EQUATION_TYPES, EQUATION_MODES, equationSolution, equationSteps, formatEquationNumber, generateEquationWorksheet, gradeEquationTask, gradeEquationWorksheet, normalizeEquationSettings, parseEquationNumber, readEquationAnswer, sanitizeEquationWorksheet, equationPrompt, equationTasksPerPage, type EquationTask } from "./worksheet";
import Fraction from "fraction.js";
import { assignmentSnapshotToLesson, hasAssignmentSnapshotContent, isFractionWorksheet } from "../../submissions/readers";
import { getAssignmentDerivedState } from "../../../app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/assignmentDerivedState";
import { isFractionWorksheet as studentFraction } from "../../../app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/worksheetTypeGuards";
import { POST } from "../../../app/api/generate-equation-worksheet/route";
const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/equations/EquationWorksheetView").default as typeof import("../../../components/generators/math/equations/EquationWorksheetView").default;

for (const type of EQUATION_MODES) test(`generation and sanitization: ${type}`, () => {
  const sheet = generateEquationWorksheet({ ...defaults, taskType: type, taskCount: 100 });
  assert.deepEqual(sanitizeEquationWorksheet(sheet), sheet);
  assert.equal(new Set(sheet.tasks.map(t => t.id)).size, 100);
  for (const task of sheet.tasks) {
    const x = equationSolution(task);
    assert.equal(x.d, BigInt(1)); assert.ok(x.compare(1) >= 0 && x.compare(20) <= 0);
    assert.ok(task.right >= 0);
    assert.equal(equationSteps(task).length, ["both_sides", "parentheses", "fraction"].includes(task.type) ? 3 : task.type.startsWith("multiply_") ? 2 : 1);
    assert.equal(gradeEquationTask(task, gradeEquationTask(task, null).correctAnswer).points, 1);
  }
  if (type === "mixed") { const counts = BASIC_EQUATION_TYPES.map(t => sheet.tasks.filter(task => task.type === t).length); assert.ok(Math.max(...counts) - Math.min(...counts) <= 1); assert.ok(sheet.tasks.every(t => t.type !== "both_sides")); }
});
test("validation rejects invalid bounds, count, settings and impossible division", () => {
  for (const change of [{ minimum: 0 }, { maximum: 101 }, { minimum: 30, maximum: 20 }, { taskCount: 0 }, { taskCount: 101 }, { taskCount: 1.5 }, { showSupport: null }, { taskType: "unknown" }, { minimum: 1, maximum: 1, taskType: "divide" }, { minimum: 97, maximum: 97, taskType: "mixed" }]) assert.throws(() => normalizeEquationSettings({ ...defaults, ...change }));
});
test("bounded generation covers extreme and fixed ranges", () => {
  for (const type of EQUATION_TYPES) for (const x of [2, 9, 100]) {
    const sheet = generateEquationWorksheet({ ...defaults, minimum: x, maximum: x, taskType: type, taskCount: 4 }, "pt", true, () => .42);
    assert.ok(sanitizeEquationWorksheet(sheet)); assert.ok(sheet.tasks.every(t => equationSolution(t).equals(x)));
  }
});
const task: EquationTask = { id: "e1", type: "multiply_add", coefficient: 2, constant: 3, right: 11 };
test("all sixteen combinations award independent quarter credit", () => {
  for (let mask = 0; mask < 16; mask++) {
    const answer = { steps: [{ operation: "-", operand: mask & 1 ? "3" : "1", right: mask & 2 ? "8" : "7" }, { operation: "/", operand: mask & 4 ? "2" : "4", right: mask & 8 ? "4" : "5" }] };
    const result = gradeEquationTask(task, answer), points = [1, 2, 4, 8].filter(n => mask & n).length / 4;
    assert.equal(result.points, points); assert.equal(result.isCorrect, points === 1); assert.equal(result.isPartial, points > 0 && points < 1);
  }
});
test("signed equivalent additive operation is accepted", () => {
  const answer = { steps: [{ operation: "+", operand: "-3", right: "8" }, { operation: "/", operand: "2", right: "4" }] };
  assert.equal(gradeEquationTask(task, answer).points, 1);
});
test("multiplication by an exact reciprocal is accepted instead of division", () => {
  const answer = { steps: [{ operation: "-", operand: "3", right: "8" }, { operation: "*", operand: "0,5", right: "4" }] };
  assert.equal(gradeEquationTask(task, answer).points, 1);
});
test("wrong method cannot earn full credit from final answer alone", () => {
  assert.equal(gradeEquationTask(task, { steps: [{ right: "8" }, { right: "4" }] }).points, .5);
  assert.equal(gradeEquationTask(task, { steps: [{ operation: "/", operand: "3", right: "8" }, { operation: "/", operand: "2", right: "4" }] }).points, .75);
});
test("empty, stale, malformed answers never become prefilled or correct", () => {
  for (const value of [null, [], "4", { steps: "bad" }, { steps: [{ operation: "eval", operand: {}, right: [] }] }]) { const r = gradeEquationTask(task, value); assert.equal(r.points, 0); assert.equal(r.isAnswered, false); }
  assert.equal(readEquationAnswer({ steps: [{ operation: "/" }, {}, { right: "4" }] }, task).steps.length, 2);
  assert.equal(gradeEquationTask(task, { steps: [{ operation: "-" }] }).isAnswered, true);
});
test("strict decimal parsing accepts comma, zero and signed numbers, not expressions", () => {
  for (const value of ["0", "-3", "4,5", "4.5", " 3 "]) assert.ok(parseEquationNumber(value));
  for (const value of ["", "3x", "2+2", "1/2", "Infinity", "1e3", "3%", "NaN"]) assert.equal(parseEquationNumber(value), null);
});
test("zero intermediate right side is a legitimate answer", () => {
  const t: EquationTask = { id: "zero", type: "subtract", coefficient: 1, constant: -3, right: 0 };
  assert.equal(gradeEquationTask(t, { steps: [{ operation: "+", operand: "3", right: "3" }] }).points, 1);
});
test("sanitization rejects forged shape, solution, identifiers and types", () => {
  const sheet = generateEquationWorksheet({ ...defaults, taskCount: 2 });
  for (const change of [{ coefficient: 0 }, { coefficient: 2 }, { constant: 0 }, { constant: -2 }, { right: 1000 }, { right: .5 }, { type: "divide" }, { id: "<script>" }]) assert.equal(sanitizeEquationWorksheet({ ...sheet, tasks: [{ ...sheet.tasks[0], ...change }, sheet.tasks[1]] }), null);
  assert.equal(sanitizeEquationWorksheet({ ...sheet, tasks: [sheet.tasks[0], sheet.tasks[0]] }), null);
  assert.equal(sanitizeEquationWorksheet({ ...sheet, version: 2 }), null);
  assert.equal(sanitizeEquationWorksheet({ ...sheet, kind: "percentage" }), null);
  const clean = sanitizeEquationWorksheet({ ...sheet, title: "forged", instructions: "forged" }); assert.equal(clean?.title, sheet.title);
});
test("weighted summary separates partial, wrong and unanswered", () => {
  const sheet = generateEquationWorksheet({ ...defaults, taskCount: 4 });
  const [a, b, c] = sheet.tasks;
  const full = gradeEquationTask(a, null).correctAnswer, half = gradeEquationTask(b, null).correctAnswer;
  half.steps[0].right = "999";
  const grade = gradeEquationWorksheet(sheet, { [a.id]: full, [b.id]: half, [c.id]: { steps: [{ right: "999" }] } });
  assert.equal(grade.correctAuto, 1); assert.equal(grade.partialAuto, 1); assert.equal(grade.wrongAuto, 1); assert.equal(grade.unansweredAuto, 1); assert.equal(grade.percentAuto, 38);
});
test("Spaces snapshots are classified as equations, never visual fractions", () => {
  const mathWorksheet = generateEquationWorksheet(defaults);
  assert.equal(isFractionWorksheet(mathWorksheet), false); assert.equal(studentFraction(mathWorksheet), false);
  const snapshot = { title: mathWorksheet.title, contentType: "equations_worksheet", mathType: "equations", mathWorksheet };
  assert.equal(hasAssignmentSnapshotContent(snapshot), true);
  const lesson = assignmentSnapshotToLesson(snapshot), state = getAssignmentDerivedState({ ...lesson, mathWorksheet }, snapshot);
  assert.deepEqual(state.equationWorksheet, mathWorksheet); assert.equal(state.isEquationAssignment, true); assert.equal(state.isFractionAssignment, false); assert.equal(state.isGeometryAssignment, false);
});
test("paper page chunks, blanks and a separate method key", () => {
  for (const taskType of ["add", "multiply_add", "mixed"] as const) {
    const settings = { ...defaults, taskType, taskCount: equationTasksPerPage({ taskType }) * 2 + 1 }, sheet = generateEquationWorksheet(settings, "nb", true);
    const html = renderToStaticMarkup(<View worksheet={sheet} printMode />);
    assert.equal((html.match(/class="length-page"/g) ?? []).length, 3);
    assert.ok(html.includes("equation-key")); assert.ok(!html.includes("<input")); assert.ok(!html.includes("<select"));
    assert.ok(html.includes("equation-blank"));
  }
});
test("student values stay blank until entered; teacher reads every step", () => {
  const sheet = generateEquationWorksheet({ ...defaults, taskCount: 1, taskType: "multiply_add" });
  const blank = renderToStaticMarkup(<View worksheet={sheet} />);
  assert.equal((blank.match(/value=""/g) ?? []).length, 6); assert.ok(!blank.includes("equation-feedback"));
  const t = sheet.tasks[0], answers = { [t.id]: gradeEquationTask(t, null).correctAnswer };
  const teacher = renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={answers} readOnly showAutoCheck />);
  assert.equal((teacher.match(/readOnly=""/g) ?? []).length, 4); assert.equal((teacher.match(/disabled=""/g) ?? []).length, 2);
  assert.ok(teacher.includes("equation-fraction")); assert.ok(teacher.includes("100%"));
});
test("localized instructions and spoken math are available", () => {
  for (const language of ["nb", "en", "pt"]) {
    const sheet = generateEquationWorksheet(defaults, language);
    assert.equal(sheet.language, language); assert.ok(equationPrompt(sheet.tasks[0], language).length > 10);
  }
});
test("generate API accepts all modes and rejects invalid requests", async () => {
  for (const taskType of EQUATION_MODES) {
    const response = await POST(new Request("http://localhost/api/generate-equation-worksheet", { method: "POST", body: JSON.stringify({ settings: { ...defaults, taskType }, language: "pt" }) }));
    assert.equal(response.status, 200); assert.ok(sanitizeEquationWorksheet((await response.json()).worksheet));
  }
  for (const body of ["null", "[]", "{bad", JSON.stringify({ settings: { ...defaults, maximum: 0 } })]) {
    const response = await POST(new Request("http://localhost/api/generate-equation-worksheet", { method: "POST", body })); assert.equal(response.status, 400);
  }
});

function seededRandom(seed = 123) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
for (const allowNegative of [false, true]) for (const allowDecimals of [false, true]) for (const taskType of EQUATION_MODES) {
  test(`${taskType}: negative=${allowNegative}, decimal=${allowDecimals} stays exact`, () => {
    const settings = { ...defaults, minimum: allowNegative ? -20 : 1, taskCount: 60, taskType, allowNegative, allowDecimals };
    const sheet = generateEquationWorksheet(settings, "nb", true, seededRandom());
    assert.deepEqual(sanitizeEquationWorksheet(sheet), sheet);
    const scale = allowDecimals ? 10 : 1;
    for (const t of sheet.tasks) {
      const solution = equationSolution(t);
      assert.equal(solution.mul(scale).d, BigInt(1));
      assert.ok(solution.compare(settings.minimum) >= 0 && solution.compare(settings.maximum) <= 0);
      assert.equal(new Fraction(t.right).mul(scale).d, BigInt(1));
      assert.equal(new Fraction(t.constant).mul(scale).d, BigInt(1));
      if (!allowNegative) assert.ok(t.right >= 0);
      const answer = gradeEquationTask(t, null).correctAnswer;
      answer.steps.forEach(s => { s.operand = s.operand.replace(".", ","); s.right = s.right.replace(".", ","); });
      assert.equal(gradeEquationTask(t, answer).points, 1);
    }
    if (allowNegative) assert.ok(sheet.tasks.some(t => equationSolution(t).compare(0) < 0));
    if (allowDecimals) assert.ok(sheet.tasks.some(t => equationSolution(t).d !== BigInt(1)));
  });
}
test("negative-only, decimal-only and zero solution ranges are valid", () => {
  for (const taskType of EQUATION_MODES) for (const [minimum, maximum] of [[-100, -100], [-2.1, -1.1], [.2, .2], [0, 0]]) {
    const sheet = generateEquationWorksheet({ ...defaults, minimum, maximum, taskType, allowNegative: true, allowDecimals: true, taskCount: 2 });
    assert.ok(sanitizeEquationWorksheet(sheet));
  }
});
test("negative and decimal settings are strict and cannot silently change old worksheets", () => {
  for (const patch of [{ allowNegative: "yes" }, { allowDecimals: 1 }, { minimum: -1 }, { minimum: .1 }, { allowDecimals: true, minimum: .01 }, { allowNegative: true, minimum: -101 }, { allowNegative: true, maximum: Infinity }, { allowDecimals: true, minimum: .1, maximum: .1, taskType: "divide" }]) assert.throws(() => normalizeEquationSettings({ ...defaults, ...patch }));
  const sheet = generateEquationWorksheet(defaults);
  const legacySettings = { ...sheet.settings };
  delete legacySettings.allowNegative; delete legacySettings.allowDecimals;
  assert.deepEqual(sanitizeEquationWorksheet({ ...sheet, settings: legacySettings }), sheet);
  const forged = { ...sheet, settings: { ...sheet.settings, allowDecimals: false }, tasks: [{ ...sheet.tasks[0], right: .5 }, ...sheet.tasks.slice(1)] };
  assert.equal(sanitizeEquationWorksheet(forged), null);
});
test("fraction arithmetic avoids decimal residue in intermediate steps", () => {
  const t: EquationTask = { id: "decimal", type: "multiply_add", coefficient: 3, constant: .1, right: .4 };
  assert.equal(equationSteps(t)[0].right, .3);
  assert.equal(gradeEquationTask(t, { steps: [{ operation: "-", operand: "0,1", right: "0,3" }, { operation: "/", operand: "3", right: "0.1" }] }).points, 1);
  const negative: EquationTask = { ...t, constant: .2, right: -.1 };
  assert.equal(gradeEquationTask(negative, { steps: [{ operation: "-", operand: "0.2", right: "-0,3" }, { operation: "/", operand: "3", right: "-0.1" }] }).points, 1);
});
test("decimal values are localized in worksheet, feedback, key and spoken task", () => {
  assert.equal(formatEquationNumber(-2.3, "nb"), "-2,3"); assert.equal(formatEquationNumber(-2.3, "pt"), "-2,3"); assert.equal(formatEquationNumber(-2.3, "en"), "-2.3");
  for (const language of ["nb", "en", "pt"]) {
    const sheet = generateEquationWorksheet({ ...defaults, minimum: -1.1, maximum: -1.1, taskCount: 1, allowNegative: true, allowDecimals: true, taskType: "multiply_add" }, language, true, seededRandom());
    const paper = renderToStaticMarkup(<View worksheet={sheet} printMode />);
    assert.ok(paper.includes(language === "en" ? "-1.1" : "-1,1"));
    assert.ok(!paper.includes("000000000000"));
    assert.ok(equationPrompt(sheet.tasks[0], language).includes(formatEquationNumber(sheet.tasks[0].right, language)));
  }
});
test("negative decimal worksheet survives Spaces transport and generation API", async () => {
  const settings = { ...defaults, minimum: -10.5, maximum: 9.5, allowNegative: true, allowDecimals: true, taskType: "mixed" as const };
  const response = await POST(new Request("http://localhost/api/generate-equation-worksheet", { method: "POST", body: JSON.stringify({ settings }) }));
  assert.equal(response.status, 200);
  const sheet = sanitizeEquationWorksheet((await response.json()).worksheet)!;
  assert.ok(sheet);
  const snapshot = { title: sheet.title, contentType: "equations_worksheet", mathType: "equations", mathWorksheet: sheet };
  const state = getAssignmentDerivedState(snapshot, snapshot);
  assert.deepEqual(state.equationWorksheet, sheet);
  const answers = Object.fromEntries(sheet.tasks.map(t => [t.id, gradeEquationTask(t, null).correctAnswer]));
  assert.equal(gradeEquationWorksheet(sheet, JSON.parse(JSON.stringify(answers))).percentAuto, 100);
});
test("negative-answer fields do not request a mobile keypad without a minus key", () => {
  const sheet = generateEquationWorksheet({ ...defaults, allowNegative: true, minimum: -10 });
  const html = renderToStaticMarkup(<View worksheet={sheet} />);
  assert.ok(html.includes('inputMode="text"')); assert.ok(!html.includes('inputMode="decimal"'));
  const basic = renderToStaticMarkup(<View worksheet={generateEquationWorksheet(defaults)} />);
  assert.ok(basic.includes('inputMode="decimal"'));
});

const both: EquationTask = { id: "both", type: "both_sides", coefficient: 3, rightCoefficient: 1, constant: 4, right: 12 };
const parentheses: EquationTask = { id: "parentheses", type: "parentheses", coefficient: 3, constant: -4, right: 9 };
const fractionTask: EquationTask = { id: "fraction", type: "fraction", coefficient: 3, constant: 4, denominator: 2, right: 8 };
test("fraction equations clear the entire numerator before removing the constant", () => {
  assert.equal(equationSolution(fractionTask).valueOf(), 4);
  assert.deepEqual(equationSteps(fractionTask), [
    { operation: "*", operand: 2, coefficient: 3, constant: 4, right: 16, clearDenominator: true },
    { operation: "-", operand: 4, coefficient: 3, right: 12 },
    { operation: "/", operand: 3, coefficient: 1, right: 4 },
  ]);
  const correct = gradeEquationTask(fractionTask, null).correctAnswer;
  assert.equal(gradeEquationTask(fractionTask, correct).points, 1);
  correct.steps[0].operation = "/"; correct.steps[0].operand = "0,5";
  assert.equal(gradeEquationTask(fractionTask, correct).points, 1);
  correct.steps[0].operand = "2";
  assert.equal(gradeEquationTask(fractionTask, correct).points, 5 / 6);
});
test("all sixty-four fraction-equation method and calculation combinations award independent credit", () => {
  for (let mask = 0; mask < 64; mask++) {
    const firstRight = mask & 2 ? 16 : 19, secondRight = firstRight - 4 + (mask & 8 ? 0 : 3), thirdRight = secondRight / 3 + (mask & 32 ? 0 : 1);
    const value = { steps: [
      { operation: "*", operand: mask & 1 ? "2" : "3", right: String(firstRight) },
      { operation: "-", operand: mask & 4 ? "4" : "5", right: String(secondRight) },
      { operation: "/", operand: mask & 16 ? "3" : "2", right: String(thirdRight) },
    ] };
    assert.equal(gradeEquationTask(fractionTask, value).points, [1, 2, 4, 8, 16, 32].filter(n => mask & n).length / 6);
  }
});
test("fraction equations keep the original error and reward correct continuation", () => {
  const value = { steps: [
    { operation: "*", operand: "2", right: "19" },
    { operation: "-", operand: "4", right: "15" },
    { operation: "/", operand: "3", right: "5" },
  ] };
  const result = gradeEquationTask(fractionTask, value);
  assert.equal(result.points, 5 / 6); assert.equal(result.steps[0].answerCorrect, false);
  assert.equal(result.steps[1].followThroughCorrect, true); assert.equal(result.steps[2].followThroughCorrect, true);
  value.steps[0].right = "bad";
  assert.equal(gradeEquationTask(fractionTask, value).steps[1].answerCorrect, false);
  assert.equal(gradeEquationTask(fractionTask, null).isAnswered, false);
  assert.equal(gradeEquationTask(fractionTask, { steps: [{ right: "16" }, { right: "12" }, { right: "4" }] }).points, .5);
});
test("fraction equation generation preserves number-grid precision and all denominators", () => {
  for (const allowNegative of [false, true]) for (const allowDecimals of [false, true]) {
    const sheet = generateEquationWorksheet({ ...defaults, taskType: "fraction", taskCount: 100, minimum: allowNegative ? -100 : allowDecimals ? .1 : 1, maximum: 100, allowNegative, allowDecimals }, "nb", false, seededRandom());
    assert.deepEqual(sanitizeEquationWorksheet(sheet), sheet);
    assert.equal(new Set(sheet.tasks.map(t => t.denominator)).size, 8);
    for (const t of sheet.tasks) {
      const scale = allowDecimals ? 10 : 1;
      assert.equal(new Fraction(t.right).mul(scale).d, BigInt(1));
      const numerator = equationSolution(t).mul(t.coefficient).add(t.constant);
      assert.ok(numerator.equals(new Fraction(t.right).mul(t.denominator!)));
    }
  }
});
test("fraction equations reject malformed denominators and do not change old or mixed worksheets", () => {
  const sheet = generateEquationWorksheet({ ...defaults, taskType: "fraction", taskCount: 1 });
  for (const patch of [{ denominator: undefined }, { denominator: 0 }, { denominator: 1 }, { denominator: 10 }, { denominator: 2.5 }, { denominator: "2" }, { coefficient: 1 }, { constant: 0 }, { rightCoefficient: 1 }, { right: 461 }]) assert.equal(sanitizeEquationWorksheet({ ...sheet, tasks: [{ ...sheet.tasks[0], ...patch }] }), null);
  assert.equal(sanitizeEquationWorksheet({ ...sheet, settings: { ...sheet.settings, taskType: "mixed" } }), null);
  for (const taskType of ["add", "both_sides", "parentheses"] as const) {
    const old = generateEquationWorksheet({ ...defaults, taskType, taskCount: 1 });
    assert.equal(sanitizeEquationWorksheet({ ...old, tasks: [{ ...old.tasks[0], denominator: 2 }] }), null);
    assert.deepEqual(sanitizeEquationWorksheet(old), old);
  }
  const raw = gradeEquationTask(fractionTask, null).correctAnswer;
  const injected = JSON.parse(JSON.stringify(raw)); injected.steps[0].coefficient = "0"; injected.steps[0].constant = "999"; injected.steps[0].operandType = "x";
  assert.deepEqual(readEquationAnswer(injected, fractionTask), raw);
});
test("fraction equations render horizontal fraction bars, all steps and fixed numerator terms", () => {
  const sheet = generateEquationWorksheet({ ...defaults, taskType: "fraction", taskCount: 1 }, "nb", true); sheet.tasks = [fractionTask];
  const empty = renderToStaticMarkup(<View worksheet={sheet} />);
  assert.equal((empty.match(/<input/g) ?? []).length, 6); assert.equal((empty.match(/<select/g) ?? []).length, 3);
  assert.ok(empty.includes("Fjern nevneren")); assert.ok(empty.includes("3x + 4"));
  assert.ok(empty.includes("equation-fraction")); assert.ok(!empty.includes("value=\"16\""));
  const answers = { fraction: gradeEquationTask(fractionTask, null).correctAnswer };
  const teacher = renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={answers} readOnly showAutoCheck />);
  assert.equal((teacher.match(/readOnly=""/g) ?? []).length, 6); assert.equal((teacher.match(/disabled=""/g) ?? []).length, 3);
  assert.ok(teacher.includes("100%")); assert.equal((teacher.match(/class="equation-fraction"/g) ?? []).length, 4);
  const paper = renderToStaticMarkup(<View worksheet={sheet} printMode />);
  assert.ok(!paper.includes("<input")); assert.ok(paper.includes("equation-key")); assert.ok(paper.includes("3x + 4"));
  assert.equal(equationTasksPerPage(sheet.settings), 4);
});
test("fraction equations support audio grouping and survive Spaces answer transport", () => {
  for (const lang of ["nb", "en", "pt"]) {
    const sheet = generateEquationWorksheet({ ...defaults, taskType: "fraction", taskCount: 9, minimum: -10, allowNegative: true, allowDecimals: true }, lang);
    const prompt = equationPrompt(sheet.tasks[0], lang);
    assert.ok(prompt.includes(lang === "nb" ? "parentes slutt delt på" : lang === "en" ? "close parenthesis divided by" : "fecha parênteses dividido por"));
    assert.equal((renderToStaticMarkup(<View worksheet={sheet} printMode />).match(/class="length-page"/g) ?? []).length, 3);
    const snapshot = { mathWorksheet: sheet, contentType: "equations_worksheet", mathType: "equations" };
    assert.deepEqual(getAssignmentDerivedState(snapshot, snapshot).equationWorksheet, sheet);
    const answers = Object.fromEntries(sheet.tasks.map(t => [t.id, gradeEquationTask(t, null).correctAnswer]));
    assert.equal(gradeEquationWorksheet(sheet, JSON.parse(JSON.stringify(answers))).percentAuto, 100);
  }
});
test("parentheses distribute to both terms before solving in three steps", () => {
  assert.equal(equationSolution(parentheses).valueOf(), 7);
  assert.deepEqual(equationSteps(parentheses), [
    { operation: "*", operand: 3, coefficient: 3, constant: -12, right: 9, expand: true },
    { operation: "+", operand: 12, coefficient: 3, right: 21 },
    { operation: "/", operand: 3, coefficient: 1, right: 7 },
  ]);
  const correct = gradeEquationTask(parentheses, null).correctAnswer;
  assert.equal(correct.steps[0].coefficient, "3"); assert.equal(correct.steps[0].constant, "-12");
  assert.equal(gradeEquationTask(parentheses, correct).points, 1);
  assert.equal(gradeEquationTask(parentheses, null).isAnswered, false);
  correct.steps[0].operation = "/"; correct.steps[0].operand = "0.333333";
  assert.equal(gradeEquationTask(parentheses, correct).steps[0].setupCorrect, false);
});
test("all sixty-four parentheses method and calculation combinations award independent credit", () => {
  for (let mask = 0; mask < 64; mask++) {
    const firstRight = mask & 2 ? 9 : 12, secondRight = firstRight + 12 + (mask & 8 ? 0 : 3), thirdRight = secondRight / 3 + (mask & 32 ? 0 : 1);
    const value = { steps: [
      { operation: "*", operand: mask & 1 ? "3" : "2", coefficient: "3", constant: "-12", right: String(firstRight) },
      { operation: "+", operand: mask & 4 ? "12" : "11", right: String(secondRight) },
      { operation: "/", operand: mask & 16 ? "3" : "2", right: String(thirdRight) },
    ] };
    assert.equal(gradeEquationTask(parentheses, value).points, [1, 2, 4, 8, 16, 32].filter(n => mask & n).length / 6);
  }
});
test("forgetting to multiply the constant cannot earn full credit, but continuation can", () => {
  const value = { steps: [
    { operation: "*", operand: "3", coefficient: "3", constant: "-3", right: "9" },
    { operation: "+", operand: "3", right: "12" },
    { operation: "/", operand: "3", right: "4" },
  ] };
  const result = gradeEquationTask(parentheses, value);
  assert.equal(result.steps[0].constantCorrect, false); assert.equal(result.steps[1].setupCorrect, true);
  assert.equal(result.steps[1].followThroughCorrect, true); assert.equal(result.steps[2].followThroughCorrect, true);
  assert.equal(result.points, 5 / 6); assert.equal(result.isCorrect, false);
  value.steps[0].constant = "bad";
  assert.equal(gradeEquationTask(parentheses, value).steps[1].setupCorrect, false);
  assert.equal(gradeEquationTask(parentheses, value).steps[2].answerCorrect, false);
});
test("parentheses preserve signs, exact decimals, and reject invalid shape", () => {
  const t = { ...parentheses, constant: .1, right: .6 };
  assert.equal(equationSolution(t).valueOf(), .1); assert.equal(equationSteps(t)[0].constant, .3);
  const sheet = generateEquationWorksheet({ ...defaults, taskType: "parentheses", taskCount: 1 });
  for (const patch of [{ coefficient: 1 }, { coefficient: 10 }, { constant: 0 }, { constant: 21 }, { rightCoefficient: 1 }, { right: 1081 }]) assert.equal(sanitizeEquationWorksheet({ ...sheet, tasks: [{ ...sheet.tasks[0], ...patch }] }), null);
  assert.equal(sanitizeEquationWorksheet({ ...sheet, settings: { ...sheet.settings, taskType: "mixed" } }), null);
  for (const constant of [-20, 20]) {
    const extreme = generateEquationWorksheet({ ...defaults, taskType: "parentheses", minimum: -100, maximum: -100, allowNegative: true, taskCount: 1 });
    extreme.tasks = [{ ...parentheses, coefficient: 9, constant, right: 9 * (-100 + constant) }];
    assert.ok(sanitizeEquationWorksheet(extreme));
  }
});
test("parentheses answers retain the signed constant only on the expansion line", () => {
  const value = gradeEquationTask(parentheses, null).correctAnswer;
  const raw = JSON.parse(JSON.stringify(value)); raw.steps[1].constant = "999"; raw.steps[1].coefficient = "999";
  assert.deepEqual(readEquationAnswer(raw, parentheses), value);
  assert.equal(gradeEquationTask(parentheses, { steps: [{ constant: "-12" }] }).isAnswered, true);
});
test("parentheses student and paper views leave all expansion fields blank and show all steps", () => {
  const sheet = generateEquationWorksheet({ ...defaults, taskType: "parentheses", taskCount: 1 }, "nb", true); sheet.tasks = [parentheses];
  const empty = renderToStaticMarkup(<View worksheet={sheet} />);
  assert.equal((empty.match(/<input/g) ?? []).length, 8); assert.equal((empty.match(/<select/g) ?? []).length, 3);
  assert.ok(empty.includes("3(x - 4)")); assert.ok(empty.includes("Gang inn i parentesen"));
  assert.ok(empty.includes("Konstantledd med fortegn")); assert.ok(!empty.includes("value=\"-12\""));
  const answer = gradeEquationTask(parentheses, null).correctAnswer;
  const teacher = renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={{ parentheses: answer }} readOnly showAutoCheck />);
  assert.equal((teacher.match(/readOnly=""/g) ?? []).length, 8); assert.ok(teacher.includes("100%"));
  assert.ok(teacher.includes("3x")); assert.ok(teacher.includes("− 12"));
  const paper = renderToStaticMarkup(<View worksheet={sheet} printMode />);
  assert.ok(!paper.includes("<input")); assert.ok(paper.includes("equation-distribution")); assert.ok(paper.includes("equation-key"));
  assert.equal(equationTasksPerPage(sheet.settings), 4);
});
test("parentheses support spoken math and survive Spaces answer transport", () => {
  for (const lang of ["nb", "en", "pt"]) {
    const sheet = generateEquationWorksheet({ ...defaults, taskType: "parentheses", taskCount: 9, minimum: -10, allowNegative: true, allowDecimals: true }, lang);
    assert.ok(equationPrompt(sheet.tasks[0], lang).includes(lang === "nb" ? "parentes slutt" : lang === "en" ? "close parenthesis" : "fecha parênteses"));
    assert.equal((renderToStaticMarkup(<View worksheet={sheet} printMode />).match(/class="length-page"/g) ?? []).length, 3);
    const snapshot = { mathWorksheet: sheet, contentType: "equations_worksheet", mathType: "equations" };
    assert.deepEqual(getAssignmentDerivedState(snapshot, snapshot).equationWorksheet, sheet);
    const answers = Object.fromEntries(sheet.tasks.map(t => [t.id, gradeEquationTask(t, null).correctAnswer]));
    assert.equal(gradeEquationWorksheet(sheet, JSON.parse(JSON.stringify(answers))).percentAuto, 100);
  }
});
test("x on both sides has three explicit steps and an x-term operation", () => {
  assert.equal(equationSolution(both).valueOf(), 4);
  assert.deepEqual(equationSteps(both), [
    { operation: "-", operand: 1, coefficient: 2, constant: 4, right: 12, collectX: true },
    { operation: "-", operand: 4, coefficient: 2, right: 8 },
    { operation: "/", operand: 2, coefficient: 1, right: 4 },
  ]);
  const expected = gradeEquationTask(both, null).correctAnswer;
  assert.equal(expected.steps[0].operandType, "x"); assert.equal(expected.steps[0].coefficient, "2");
  assert.equal(gradeEquationTask(both, expected).points, 1);
  assert.equal(gradeEquationTask(both, null).isAnswered, false);
});
test("a number cannot cancel an x term; signed equivalent x terms are accepted", () => {
  const answer = gradeEquationTask(both, null).correctAnswer;
  answer.steps[0].operandType = "number";
  assert.equal(gradeEquationTask(both, answer).steps[0].setupCorrect, false);
  assert.equal(gradeEquationTask(both, answer).points, 5 / 6);
  answer.steps[0].operandType = "x"; answer.steps[0].operation = "+"; answer.steps[0].operand = "-1";
  assert.equal(gradeEquationTask(both, answer).points, 1);
});
test("all sixty-four method and calculation combinations have independent credit", () => {
  for (let mask = 0; mask < 64; mask++) {
    const firstRight = mask & 2 ? 12 : 13, secondRight = firstRight - 4 + (mask & 8 ? 0 : 1), thirdRight = secondRight / 2 + (mask & 32 ? 0 : 1);
    const value = { steps: [
      { operation: "-", operandType: "x", operand: mask & 1 ? "1" : "2", coefficient: "2", right: String(firstRight) },
      { operation: "-", operand: mask & 4 ? "4" : "5", right: String(secondRight) },
      { operation: "/", operand: mask & 16 ? "2" : "3", right: String(thirdRight) },
    ] };
    const points = [1, 2, 4, 8, 16, 32].filter(n => mask & n).length / 6, result = gradeEquationTask(both, value);
    assert.equal(result.points, points); assert.equal(result.isCorrect, mask === 63);
  }
});
test("a coefficient error remains visible but correct continuation earns credit", () => {
  const value = { steps: [
    { operation: "-", operandType: "x", operand: "1", coefficient: "4", right: "12" },
    { operation: "-", operand: "4", right: "8" },
    { operation: "/", operand: "4", right: "2" },
  ] };
  const result = gradeEquationTask(both, value);
  assert.equal(result.steps[0].coefficientCorrect, false); assert.equal(result.steps[2].setupCorrect, true);
  assert.equal(result.steps[2].followThroughCorrect, true); assert.equal(result.isPartial, true); assert.equal(result.isCorrect, false); assert.equal(result.points, 5 / 6);
});
test("zero and malformed written coefficients never authorize division", () => {
  for (const coefficient of ["0", "bad"]) {
    const value = gradeEquationTask(both, null).correctAnswer; value.steps[0].coefficient = coefficient;
    const result = gradeEquationTask(both, value);
    assert.equal(result.steps[2].setupCorrect, false); assert.equal(result.steps[2].answerCorrect, false); assert.equal(result.isCorrect, false);
  }
});
test("both-sides tasks reject missing, equal and excessive coefficients and cannot enter basic mixed", () => {
  const sheet = generateEquationWorksheet({ ...defaults, taskType: "both_sides", taskCount: 1 });
  for (const patch of [{ rightCoefficient: undefined }, { rightCoefficient: 0 }, { rightCoefficient: .5 }, { rightCoefficient: 9 }, { rightCoefficient: sheet.tasks[0].coefficient }, { coefficient: 10 }, { constant: 0 }]) assert.equal(sanitizeEquationWorksheet({ ...sheet, tasks: [{ ...sheet.tasks[0], ...patch }] }), null);
  assert.equal(sanitizeEquationWorksheet({ ...sheet, settings: { ...sheet.settings, taskType: "mixed" } }), null);
  const old = generateEquationWorksheet({ ...defaults, taskCount: 1 });
  assert.equal(sanitizeEquationWorksheet({ ...old, tasks: [{ ...old.tasks[0], rightCoefficient: 1 }] }), null);
});
test("both-sides view exposes only the new coefficient slot and carries the student's line", () => {
  const sheet = generateEquationWorksheet({ ...defaults, taskType: "both_sides", taskCount: 1 });
  sheet.tasks = [both];
  const empty = renderToStaticMarkup(<View worksheet={sheet} />);
  assert.equal((empty.match(/<input/g) ?? []).length, 7); assert.equal((empty.match(/<select/g) ?? []).length, 4);
  assert.ok(empty.includes("x + 12")); assert.ok(empty.includes("Samle x-leddene"));
  const value = gradeEquationTask(both, null).correctAnswer; value.steps[0].coefficient = "4"; value.steps[2].operand = "4"; value.steps[2].right = "2";
  const teacher = renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={{ both: value }} readOnly showAutoCheck />);
  assert.ok(teacher.includes("Riktig videreføring")); assert.ok(teacher.includes("4"));
  assert.equal((teacher.match(/readOnly=""/g) ?? []).length, 7);
  const paper = renderToStaticMarkup(<View worksheet={sheet} printMode />); assert.ok(!paper.includes("<input")); assert.ok(paper.includes("equation-coefficient-slot"));
});
test("both-sides worksheets use four tasks per sheet and preserve saved answers through Spaces", () => {
  const sheet = generateEquationWorksheet({ ...defaults, taskType: "both_sides", taskCount: 9, minimum: -10.5, allowDecimals: true, allowNegative: true });
  assert.equal(equationTasksPerPage(sheet.settings), 4);
  const paper = renderToStaticMarkup(<View worksheet={sheet} printMode />);
  assert.equal((paper.match(/class="length-page"/g) ?? []).length, 3);
  const snapshot = { mathWorksheet: sheet, contentType: "equations_worksheet", mathType: "equations" };
  assert.equal(getAssignmentDerivedState(snapshot, snapshot).equationWorksheet?.tasks[0].type, "both_sides");
  const answers = Object.fromEntries(sheet.tasks.map(t => [t.id, gradeEquationTask(t, null).correctAnswer]));
  assert.equal(gradeEquationWorksheet(sheet, JSON.parse(JSON.stringify(answers))).percentAuto, 100);
  for (const lang of ["nb", "en", "pt"]) assert.ok(equationPrompt(both, lang).includes(lang === "en" ? "equals x plus 12" : lang === "pt" ? "igual a x mais 12" : "lik x pluss 12"));
});
