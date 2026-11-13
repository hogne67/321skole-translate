import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import Fraction from "fraction.js";
import { DEFAULT_NUMBER_LINE_SETTINGS as defaults, NUMBER_LINE_FORMS, NUMBER_LINE_MODES, NUMBER_LINE_STEPS, NUMBER_LINE_TASKS_PER_PAGE, formatNumberLineValue, generateNumberLineWorksheet, getNumberLineCopy, gradeNumberLineTask, gradeNumberLineWorksheet, normalizeNumberLineSettings, numberLinePrompt, numberLineValue, parseNumberLineAnswer, sanitizeNumberLineWorksheet, type NumberLineTask } from "./worksheet";
import { POST } from "@/app/api/generate-number-line-worksheet/route";
import { getAssignmentDerivedState } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/assignmentDerivedState";
import { assignmentToLesson, hasSnapshotContent } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/helpers";
import { assignmentSnapshotToLesson, hasAssignmentSnapshotContent, isFractionWorksheet, isMathWorksheet, readAutoGrade } from "@/lib/submissions/readers";
import { isFractionWorksheet as studentFractionGuard } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/worksheetTypeGuards";
import { mathEditorHref } from "../editor";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/number-line/NumberLineWorksheetView").default as typeof import("@/components/generators/math/number-line/NumberLineWorksheetView").default;
const Diagram = require("../../../components/generators/math/number-line/NumberLineDiagram").default as typeof import("@/components/generators/math/number-line/NumberLineDiagram").default;

for (const form of NUMBER_LINE_FORMS) test(`${form}: every step and task type has exact, bounded and restorable tasks`, () => {
  for (const step of NUMBER_LINE_STEPS[form]) for (const taskType of NUMBER_LINE_MODES) {
    const sheet = generateNumberLineWorksheet({ ...defaults, form, step, taskType, minimum: -1000, maximum: 1000, taskCount: 17 }, "nb", true);
    assert.deepEqual(sanitizeNumberLineWorksheet(JSON.parse(JSON.stringify(sheet))), sheet);
    assert.equal(new Set(sheet.tasks.map(task => task.id)).size, 17);
    for (const task of sheet.tasks) {
      assert.ok(new Fraction(task.start).compare(-1000) >= 0);
      assert.ok(numberLineValue(task, task.intervals).compare(1000) <= 0);
      assert.ok(task.targetIndex > 0 && task.targetIndex < task.intervals);
      assert.equal(gradeNumberLineTask(task, numberLineValue(task).toFraction()).isCorrect, true);
      if (taskType !== "mixed") assert.equal(task.type, taskType);
    }
    if (taskType === "mixed") {
      const counts = ["read", "missing", "place"].map(type => sheet.tasks.filter(task => task.type === type).length);
      assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
    }
  }
});

test("negative, crossing-zero and fixed ranges keep all ticks inside the teacher's bounds", () => {
  for (const bounds of [{ minimum: -20, maximum: -10 }, { minimum: -5, maximum: 5 }, { minimum: 0, maximum: 10 }]) {
    const sheet = generateNumberLineWorksheet({ ...defaults, ...bounds, taskCount: 60 });
    assert.equal(sheet.tasks.length, 60);
    assert.ok(sheet.tasks.every(task => task.start === String(bounds.minimum)));
  }
  const decimal = generateNumberLineWorksheet({ ...defaults, form: "decimals", minimum: .15, maximum: .95, step: "0.1", intervals: 4 });
  for (const task of decimal.tasks) {
    assert.ok(new Fraction(task.start).compare(.15) >= 0);
    assert.ok(numberLineValue(task, 4).compare(.95) <= 0);
  }
});

test("invalid or impossible settings are rejected before generation", () => {
  for (const patch of [{ taskType: "unknown" }, { form: "percent" }, { step: "0" }, { step: "1/0" }, { minimum: -1001 }, { maximum: 1001 }, { minimum: NaN }, { maximum: Infinity }, { minimum: 20 }, { minimum: .5 }, { intervals: 3 }, { intervals: 11 }, { intervals: 4.5 }, { taskCount: 0 }, { taskCount: 61 }, { showSupport: "true" }]) {
    assert.throws(() => normalizeNumberLineSettings({ ...defaults, ...patch }), /INVALID_/);
  }
  assert.throws(() => generateNumberLineWorksheet({ ...defaults, minimum: 0, maximum: 5 }), /INVALID_COMBINATIONS/);
});

