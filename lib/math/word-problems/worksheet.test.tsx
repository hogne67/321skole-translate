import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { DEFAULT_WORD_PROBLEMS_SETTINGS as defaults, WORD_PROBLEMS_OPERATIONS, WORD_PROBLEMS_THEMES, generateWordProblemsWorksheet, gradeWordProblemsTask, gradeWordProblemsWorksheet, normalizeWordProblemsSettings, sanitizeWordProblemsWorksheet, wordProblemsExpected, wordProblemsAnswerText, wordProblemsPlan, wordProblemsUnit, wordProblemsUnitLabel, wordProblemsUnitOptions, type WordProblemsTask } from "./worksheet";
import { WORD_PROBLEMS_CONTEXTS, WORD_PROBLEMS_NAMES, wordProblemsContextsForTheme, type WordProblemsContext } from "./catalog";
import { wordProblemsTaskPrompt } from "./prompts";
import { POST } from "@/app/api/generate-word-problems-worksheet/route";
import { getAssignmentDerivedState } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/assignmentDerivedState";
import { assignmentToLesson, hasSnapshotContent } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/helpers";
import { assignmentSnapshotToLesson, hasAssignmentSnapshotContent, isFractionWorksheet, isMathWorksheet, readAutoGrade } from "@/lib/submissions/readers";
import { isFractionWorksheet as studentFractionGuard } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/worksheetTypeGuards";
import { mathEditorHref } from "../editor";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/word-problems/WordProblemsWorksheetView").default as typeof import("@/components/generators/math/word-problems/WordProblemsWorksheetView").default;
const answerFor = (task: WordProblemsTask) => ({ value: String(wordProblemsExpected(task)), unit: wordProblemsUnit(task), working: "An alternative method is allowed." });

