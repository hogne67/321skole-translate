import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { DEFAULT_PLACE_VALUE_SETTINGS as defaults, PLACE_VALUE_MODES, PLACE_VALUE_TASK_TYPES, formatPlaceValueNumber, generatePlaceValueWorksheet, gradePlaceValueTask, gradePlaceValueWorksheet, normalizePlaceValueSettings, parsePlaceValueNumber, placeValueColumn, placeValueDigit, placeValueExponents, placeValueExpansion, placeValueExpected, placeValueMissingEquation, placeValueNumberTokens, placeValueParts, placeValueTaskAnswer, placeValueTaskPrompt, sanitizePlaceValueWorksheet, type PlaceValueSettings, type PlaceValueTask } from "./worksheet";
import { POST } from "@/app/api/generate-place-value-worksheet/route";
import { getAssignmentDerivedState } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/assignmentDerivedState";
import { assignmentToLesson, hasSnapshotContent } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/helpers";
import { assignmentSnapshotToLesson, hasAssignmentSnapshotContent, isFractionWorksheet, isMathWorksheet, readAutoGrade } from "@/lib/submissions/readers";
import { isFractionWorksheet as studentFractionGuard } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/worksheetTypeGuards";
import { mathEditorHref } from "../editor";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/place-value/PlaceValueWorksheetView").default as typeof import("@/components/generators/math/place-value/PlaceValueWorksheetView").default;
const answerFor = (task: PlaceValueTask, settings: PlaceValueSettings, language = "nb") => ({ value: placeValueTaskAnswer(task, settings, language), table: placeValueExponents(settings).map(e => String(placeValueDigit(task, e, settings))) });

