import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { COMPARISON_FORMS, COMPARISON_SIGNS, DEFAULT_COMPARISON_SETTINGS, compareValues, comparisonFraction, formatComparisonValue, generateComparisonWorksheet, getComparisonCopy, gradeComparisonTask, gradeComparisonWorksheet, normalizeComparisonSettings, sanitizeComparisonWorksheet, type ComparisonValue } from "./worksheet";
import { getAssignmentDerivedState } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/assignmentDerivedState";
import { assignmentToLesson, hasSnapshotContent } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/helpers";
import { assignmentSnapshotToLesson, hasAssignmentSnapshotContent, isFractionWorksheet, isMathWorksheet } from "@/lib/submissions/readers";
import { isFractionWorksheet as studentFractionGuard } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/worksheetTypeGuards";
import { POST } from "@/app/api/generate-comparison-worksheet/route";
const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/comparison/ComparisonWorksheetView").default as typeof import("@/components/generators/math/comparison/ComparisonWorksheetView").default;
const Visual = require("../../../components/generators/math/comparison/ComparisonVisual").default as typeof import("@/components/generators/math/comparison/ComparisonVisual").default;
const fraction = (numerator: number, denominator: number): ComparisonValue => ({ form: "fraction", numerator, denominator });
const decimal = (numerator: number): ComparisonValue => ({ form: "decimal", numerator, denominator: 100 });
const percent = (numerator: number): ComparisonValue => ({ form: "percent", numerator, denominator: 100 });