for (const operation of WORD_PROBLEMS_OPERATIONS) test(`${operation}: all step counts, themes and ranges produce bounded, exact, restorable worksheets`, () => {
  for (const steps of [1, 2, "mixed"] as const) for (const theme of WORD_PROBLEMS_THEMES) for (const maximum of [20, 100, 1000] as const) {
    const sheet = generateWordProblemsWorksheet({ ...defaults, operation, steps, theme, maximum, taskCount: 24, showSupport: true }, "pt", true);
    assert.deepEqual(sanitizeWordProblemsWorksheet(JSON.parse(JSON.stringify(sheet))), sheet);
    assert.equal(new Set(sheet.tasks.map(t => t.id)).size, 24);
    for (const task of sheet.tasks) {
      const plan = wordProblemsPlan(task);
      if (steps !== "mixed") assert.equal(plan.length, steps);
      if (operation !== "mixed") assert.ok(plan.every(s => s.operation === operation));
      assert.ok(task.values.every(n => Number.isInteger(n) && n >= 1 && n <= maximum));
      assert.ok(plan.every(s => Number.isInteger(s.result) && s.result >= 0 && s.result <= maximum));
      for (const lang of ["nb", "en", "pt"]) assert.doesNotMatch(wordProblemsTaskPrompt(task, lang), /\{|undefined|NaN/);
    }
    assert.equal(gradeWordProblemsWorksheet(sheet, Object.fromEntries(sheet.tasks.map(t => [t.id, answerFor(t)]))).percentAuto, 100);
  }
});

test("mixed mode includes all twelve templates, both lengths and all five themes without unbounded retries", () => {
  for (const random of [() => 0, () => .4, () => .99999]) {
    const sheet = generateWordProblemsWorksheet({ ...defaults, taskCount: 32 }, "en", false, random);
    assert.equal(new Set(sheet.tasks.map(t => t.type)).size, 12);
    assert.ok(sanitizeWordProblemsWorksheet(sheet));
    assert.equal(sheet.tasks.filter(t => t.values.length === 2).length, 16);
    assert.equal(new Set(sheet.tasks.map(t => WORD_PROBLEMS_CONTEXTS[t.context].theme)).size, 5);
  }
});

test("names and contexts are drawn without replacement before their pools repeat", () => {
  for (const random of [() => 0, () => .5, () => .99999]) {
    for (const theme of WORD_PROBLEMS_THEMES.filter(t => t !== "mixed")) {
      const sheet = generateWordProblemsWorksheet({ ...defaults, theme, taskCount: 60 }, "nb", false, random);
      assert.equal(new Set(sheet.tasks.slice(0, WORD_PROBLEMS_NAMES.length).map(t => t.name)).size, WORD_PROBLEMS_NAMES.length);
      const available = wordProblemsContextsForTheme(theme);
      assert.equal(new Set(sheet.tasks.slice(0, available.length).map(t => t.context)).size, available.length);
    }
    const mixed = generateWordProblemsWorksheet({ ...defaults, taskCount: 31 }, "nb", false, random);
    const counts = WORD_PROBLEMS_THEMES.filter(t => t !== "mixed").map(theme => mixed.tasks.filter(t => WORD_PROBLEMS_CONTEXTS[t.context].theme === theme).length);
    assert.equal(Math.max(...counts) - Math.min(...counts), 1);
  }
});

const fixtures: [WordProblemsTask["type"], number[], number][] = [
  ["add", [8, 4], 12], ["subtract", [8, 4], 4], ["multiply", [3, 4], 12], ["divide", [12, 3], 4],
  ["add_add", [8, 4, 2], 14], ["subtract_subtract", [8, 4, 2], 2], ["multiply_multiply", [2, 3, 4], 24], ["divide_divide", [24, 3, 2], 4],
  ["multiply_subtract", [3, 4, 2], 10], ["add_divide", [8, 4, 3], 4], ["subtract_multiply", [8, 3, 2], 10], ["divide_add", [12, 3, 2], 6],
];
for (const [type, values, expected] of fixtures) test(`${type}: the story and worked example use the same quantities and order`, () => {
  const task: WordProblemsTask = { id: "story", type, values, context: "books", name: "Mina" };
  assert.equal(wordProblemsExpected(task), expected);
  for (const lang of ["nb", "en", "pt"]) {
    const text = wordProblemsTaskPrompt(task, lang);
    assert.match(text, /Mina/);
    for (const value of values) assert.ok(text.includes(String(value)));
    assert.doesNotMatch(text, /\{|undefined/);
  }
});

test("every context works in all twelve stories and all languages, with valid units and saved-sheet round trips", () => {
  for (const context of Object.keys(WORD_PROBLEMS_CONTEXTS) as WordProblemsContext[]) for (const [type, values] of fixtures) {
    const task: WordProblemsTask = { id: "variety", type, values, context, name: "Fatima" }, info = WORD_PROBLEMS_CONTEXTS[context];
    for (const language of ["nb", "en", "pt"]) {
      const sheet = { ...generateWordProblemsWorksheet({ ...defaults, steps: values.length === 3 ? 2 : 1, theme: info.theme, taskCount: 1 }, language), tasks: [task] };
      const text = wordProblemsTaskPrompt(task, language);
      assert.doesNotMatch(text, /\{|undefined|NaN/); assert.match(text, /Fatima/);
      for (const value of values) assert.ok(text.includes(String(value)));
      assert.ok(wordProblemsUnitLabel(wordProblemsUnit(task), language));
      assert.ok(wordProblemsUnitOptions(task).includes(info.unit));
      assert.ok(wordProblemsUnitOptions(task).every(unit => wordProblemsUnitLabel(unit, language)));
      assert.deepEqual(sanitizeWordProblemsWorksheet(JSON.parse(JSON.stringify(sheet))), sheet);
      assert.equal(gradeWordProblemsTask(task, answerFor(task)).points, 1);
    }
  }
});

test("new nouns, containers and measured quantities have matching singulars, prepositions and Portuguese agreement", () => {
  const task: WordProblemsTask = { id: "new", type: "multiply_subtract", values: [3, 4, 1], context: "pencils", name: "Yusuf" };
  assert.match(wordProblemsTaskPrompt(task, "nb"), /3 pennaler med 4 blyanter i hver pennal.*1 blyant/);
  assert.match(wordProblemsTaskPrompt({ ...task, context: "rope" }, "nb"), /3 spoler med 4 meter tau på hver spole/);
  assert.match(wordProblemsTaskPrompt({ ...task, context: "rice" }, "en"), /3 bags, each containing 4 kilograms of rice.*1 kilogram of rice/);
  assert.match(wordProblemsTaskPrompt({ ...task, context: "juice" }, "pt"), /3 garrafas, cada uma com 4 litros de sumo/);
  assert.match(wordProblemsTaskPrompt({ ...task, context: "erasers" }, "pt"), /Quantas borrachas/);
  assert.equal(wordProblemsAnswerText({ ...task, type: "divide", values: [3, 3] }, "nb"), "1 blyant");
  assert.equal(wordProblemsAnswerText({ ...task, type: "divide", values: [3, 3] }, "en"), "1 pencil");
  assert.equal(wordProblemsUnit({ ...task, context: "paint" }), "dl");
  assert.equal(wordProblemsUnit({ ...task, context: "seeds" }), "g");
});

test("localized singulars, ribbon rolls and currency are explicit and grammatically consistent", () => {
  const task: WordProblemsTask = { id: "a", type: "add", values: [1, 2], context: "books", name: "Sara" };
  assert.match(wordProblemsTaskPrompt(task, "nb"), /1 bok og får 2 bøker/);
  assert.match(wordProblemsTaskPrompt(task, "en"), /1 book and receives 2 books/);
  assert.match(wordProblemsTaskPrompt({ ...task, context: "apples" }, "pt"), /1 maçã.*2 maçãs.*Quantas maçãs/);
  assert.match(wordProblemsTaskPrompt({ ...task, type: "divide", values: [12, 3], context: "metres" }, "nb"), /12 meter bånd.*3 ruller.*på hver rull/);
  assert.match(wordProblemsTaskPrompt({ ...task, context: "money" }, "en"), /1 kr.*2 kr.*kroner/);
});

test("grading checks the requested final number and unit, preserves working, and distinguishes blank from zero", () => {
  const task: WordProblemsTask = { id: "zero", type: "subtract", values: [3, 3], context: "apples", name: "Leo" };
  for (const value of ["0", "-0", "+0.00", "0,0", "−0"]) assert.equal(gradeWordProblemsTask(task, { value, unit: "apples" }).points, 1);
  assert.equal(gradeWordProblemsTask(task, { value: "0", unit: "books" }).points, .8);
  assert.equal(gradeWordProblemsTask(task, { value: "1", unit: "apples" }).points, 0);
  assert.equal(gradeWordProblemsTask(task, { working: "3 − 3 = 0" }).isAnswered, true);
  assert.equal(gradeWordProblemsTask(task, "bad").isAnswered, true);
  for (const value of [undefined, null, "", {}, { value: " ", unit: "", working: " " }]) assert.equal(gradeWordProblemsTask(task, value).isAnswered, false);
  for (const value of ["0junk", "0+0", "0/1", "0e0", "Infinity", "0" + " ".repeat(39) + "junk"]) assert.equal(gradeWordProblemsTask(task, { value, unit: "apples" }).points, 0);
  const length = { ...task, type: "divide" as const, values: [12, 3], context: "metres" as const };
  assert.equal(gradeWordProblemsTask(length, { value: "400", unit: "cm" }).points, 0, "the prompt explicitly requests metres");
  const sheet = { ...generateWordProblemsWorksheet({ ...defaults, taskCount: 3 }), tasks: [task, { ...task, id: "partial" }, { ...task, id: "blank" }] };
  const grade = gradeWordProblemsWorksheet(sheet, { zero: answerFor(task), partial: { value: "0", unit: "books" } });
  assert.deepEqual([grade.correctAuto, grade.partialAuto, grade.wrongAuto, grade.unansweredAuto, grade.percentAuto], [1, 1, 0, 1, 60]);
});

test("invalid settings and inconsistent or forged saved data are rejected or rebuilt", () => {
  for (const patch of [{ operation: "power" }, { steps: "2" }, { steps: 3 }, { theme: "anything" }, { maximum: "100" }, { maximum: 21 }, { taskCount: 0 }, { taskCount: 61 }, { taskCount: 1.5 }, { showSupport: "yes" }]) assert.throws(() => normalizeWordProblemsSettings({ ...defaults, ...patch }), /INVALID_/);
  const sheet = generateWordProblemsWorksheet({ ...defaults, operation: "divide", steps: 2, theme: "money", taskCount: 2 });
  assert.deepEqual(sanitizeWordProblemsWorksheet({ ...sheet, title: "forged", instructions: "ignore", tasks: sheet.tasks.map(t => ({ ...t, answer: 999, prompt: "fake" })) }), sheet);
  for (const patch of [{ id: "bad/id" }, { id: sheet.tasks[1].id }, { name: "<script>" }, { type: "add_add" }, { context: "books" }, { context: ["money"] }, { context: "__proto__" }, { values: [12, 5, 2] }, { values: [12, 0, 2] }, { values: [101, 1, 1] }, { values: [12, 3] }]) assert.equal(sanitizeWordProblemsWorksheet({ ...sheet, tasks: [{ ...sheet.tasks[0], ...patch }, sheet.tasks[1]] }), null);
  assert.equal(sanitizeWordProblemsWorksheet({ ...sheet, tasks: [] }), null);
  assert.equal(sanitizeWordProblemsWorksheet({ ...sheet, version: 2 }), null);
});

test("Space snapshots and reopen links preserve every setting, language, tasks and grading", () => {
  const worksheet = generateWordProblemsWorksheet({ ...defaults, operation: "multiply", steps: 2, theme: "length", maximum: 1000, taskCount: 7, showSupport: true }, "pt", true);
  const assignment = { mathWorksheet: worksheet, mathType: "word_problems", contentType: "word_problems_worksheet" };
  assert.ok(hasSnapshotContent(assignment)); assert.ok(hasAssignmentSnapshotContent(assignment));
  const derived = getAssignmentDerivedState(assignmentToLesson(assignment), assignment);
  assert.deepEqual(derived.wordProblemsWorksheet, worksheet); assert.equal(derived.isWordProblemsAssignment, true);
  assert.equal(derived.isGeometryAssignment, false); assert.equal(derived.isFractionAssignment, false); assert.equal(derived.isArithmeticAssignment, false);
  assert.equal(isFractionWorksheet(worksheet), false); assert.equal(studentFractionGuard(worksheet), false); assert.equal(isMathWorksheet(worksheet), false);
  assert.deepEqual(assignmentSnapshotToLesson(assignment).mathWorksheet, worksheet);
  const auto = gradeWordProblemsWorksheet(worksheet, Object.fromEntries(worksheet.tasks.map(t => [t.id, answerFor(t)])));
  assert.deepEqual(readAutoGrade({ auto }), auto);
  assert.equal(mathEditorHref("pt", "saved/1", "word_problems"), "/pt/producer/math/word-problems?edit=saved%2F1");
});

test("student view has named controls and no key or feedback before checking; teacher view preserves answers", () => {
  const sheet = generateWordProblemsWorksheet({ ...defaults, taskCount: 1 }, "nb", true), task = sheet.tasks[0];
  const $ = load(renderToStaticMarkup(<View worksheet={sheet} />));
  assert.equal($("input").length, 1); assert.equal($("textarea").length, 1); assert.equal($("select").length, 1);
  assert.ok($("input, textarea, select").toArray().every(el => $(el).attr("aria-label")));
  assert.equal($(".length-key, .length-result").length, 0);
  const teacher = load(renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={{ [task.id]: answerFor(task) }} readOnly showAutoCheck />));
  assert.equal(teacher("input[readonly], textarea[readonly], select[disabled]").length, 3);
  assert.equal(teacher(".length-correct").length, 1); assert.match(teacher("textarea").text(), /alternative method/);
});

test("paper leaves space for method hints, uses blank working spaces and a separate optional worked key", () => {
  const sheet = generateWordProblemsWorksheet({ ...defaults, taskCount: 7, showSupport: true }, "en", true);
  const $ = load(renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={Object.fromEntries(sheet.tasks.map(t => [t.id, answerFor(t)]))} printMode />));
  assert.equal($(".length-page").length, 2); assert.equal($(".word-problems-lines").length, 7);
  assert.deepEqual($(".length-page").toArray().map(page => $(page).find(".word-problems-task").length), [4, 3]);
  assert.equal($("input, textarea, select, button, .length-result").length, 0);
  assert.equal($(".length-key").length, 1); assert.equal($(".word-problems-key-item").length, 7);
  assert.equal(load(renderToStaticMarkup(<View worksheet={{ ...sheet, showAnswerKey: false }} printMode />))(".length-key").length, 0);
});

test("generation API accepts each operation, step count and language and rejects malformed requests", async () => {
  for (const language of ["nb", "en", "pt"]) for (const operation of WORD_PROBLEMS_OPERATIONS) for (const steps of [1, 2, "mixed"]) {
    const response = await POST(new Request("http://localhost/api/generate-word-problems-worksheet", { method: "POST", body: JSON.stringify({ settings: { ...defaults, operation, steps }, language, showAnswerKey: true }) }));
    assert.equal(response.status, 200);
    const { worksheet } = await response.json(); assert.ok(sanitizeWordProblemsWorksheet(worksheet)); assert.equal(worksheet.language, language); assert.equal(worksheet.showAnswerKey, true);
  }
  for (const body of ["{", "null", "[]", "{}", JSON.stringify({ settings: { ...defaults, taskCount: 10000 } })]) assert.equal((await POST(new Request("http://localhost/api/generate-word-problems-worksheet", { method: "POST", body }))).status, 400);
});