for (const taskType of PLACE_VALUE_MODES) test(`${taskType}: every digit count, decimal precision and table option generates exact, restorable and correctly graded tasks`, () => {
  for (const integerDigits of [1, 2, 3, 4, 5, 6] as const) for (const decimalPlaces of [0, 1, 2, 3] as const) for (const showPlaceValueTable of [false, true]) {
    const sheet = generatePlaceValueWorksheet({ ...defaults, taskType, integerDigits, decimalPlaces, showPlaceValueTable, taskCount: 13 }, "pt", true);
    assert.deepEqual(sanitizePlaceValueWorksheet(JSON.parse(JSON.stringify(sheet))), sheet);
    assert.equal(new Set(sheet.tasks.map(t => t.id)).size, 13);
    for (const task of sheet.tasks) {
      assert.ok(Number.isInteger(task.scaledValue) && task.scaledValue >= 0 && task.scaledValue < 10 ** (integerDigits + decimalPlaces));
      assert.equal(placeValueParts(task, sheet.settings).reduce((sum, p) => sum + p.scaled, 0), task.scaledValue);
      assert.ok(Number.isInteger(placeValueExpected(task, sheet.settings)));
      for (const language of ["nb", "en", "pt"]) {
        assert.doesNotMatch(placeValueTaskPrompt(task, sheet.settings, language), /undefined|NaN|\{/);
        assert.equal(gradePlaceValueTask(task, sheet.settings, answerFor(task, sheet.settings, language)).points, 1);
      }
    }
    assert.equal(gradePlaceValueWorksheet(sheet, Object.fromEntries(sheet.tasks.map(t => [t.id, answerFor(t, sheet.settings)]))).percentAuto, 100);
    if (taskType === "mixed") {
      const counts = PLACE_VALUE_TASK_TYPES.map(type => sheet.tasks.filter(t => t.type === type).length);
      assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
    } else assert.ok(sheet.tasks.every(t => t.type === taskType));
  }
});

test("constant random sources are bounded, and digit targets are always visible even for zero and sub-unit decimals", () => {
  for (const random of [() => 0, () => .4, () => .99999]) for (const taskType of PLACE_VALUE_MODES) {
    const sheet = generatePlaceValueWorksheet({ ...defaults, taskType, integerDigits: 1, decimalPlaces: 3, taskCount: 60 }, "en", false, random);
    assert.equal(sheet.tasks.length, 60); assert.ok(sanitizePlaceValueWorksheet(sheet));
    for (const task of sheet.tasks.filter(t => t.type === "digit_value")) assert.ok(placeValueNumberTokens(task, sheet.settings, "en").some(t => t.exponent === task.targetExponent));
  }
});

const settings = { ...defaults, integerDigits: 4 as const, decimalPlaces: 2 as const };
const task = (type: PlaceValueTask["type"], scaledValue: number, targetExponent: number | null = null): PlaceValueTask => ({ id: "test", type, scaledValue, targetExponent });
test("expanded form keeps each nonzero place separate, ignores internal zeroes and preserves decimal values exactly", () => {
  assert.equal(placeValueExpansion(task("expand", 342000), settings, "nb"), "3 000 + 400 + 20");
  assert.equal(placeValueExpansion(task("expand", 30407), settings, "nb"), "300 + 4 + 0,07");
  assert.equal(placeValueExpansion(task("expand", 30407), settings, "en"), "300 + 4 + 0.07");
  assert.equal(placeValueExpansion(task("expand", 0), settings, "nb"), "0");
  assert.equal(formatPlaceValueNumber(999999999, 3, "nb", true), "999 999,999");
  assert.equal(formatPlaceValueNumber(7, 3, "en", true), "0.007");
  assert.equal(formatPlaceValueNumber(70, 2, "nb", true), "0,70");
  assert.equal(formatPlaceValueNumber(70, 2, "nb"), "0,7");
});

test("digit-value tasks distinguish repeated digits, including the zero in the tens place", () => {
  const repeated = task("digit_value", 22222, -2);
  assert.equal(placeValueExpected(repeated, settings), 2);
  assert.match(placeValueTaskPrompt(repeated, settings, "nb"), /sifferet 2 på hundredelsplassen i tallet 222,22/);
  assert.equal(placeValueExpected(task("digit_value", 408300, 1), settings), 8000);
  assert.equal(placeValueExpected(task("digit_value", 40200, 1), settings), 0);
  const tokens = placeValueNumberTokens(repeated, settings, "nb");
  assert.equal(tokens.find(t => t.exponent === -2)?.text, "2");
  assert.equal(tokens.filter(t => t.exponent === -2).length, 1);
  assert.ok(placeValueExponents(settings).every(e => ["nb", "en", "pt"].every(lang => !!placeValueColumn(e, lang))));
});

test("missing parts replace exactly the targeted place and keep zeroes out of the displayed sum", () => {
  const missing = task("missing_part", 408300, 1);
  assert.equal(placeValueMissingEquation(missing, settings, "nb"), "4 083,00 = 4 000 + □ + 3");
  assert.equal(placeValueTaskAnswer(missing, settings, "nb"), "80");
  const decimal = task("missing_part", 30407, -2);
  assert.equal(placeValueMissingEquation(decimal, settings, "en"), "304.07 = 300 + 4 + □");
  assert.equal(placeValueTaskAnswer(decimal, settings, "en"), "0.07");
});

test("numeric answers accept decimal comma or point, grouped thousands and trailing zeroes without rounding", () => {
  for (const text of ["1 234,50", "1234.5", "1\u202f234.500", "1\u00a0234,5000", "+1234.50"]) assert.equal(parsePlaceValueNumber(text, 2), 123450);
  for (const text of ["1,234", "12 34", "1+2", "1e3", "1/2", "-1", "NaN", "Infinity", "1.234.5", "0,001", "0".repeat(41)]) assert.equal(parsePlaceValueNumber(text, 2), null);
  assert.equal(parsePlaceValueNumber("0,000", 0), 0);
  assert.equal(parsePlaceValueNumber("0.001", 3), 1);
  assert.equal(gradePlaceValueTask(task("compose", 30407), settings, { value: "304.07" }).isCorrect, true);
});

test("expanded-form grading accepts reordered terms and optional zeroes, rejects a total alone and awards bounded partial credit", () => {
  const expanded = task("expand", 342000);
  for (const value of ["3 000 + 400 + 20", "20+3000+400", "3000 + 400 + 20 + 0", "3000.0+400,00+20"]) assert.equal(gradePlaceValueTask(expanded, settings, { value }).points, 1);
  assert.equal(gradePlaceValueTask(expanded, settings, { value: "3420" }).points, 0);
  assert.equal(gradePlaceValueTask(expanded, settings, { value: "3400+20" }).points, 1 / 3);
  assert.equal(gradePlaceValueTask(expanded, settings, { value: "3000+40+20" }).points, 2 / 3);
  assert.equal(gradePlaceValueTask(expanded, settings, { value: "3000+400+20+20" }).points, .75);
  assert.equal(gradePlaceValueTask(expanded, settings, { value: "3000+400+20+999" }).isCorrect, false);
  for (const value of ["3000+400+20+", "3000-400-20", "3000+400+20junk", "3000+400+2e1", " ", "3000+400+20" + " ".repeat(240)]) assert.equal(gradePlaceValueTask(expanded, settings, { value }).points, 0);
  assert.equal(gradePlaceValueTask(task("expand", 0), settings, { value: "0+0" }).points, 1);
});

test("blank final answers stay unanswered even when the optional support table is filled; zero is an answer", () => {
  const zero = task("digit_value", 40200, 1);
  for (const value of [undefined, null, "", {}, { value: " " }, { table: ["4", "0", "2"] }]) {
    const result = gradePlaceValueTask(zero, settings, value); assert.equal(result.isAnswered, false); assert.equal(result.points, 0);
  }
  assert.equal(gradePlaceValueTask(zero, settings, { value: "0", table: ["9"] }).points, 1);
  assert.equal(gradePlaceValueTask(zero, settings, { value: "0.01" }).points, 0);
});

test("saved data is rebuilt canonically and rejects invalid settings, IDs, ranges and hidden or empty target places", () => {
  for (const patch of [{ taskType: "anything" }, { integerDigits: "3" }, { integerDigits: 0 }, { integerDigits: 7 }, { decimalPlaces: "2" }, { decimalPlaces: 4 }, { decimalPlaces: -1 }, { taskCount: 0 }, { taskCount: 61 }, { taskCount: 1.5 }, { showPlaceValueTable: "yes" }]) assert.throws(() => normalizePlaceValueSettings({ ...defaults, ...patch }), /INVALID_/);
  const sheet = generatePlaceValueWorksheet({ ...defaults, taskCount: 2, taskType: "expand" });
  assert.deepEqual(sanitizePlaceValueWorksheet({ ...sheet, title: "fake", instructions: "fake", tasks: sheet.tasks.map(t => ({ ...t, answer: "fake" })) }), sheet);
  for (const patch of [{ id: "bad/id" }, { id: sheet.tasks[1].id }, { type: "compose" }, { scaledValue: -1 }, { scaledValue: "123" }, { scaledValue: 1.2 }, { scaledValue: 1000 }, { targetExponent: 0 }]) assert.equal(sanitizePlaceValueWorksheet({ ...sheet, tasks: [{ ...sheet.tasks[0], ...patch }, sheet.tasks[1]] }), null);
  const targetSheet = { ...sheet, settings: { ...sheet.settings, taskType: "digit_value" as const }, tasks: [task("digit_value", 12, 2), { ...task("digit_value", 12, 1), id: "ok" }] };
  assert.equal(sanitizePlaceValueWorksheet(targetSheet), null);
  assert.equal(sanitizePlaceValueWorksheet({ ...targetSheet, tasks: [task("missing_part", 402, 1), targetSheet.tasks[1]], settings: { ...sheet.settings, taskType: "mixed" } }), null);
  assert.equal(sanitizePlaceValueWorksheet({ ...sheet, tasks: [] }), null);
  assert.equal(sanitizePlaceValueWorksheet({ ...sheet, version: 2 }), null);
});

test("Space snapshots, exact grading and reopen links retain every decimal and table setting", () => {
  const worksheet = generatePlaceValueWorksheet({ ...defaults, integerDigits: 6, decimalPlaces: 3, showPlaceValueTable: false, taskCount: 9 }, "pt", true);
  const assignment = { mathWorksheet: worksheet, mathType: "place_value", contentType: "place_value_worksheet" };
  assert.ok(hasSnapshotContent(assignment)); assert.ok(hasAssignmentSnapshotContent(assignment));
  const derived = getAssignmentDerivedState(assignmentToLesson(assignment), assignment);
  assert.deepEqual(derived.placeValueWorksheet, worksheet); assert.equal(derived.isPlaceValueAssignment, true);
  assert.equal(derived.isGeometryAssignment, false); assert.equal(derived.isFractionAssignment, false); assert.equal(derived.isArithmeticAssignment, false);
  assert.equal(isFractionWorksheet(worksheet), false); assert.equal(studentFractionGuard(worksheet), false); assert.equal(isMathWorksheet(worksheet), false);
  assert.deepEqual(assignmentSnapshotToLesson(assignment).mathWorksheet, worksheet);
  const auto = gradePlaceValueWorksheet(worksheet, Object.fromEntries(worksheet.tasks.map(t => [t.id, answerFor(t, worksheet.settings, "pt")])));
  assert.equal(auto.percentAuto, 100); assert.deepEqual(readAutoGrade({ auto }), auto);
  assert.equal(mathEditorHref("pt", "saved/1", "place_value"), "/pt/producer/math/place-value?edit=saved%2F1");
});

test("student tables and answers are labeled and blank; keys and feedback stay hidden until checking", () => {
  const sheet = generatePlaceValueWorksheet({ ...defaults, integerDigits: 6, decimalPlaces: 3, taskType: "digit_value", taskCount: 1 }, "nb", true), first = sheet.tasks[0];
  const $ = load(renderToStaticMarkup(<View worksheet={sheet} />));
  assert.equal($(".place-value-table th[scope='col']").length, 9);
  assert.equal($("input").length, 10); assert.ok($("input").toArray().every(el => $(el).attr("aria-label") && $(el).attr("value") === ""));
  assert.equal($("mark").length, 1); assert.equal($(".length-key, .length-result").length, 0);
  const answers = { [first.id]: answerFor(first, sheet.settings) }, teacher = load(renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={answers} readOnly showAutoCheck />));
  assert.equal(teacher("input[readonly]").length, 10); assert.equal(teacher(".length-correct").length, 1);
  const noTable = load(renderToStaticMarkup(<View worksheet={{ ...sheet, settings: { ...sheet.settings, showPlaceValueTable: false } }} />));
  assert.equal(noTable("table").length, 0); assert.equal(noTable("input").length, 1);
});