test("exact comparisons handle equivalent forms and common decimal misconceptions", () => {
  assert.equal(compareValues(fraction(1, 2), percent(50)), "=");
  assert.equal(compareValues(decimal(50), fraction(2, 4)), "=");
  assert.equal(compareValues(decimal(25), decimal(50)), "<");
  assert.equal(compareValues(fraction(1, 5), decimal(19)), ">");
  assert.equal(compareValues(decimal(0), percent(0)), "=");
  assert.equal(compareValues(fraction(20, 20), percent(100)), "=");
  assert.equal(formatComparisonValue(decimal(25), "nb"), "0,25");
  assert.equal(formatComparisonValue(decimal(25), "en"), "0.25");
});
for (const mode of ["same", "mixed"] as const) test(`${mode}: balanced relations, forms and exact values in the closed unit interval`, () => {
  for (let run = 0; run < 3; run++) {
    const sheet = generateComparisonWorksheet({ ...DEFAULT_COMPARISON_SETTINGS, mode, taskCount: 36 });
    const signs = Object.fromEntries(COMPARISON_SIGNS.map(sign => [sign, sheet.tasks.filter(task => task.answer === sign).length]));
    assert.deepEqual(signs, { "<": 12, "=": 12, ">": 12 });
    const pairs = new Map<string, number>();
    for (const task of sheet.tasks) {
      assert.equal(task.left.form === task.right.form, mode === "same");
      assert.equal(task.answer, compareValues(task.left, task.right));
      for (const value of [task.left, task.right]) assert.ok(comparisonFraction(value).compare(0) >= 0 && comparisonFraction(value).compare(1) <= 0);
      const key = `${task.left.form}-${task.right.form}`;
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
    assert.equal(pairs.size, mode === "same" ? 3 : 6);
    assert.ok(Math.max(...pairs.values()) - Math.min(...pairs.values()) <= 1);
    assert.deepEqual(sanitizeComparisonWorksheet(sheet), sheet);
    assert.equal(gradeComparisonWorksheet(sheet, Object.fromEntries(sheet.tasks.map(task => [task.id, task.answer]))).percentAuto, 100);
  }
});
test("one or two selected forms and a single denominator keep all relations available", () => {
  for (const forms of [["fraction"], ["decimal"], ["percent"], ["fraction", "percent"], ["decimal", "percent"]] as const) {
    const sheet = generateComparisonWorksheet({ ...DEFAULT_COMPARISON_SETTINGS, forms: [...forms], mode: forms.length === 1 ? "same" : "mixed", denominators: [2], taskCount: 99 });
    for (const sign of COMPARISON_SIGNS) assert.equal(sheet.tasks.filter(task => task.answer === sign).length, 33);
    assert.ok(sheet.tasks.every(task => [task.left, task.right].every(value => forms.includes(value.form as never) && (value.form !== "fraction" || value.denominator === 2))));
  }
});
test("invalid settings cannot create empty, unsupported or unbounded worksheets", () => {
  for (const patch of [{ forms: [] }, { forms: ["integer"] }, { forms: ["fraction"], mode: "mixed" }, { denominators: [] }, { denominators: [3] }, { taskCount: 0 }, { taskCount: 101 }, { taskCount: 1.5 }, { visualSupport: "true" }]) assert.throws(() => normalizeComparisonSettings({ ...DEFAULT_COMPARISON_SETTINGS, ...patch }), /INVALID_/);
  assert.doesNotThrow(() => normalizeComparisonSettings({ ...DEFAULT_COMPARISON_SETTINGS, forms: ["decimal", "percent"], denominators: [] }));
});
test("single-task worksheets can still produce each comparison sign", () => {
  const randoms = [() => 0, () => .9, (() => { let call = 0; return () => call++ === 5 ? .5 : 0; })()];
  const signs = new Set(randoms.map(random => generateComparisonWorksheet({ ...DEFAULT_COMPARISON_SETTINGS, taskCount: 1 }, "nb", false, random).tasks[0].answer));
  assert.equal(signs.size, 3);
});
test("sanitization recomputes answers and rejects damaged tasks", () => {
  const sheet = generateComparisonWorksheet({ ...DEFAULT_COMPARISON_SETTINGS, taskCount: 3 });
  assert.equal(sanitizeComparisonWorksheet({ ...sheet, tasks: sheet.tasks.map(task => ({ ...task, answer: "forged" })) })!.tasks[0].answer, sheet.tasks[0].answer);
  const bad = (patch: Record<string, unknown>) => ({ ...sheet, tasks: [{ ...sheet.tasks[0], ...patch }, ...sheet.tasks.slice(1)] });
  for (const value of [bad({ left: decimal(101) }), bad({ right: fraction(-1, 2) }), bad({ left: fraction(1, 3) }), bad({ left: { ...decimal(25), denominator: 10 } }), bad({ id: sheet.tasks[1].id }), bad({ type: "fraction" }), { ...sheet, tasks: [] }, { ...sheet, kind: "measurement" }]) assert.equal(sanitizeComparisonWorksheet(value), null);
});
test("grading distinguishes blank, invalid and wrong signs without revealing the key early", () => {
  const task = { id: "test", type: "comparison" as const, left: fraction(1, 2), right: percent(50), answer: "=" as const };
  assert.ok(gradeComparisonTask(task, "=").isCorrect);
  for (const answer of ["<", ">", "==", {}, 1]) { assert.ok(gradeComparisonTask(task, answer).isAnswered); assert.equal(gradeComparisonTask(task, answer).isCorrect, false); }
  for (const answer of ["", undefined, null]) assert.equal(gradeComparisonTask(task, answer).isAnswered, false);
  const sheet = generateComparisonWorksheet({ ...DEFAULT_COMPARISON_SETTINGS, taskCount: 3 });
  const answers = { [sheet.tasks[0].id]: sheet.tasks[0].answer, [sheet.tasks[1].id]: "invalid" };
  const grade = gradeComparisonWorksheet(sheet, answers);
  assert.equal(grade.correctAuto, 1); assert.equal(grade.wrongAuto, 1); assert.equal(grade.unansweredAuto, 1); assert.equal(grade.percentAuto, 33);
});
test("comparison snapshots reach student and teacher without being mistaken for geometry or visual fractions", () => {
  const worksheet = generateComparisonWorksheet({ ...DEFAULT_COMPARISON_SETTINGS, taskCount: 6 }, "nb", true);
  const assignment = { mathWorksheet: worksheet, mathType: "comparison", contentType: "comparison_worksheet" };
  assert.ok(hasSnapshotContent(assignment)); assert.ok(hasAssignmentSnapshotContent(assignment));
  const student = getAssignmentDerivedState(assignmentToLesson(assignment), assignment);
  assert.deepEqual(student.comparisonWorksheet, worksheet); assert.ok(student.isComparisonAssignment);
  assert.equal(student.isGeometryAssignment, false); assert.equal(student.isFractionAssignment, false); assert.equal(student.isLengthAssignment, false);
  assert.equal(isMathWorksheet(worksheet), false); assert.equal(isFractionWorksheet(worksheet), false); assert.equal(studentFractionGuard(worksheet), false);
  assert.deepEqual(assignmentSnapshotToLesson(assignment).mathWorksheet, worksheet);
  const interactive = load(renderToStaticMarkup(<View worksheet={worksheet} />));
  assert.equal(interactive("select").length, 6); assert.equal(interactive(".length-key").length, 0); assert.equal(interactive(".length-result").length, 0);
  assert.ok(interactive("select").toArray().every(element => interactive(element).attr("aria-label") && interactive(element).find("option").length === 4));
  const answers = Object.fromEntries(worksheet.tasks.map(task => [task.id, task.answer]));
  const teacher = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} readOnly showAutoCheck />));
  assert.equal(teacher("select").length, 0); assert.equal(teacher(".comparison-readonly").length, 6); assert.equal(teacher(".length-correct").length, 6); assert.equal(teacher(".length-key").length, 0);
});
test("visual supports represent exactly zero, half and the whole, with a fixed number-line scale", () => {
  for (const n of [0, 1, 2]) {
    const $ = load(renderToStaticMarkup(<Visual value={fraction(n, 2)} language="nb" />));
    assert.equal($("rect").length, 2); assert.equal($("rect[fill='#10b981']").length, n);
  }
  const line = load(renderToStaticMarkup(<Visual value={decimal(25)} language="nb" />));
  assert.equal(line("circle").attr("cx"), "35"); assert.equal(line("text").text(), "00,51");
  const zero = load(renderToStaticMarkup(<Visual value={percent(0)} language="nb" />));
  assert.equal(zero("[fill='#10b981']").length, 0);
  const whole = load(renderToStaticMarkup(<Visual value={percent(100)} language="nb" />));
  assert.equal(whole("circle[fill='#10b981']").length, 1);
  assert.equal(load(renderToStaticMarkup(<Visual value={fraction(13, 20)} language="nb" />))("rect[fill='#10b981']").length, 13);
});
test("compact and visual print layouts paginate independently and include an optional separate key", () => {
  for (const visualSupport of [false, true]) {
    const sheet = generateComparisonWorksheet({ ...DEFAULT_COMPARISON_SETTINGS, visualSupport, taskCount: 37 }, "nb", true);
    const $ = load(renderToStaticMarkup(<View worksheet={sheet} printMode />));
    assert.equal($(".length-page").length, visualSupport ? 4 : 2);
    assert.equal($(".comparison-blank").length, 37); assert.equal($("select").length, 0); assert.equal($(".length-key p").length, 37);
    assert.equal($("svg").length, visualSupport ? 74 : 0);
  }
});
test("localized instructions and API validation are consistent", async () => {
  for (const language of ["nb", "en", "pt"]) {
    const response = await POST(new Request("http://localhost/api/generate-comparison-worksheet", { method: "POST", body: JSON.stringify({ settings: { ...DEFAULT_COMPARISON_SETTINGS, taskCount: 3 }, language }) }));
    assert.equal(response.status, 200);
    const sheet = (await response.json()).worksheet;
    assert.equal(sheet.title, getComparisonCopy(language).title); assert.ok(sanitizeComparisonWorksheet(sheet));
  }
  const invalid = await POST(new Request("http://localhost/api/generate-comparison-worksheet", { method: "POST", body: JSON.stringify({ settings: { ...DEFAULT_COMPARISON_SETTINGS, taskCount: 101 } }) }));
  assert.equal(invalid.status, 400);
  assert.equal((await POST(new Request("http://localhost/api/generate-comparison-worksheet", { method: "POST", body: "{" }))).status, 400);
  assert.equal(COMPARISON_FORMS.length, 3);
});