test("bounded retries tolerate repeated tasks and deterministic random functions", () => {
  const sheet = generateNumberLineWorksheet({ ...defaults, minimum: 0, maximum: 10, taskCount: 60 }, "en", false, () => 0);
  assert.equal(sheet.tasks.length, 60);
  assert.ok(sheet.tasks.every(task => task.start === "0" && task.targetIndex === 1));
});

const half: NumberLineTask = { id: "half", type: "read", start: "-1", step: "1/4", intervals: 8, targetIndex: 6 };
test("grading accepts equivalent fractions and decimal separators, while preserving zero and negative signs", () => {
  for (const value of ["1/2", "2/4", "0.5", "0,50", ".5", " 1 / 2 "]) assert.equal(gradeNumberLineTask(half, value).isCorrect, true);
  for (const value of ["1/0", "0.5abc", "1+1", "2*0.25", "0,5,0", "Infinity", {}, [], 0.5]) assert.equal(gradeNumberLineTask(half, value).isCorrect, false);
  assert.equal(gradeNumberLineTask({ ...half, targetIndex: 4 }, "0").isCorrect, true);
  assert.equal(gradeNumberLineTask({ ...half, targetIndex: 2 }, "−0,5").isCorrect, true);
  for (const value of [undefined, null, "", "  "]) assert.equal(gradeNumberLineTask(half, value).isAnswered, false);
  assert.equal(gradeNumberLineTask(half, "bad").isAnswered, true);
  assert.equal(gradeNumberLineTask(half, { toString: null }).isAnswered, true);
  assert.equal(gradeNumberLineTask(half, { toString: null }).isCorrect, false);
  assert.equal(parseNumberLineAnswer("1e9"), null);
});

test("sanitization ignores forged answer keys and rejects damaged axis data, IDs and task types", () => {
  const sheet = generateNumberLineWorksheet({ ...defaults, taskType: "read" });
  assert.deepEqual(sanitizeNumberLineWorksheet({ ...sheet, answer: "forged", tasks: sheet.tasks.map(task => ({ ...task, answer: "forged" })) }), sheet);
  for (const patch of [{ id: "bad/id" }, { id: sheet.tasks[1].id }, { start: "999" }, { start: "0.5" }, { step: "2" }, { intervals: 9 }, { targetIndex: 0 }, { targetIndex: 10 }, { targetIndex: 2.5 }, { type: "place" }]) {
    assert.equal(sanitizeNumberLineWorksheet({ ...sheet, tasks: [{ ...sheet.tasks[0], ...patch }, ...sheet.tasks.slice(1)] }), null);
  }
  assert.equal(sanitizeNumberLineWorksheet({ ...sheet, tasks: [] }), null);
  assert.equal(sanitizeNumberLineWorksheet({ ...sheet, version: 2 }), null);
});

test("Spaces snapshots retain settings and grading in student and teacher readers without becoming fractions", () => {
  const worksheet = generateNumberLineWorksheet({ ...defaults, form: "fractions", step: "1/4", minimum: -2, maximum: 2, intervals: 8, showSupport: true }, "pt", true);
  const assignment = { mathWorksheet: worksheet, mathType: "number_line", contentType: "number_line_worksheet" };
  assert.ok(hasSnapshotContent(assignment)); assert.ok(hasAssignmentSnapshotContent(assignment));
  const lesson = assignmentToLesson(assignment), derived = getAssignmentDerivedState(lesson, assignment);
  assert.deepEqual(derived.numberLineWorksheet, worksheet);
  assert.equal(derived.isNumberLineAssignment, true);
  assert.equal(derived.isGeometryAssignment, false); assert.equal(derived.isFractionAssignment, false); assert.equal(derived.isArithmeticAssignment, false);
  assert.equal(isFractionWorksheet(worksheet), false); assert.equal(studentFractionGuard(worksheet), false); assert.equal(isMathWorksheet(worksheet), false);
  assert.deepEqual(assignmentSnapshotToLesson(assignment).mathWorksheet, worksheet);
  const answers = Object.fromEntries(worksheet.tasks.map(task => [task.id, numberLineValue(task).toFraction()]));
  const auto = gradeNumberLineWorksheet(worksheet, answers);
  assert.equal(auto.percentAuto, 100);
  assert.deepEqual(readAutoGrade({ auto }), auto);
  assert.equal(mathEditorHref("pt", "saved", "number_line"), "/pt/producer/math/number-line?edit=saved");
});