test("paper uses four tasks per page, blank tables and answer lines, with a separate optional key", () => {
  const sheet = generatePlaceValueWorksheet({ ...defaults, taskCount: 9, decimalPlaces: 2 }, "en", true), answers = Object.fromEntries(sheet.tasks.map(t => [t.id, answerFor(t, sheet.settings)]));
  const $ = load(renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={answers} printMode />));
  assert.equal($(".length-page").length, 3); assert.equal($(".place-value-task").length, 9); assert.equal($("table").length, 9);
  assert.equal($("input, textarea, button, .length-result").length, 0); assert.equal($(".place-value-answer-space").length, 9);
  assert.equal($(".length-key").length, 1); assert.equal($(".place-value-key-item").length, 9);
  assert.equal(load(renderToStaticMarkup(<View worksheet={{ ...sheet, showAnswerKey: false }} printMode />))(".length-key").length, 0);
});

test("generation API accepts all task modes and precisions in all languages, and rejects malformed input", async () => {
  for (const language of ["nb", "en", "pt"]) for (const taskType of PLACE_VALUE_MODES) for (const decimalPlaces of [0, 1, 2, 3]) {
    const response = await POST(new Request("http://localhost/api/generate-place-value-worksheet", { method: "POST", body: JSON.stringify({ settings: { ...defaults, taskType, decimalPlaces }, language, showAnswerKey: true }) }));
    assert.equal(response.status, 200); const { worksheet } = await response.json(); assert.ok(sanitizePlaceValueWorksheet(worksheet)); assert.equal(worksheet.language, language); assert.equal(worksheet.showAnswerKey, true);
  }
  for (const body of ["{", "[]", "null", "{}", JSON.stringify({ settings: { ...defaults, taskCount: 100000 } })]) assert.equal((await POST(new Request("http://localhost/api/generate-place-value-worksheet", { method: "POST", body }))).status, 400);
});