test("students get empty labeled answers, clickable placement marks and no early feedback or saved key", () => {
  const sheet = generateNumberLineWorksheet(defaults, "nb", true);
  const $ = load(renderToStaticMarkup(<View worksheet={sheet} onAnswerChange={() => {}} />));
  assert.equal($("input").length, 6);
  assert.ok($("input").toArray().every(el => $(el).attr("aria-label") && $(el).attr("value") === ""));
  assert.equal($(".length-key").length, 0); assert.equal($(".length-result").length, 0);
  assert.equal($("button.number-line-mark-button").length, 2 * (defaults.intervals + 1));
  assert.equal($(".number-line-selection").length, 0);
  const answers = Object.fromEntries(sheet.tasks.map(task => [task.id, numberLineValue(task).toFraction()]));
  const teacher = load(renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={answers} readOnly showAutoCheck />));
  assert.equal(teacher("input[readonly]").length, 6); assert.equal(teacher(".length-correct").length, 6);
  assert.equal(teacher(".number-line-mark-button").length, 0); assert.equal(teacher(".number-line-selection").length, 2);
  assert.equal(teacher(".length-key").length, 0);
});

test("read and missing tasks never print the target value under its tick, even with support enabled", () => {
  for (const type of ["read", "missing"] as const) {
    const task = { ...half, type };
    const $ = load(renderToStaticMarkup(<Diagram task={task} settings={{ ...defaults, form: "fractions", showSupport: true }} language="nb" />));
    const target = $("svg > g").eq(task.targetIndex);
    assert.equal(target.find("text").length, 0);
    assert.equal(target.find("rect").length, type === "missing" ? 1 : 0);
    assert.ok($("desc").text().includes("6"));
  }
});

test("paper uses six tasks per page, blank answer fields and an optional separate position key", () => {
  const sheet = generateNumberLineWorksheet({ ...defaults, taskCount: 13 }, "en", true);
  const answers = Object.fromEntries(sheet.tasks.map(task => [task.id, numberLineValue(task).toFraction()]));
  const $ = load(renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={answers} printMode />));
  assert.equal($(".length-page").length, Math.ceil(13 / NUMBER_LINE_TASKS_PER_PAGE));
  assert.equal($(".number-line-task").length, 13); assert.equal($("input, button").length, 0);
  assert.equal($(".number-line-selection").length, 0); assert.equal($(".length-result").length, 0);
  assert.equal($(".length-key").length, 1); assert.equal($(".length-key > div > p").length, 13);
  assert.equal(load(renderToStaticMarkup(<View worksheet={{ ...sheet, showAnswerKey: false }} printMode />))(".length-key").length, 0);
});

test("localized prompts and numeric labels use the worksheet language", () => {
  for (const language of ["nb", "en", "pt"]) {
    const copy = getNumberLineCopy(language), sheet = generateNumberLineWorksheet(defaults, language);
    assert.equal(sheet.title, copy.title); assert.equal(sheet.instructions, copy.instructions);
    assert.equal(numberLinePrompt({ ...half, type: "read" }, sheet.settings, language), copy.readPrompt);
    assert.equal(formatNumberLineValue("1/2", "decimals", language), language === "en" ? "0.5" : "0,5");
    assert.equal(formatNumberLineValue("-3/4", "fractions", language), "-3/4");
  }
});

test("generation API accepts every mode and rejects invalid requests", async () => {
  for (const taskType of NUMBER_LINE_MODES) {
    const response = await POST(new Request("http://localhost/api/generate-number-line-worksheet", { method: "POST", body: JSON.stringify({ settings: { ...defaults, taskType }, language: "pt", showAnswerKey: true }) }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.ok(sanitizeNumberLineWorksheet(result.worksheet)); assert.equal(result.worksheet.language, "pt");
  }
  for (const body of [null, [], {}, { settings: { ...defaults, maximum: 1 } }]) {
    const response = await POST(new Request("http://localhost/api/generate-number-line-worksheet", { method: "POST", body: JSON.stringify(body) }));
    assert.equal(response.status, 400);
  }
  assert.equal((await POST(new Request("http://localhost", { method: "POST", body: "{" }))).status, 400);
});
