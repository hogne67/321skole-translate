import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { DEFAULT_POWERS_SETTINGS as defaults, POWERS_MODES, POWERS_TASK_TYPES, POWERS_RULE_OPERATIONS, formatPower, generatePowersWorksheet, gradePowersTask, gradePowersWorksheet, normalizePowersSettings, parsePower, parsePowersProduct, powersResultExponent, powersTaskAnswer, powersTaskHint, powersTaskPrompt, readPowersAnswer, sanitizePowersWorksheet, type PowersAnswer, type PowersTask } from "./worksheet";
import { POST } from "@/app/api/generate-powers-worksheet/route";
import { getAssignmentDerivedState } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/assignmentDerivedState";
import { assignmentToLesson, hasSnapshotContent } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/helpers";
import { assignmentSnapshotToLesson, hasAssignmentSnapshotContent, isFractionWorksheet, readAutoGrade } from "@/lib/submissions/readers";
import { isFractionWorksheet as studentFractionGuard } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/worksheetTypeGuards";
import { mathEditorHref } from "../editor";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/powers/PowersWorksheetView").default as typeof import("@/components/generators/math/powers/PowersWorksheetView").default;
const task = (type: PowersTask["type"], base = 2, exponent = 3, operation: PowersTask["operation"] = null, otherExponent: number | null = null): PowersTask => ({ id: "test", type, base, exponent, operation, otherExponent });
const answerFor = (t: PowersTask): PowersAnswer => ({ base: String(t.base), exponent: String(powersResultExponent(t)), value: powersTaskAnswer(t) });

for (const taskType of POWERS_MODES) test(`${taskType}: ranges, zero option, operations and support produce exact restorable tasks`, () => {
  for (const maxBase of [2, 5, 12]) for (const maxExponent of [2, 4, 6]) for (const includeZeroExponent of [false, true]) for (const ruleOperation of POWERS_RULE_OPERATIONS) for (const showSupport of [false, true]) {
    const settings = { ...defaults, taskType, maxBase, maxExponent, includeZeroExponent, ruleOperation, showSupport, taskCount: 13 };
    const sheet = generatePowersWorksheet(settings, "pt", true);
    assert.deepEqual(sanitizePowersWorksheet(JSON.parse(JSON.stringify(sheet))), sheet);
    assert.deepEqual(sheet.settings, settings);
    assert.equal(new Set(sheet.tasks.map(t => t.id)).size, sheet.tasks.length);
    for (const t of sheet.tasks) {
      assert.ok(t.base >= 2 && t.base <= maxBase);
      assert.ok(t.exponent >= (t.type === "expand" || t.type === "write_power" ? 2 : includeZeroExponent ? 0 : 1) && t.exponent <= maxExponent);
      if (t.type === "power_rules") {
        assert.ok(t.otherExponent! >= (includeZeroExponent ? 0 : 1) && t.otherExponent! <= maxExponent);
        assert.ok(powersResultExponent(t) >= (includeZeroExponent ? 0 : 1) && powersResultExponent(t) <= maxExponent);
        assert.equal(t.base ** powersResultExponent(t), t.operation === "multiply" ? (t.base ** t.exponent) * (t.base ** t.otherExponent!) : (t.base ** t.exponent) / (t.base ** t.otherExponent!));
        if (ruleOperation !== "mixed") assert.equal(t.operation, ruleOperation);
      }
      for (const language of ["nb", "en", "pt"]) {
        assert.doesNotMatch(powersTaskPrompt(t, language), /undefined|NaN|\{/);
        assert.doesNotMatch(powersTaskHint(t, language), /undefined|NaN|\{/);
      }
      assert.equal(gradePowersTask(t, answerFor(t)).points, 1);
    }
    assert.equal(gradePowersWorksheet(sheet, Object.fromEntries(sheet.tasks.map(t => [t.id, answerFor(t)]))).percentAuto, 100);
    if (taskType === "mixed") { const counts = POWERS_TASK_TYPES.map(type => sheet.tasks.filter(t => t.type === type).length); assert.ok(Math.max(...counts) - Math.min(...counts) <= 1); }
    else assert.ok(sheet.tasks.every(t => t.type === taskType));
  }
});

test("mixed rules balance multiplication and division and do not repeat a pool before exhausting it", () => {
  for (const taskType of ["mixed", "power_rules"] as const) {
    const sheet = generatePowersWorksheet({ ...defaults, taskType, taskCount: 60 }, "en");
    const rules = sheet.tasks.filter(t => t.type === "power_rules");
    assert.ok(Math.abs(rules.filter(t => t.operation === "multiply").length - rules.filter(t => t.operation === "divide").length) <= 1);
    for (const type of POWERS_TASK_TYPES) for (const operation of [null, "multiply", "divide"]) {
      const pool = sheet.tasks.filter(t => t.type === type && t.operation === operation);
      assert.equal(new Set(pool.map(t => `${t.base}_${t.exponent}_${t.otherExponent}`)).size, pool.length);
    }
  }
});

test("smallest ranges refill finite pools even for sixty tasks and zero exponent", () => {
  for (const taskType of POWERS_MODES) for (const ruleOperation of POWERS_RULE_OPERATIONS) for (const includeZeroExponent of [false, true]) {
    const sheet = generatePowersWorksheet({ ...defaults, taskType, ruleOperation, includeZeroExponent, taskCount: 60, maxBase: 2, maxExponent: 2 }, "nb", false, () => 0);
    assert.equal(sheet.tasks.length, 60); assert.ok(sheet.tasks.every(t => t.base === 2));
    assert.ok(sanitizePowersWorksheet(sheet));
  }
});

test("settings reject invalid types, ranges and booleans rather than silently changing saved settings", () => {
  for (const invalid of [null, [], {}, { ...defaults, taskType: "bad" }, { ...defaults, maxBase: 1 }, { ...defaults, maxBase: 13 }, { ...defaults, maxBase: 2.5 }, { ...defaults, maxExponent: 1 }, { ...defaults, maxExponent: 7 }, { ...defaults, maxExponent: Infinity }, { ...defaults, taskCount: 0 }, { ...defaults, taskCount: 61 }, { ...defaults, taskCount: NaN }, { ...defaults, includeZeroExponent: 1 }, { ...defaults, showSupport: "yes" }, { ...defaults, ruleOperation: "add" }]) assert.throws(() => normalizePowersSettings(invalid), /INVALID_SETTINGS/);
});

test("sanitization rebuilds canonical prompts and rejects corrupt tasks, IDs and rule answers", () => {
  const original = generatePowersWorksheet({ ...defaults, taskType: "power_rules", taskCount: 2, ruleOperation: "divide" }, "en", true);
  assert.equal(sanitizePowersWorksheet({ ...original, title: "forged", instructions: "forged", tasks: original.tasks.map(t => ({ ...t, answer: "forged" })) })?.title, original.title);
  for (const changes of [{ base: 0 }, { base: 13 }, { exponent: -1 }, { exponent: 7 }, { otherExponent: 0 }, { otherExponent: 6 }, { operation: "multiply" }, { operation: null }, { type: "evaluate" }, { id: "<script>" }]) assert.equal(sanitizePowersWorksheet({ ...original, tasks: [{ ...original.tasks[0], ...changes }, original.tasks[1]] }), null);
  assert.equal(sanitizePowersWorksheet({ ...original, tasks: [original.tasks[0], original.tasks[0]] }), null);
  for (const changes of [{ version: 2 }, { kind: "fraction" }, { tasks: [] }, { settings: { ...original.settings, includeZeroExponent: "yes" } }]) assert.equal(sanitizePowersWorksheet({ ...original, ...changes }), null);
  const simple = generatePowersWorksheet({ ...defaults, taskType: "expand", taskCount: 1 });
  assert.equal(sanitizePowersWorksheet({ ...simple, tasks: [{ ...simple.tasks[0], operation: "multiply" }] }), null);
  assert.equal(sanitizePowersWorksheet({ ...simple, tasks: [{ ...simple.tasks[0], exponent: 0 }] }), null);
});

test("single-power notation accepts caret and Unicode exponents including zero and a two-digit base", () => {
  for (const text of ["12^6", "12⁶", " 12 ^ 06 "]) assert.deepEqual(parsePower(text), { base: "12", exponent: text.includes("06") ? "06" : "6" });
  assert.deepEqual(parsePower("2⁰"), { base: "2", exponent: "0" });
  assert.equal(formatPower(12, 6), "12⁶");
  for (const text of ["8", "2×2×2", "2^3^2", "2**3", "(2)^3", "-2^3", "2^-3", "2^1.5", "2^3+1", "0/0", "2^Infinity", "alert(1)", "2^3" + " ".repeat(100)]) assert.equal(parsePower(text), null);
});

test("power answers keep the requested base, award independent partial credit and distinguish numerical values", () => {
  const t = task("write_power");
  for (const answer of ["2³", "2^3", { base: "2", exponent: "3" }, { value: "2^3" }]) assert.equal(gradePowersTask(t, answer).points, 1);
  for (const answer of [{ base: "2", exponent: "4" }, { base: "8", exponent: "3" }, { exponent: "3" }, { base: "2" }]) assert.equal(gradePowersTask(t, answer).points, .5);
  for (const answer of ["8", "8^1", "2*3", "2^2+1", { value: "8" }, { base: "2.0", exponent: "3.0" }]) assert.equal(gradePowersTask(t, answer).points, 0);
  assert.equal(gradePowersTask(task("power_rules", 5, 4, "divide", 4), { base: "5", exponent: "0" }).points, 1);
  assert.equal(gradePowersTask(task("power_rules", 2, 2, "multiply", 3), "2^5").points, 1);
});

test("expanded products require the correct repeated factors rather than just an equivalent value", () => {
  const t = task("expand");
  for (const text of ["2 × 2 × 2", "2*2*2", " 02 · 2 x 2 "]) assert.equal(gradePowersTask(t, text).points, 1);
  assert.equal(gradePowersTask(t, "2 × 2").points, 2 / 3);
  assert.equal(gradePowersTask(t, "2 × 3 × 2").points, 2 / 3);
  assert.equal(gradePowersTask(t, "2 × 2 × 2 × 2").points, .75);
  assert.equal(gradePowersTask(t, "4×2").points, 1 / 3);
  for (const text of ["8", "2³", "2^3", "2+2+2", "2×2×2×", "(2)×2×2", "2.0×2×2"]) assert.equal(gradePowersTask(t, text).points, 0);
  for (const text of ["", "2", "2^^2", "2×-2", "2×NaN", "2*".repeat(30), "2".repeat(241)]) assert.equal(parsePowersProduct(text), null);
});

test("calculation accepts grouped integers and checks the zero-power case without evaluating expressions", () => {
  const t = task("evaluate", 12, 6);
  for (const text of ["2985984", "2 985 984", "2\u00a0985\u00a0984", " 2\u202f985\u202f984 "]) assert.equal(gradePowersTask(t, text).points, 1);
  for (const text of ["12^6", "12×6", "72", "2,985,984", "2 98 5984", "2985984.1", "Infinity", "=2985984"]) assert.equal(gradePowersTask(t, text).points, 0);
  assert.equal(gradePowersTask(task("evaluate", 7, 0), "1").points, 1);
  assert.equal(gradePowersTask(task("evaluate", 7, 0), "0").points, 0);
  assert.equal(gradePowersTask(task("evaluate", 7, 1), "7").points, 1);
});

test("answer normalization is bounded and worksheet summary distinguishes blank, wrong and partial", () => {
  assert.deepEqual(readPowersAnswer(null), { base: "", exponent: "", value: "" });
  assert.deepEqual(readPowersAnswer({ base: 2, exponent: {}, value: [] }), { base: "", exponent: "", value: "" });
  assert.equal(readPowersAnswer({ base: "1".repeat(40), exponent: "2".repeat(40), value: "x".repeat(500) }).value.length, 240);
  const sheet = generatePowersWorksheet({ ...defaults, taskCount: 4 });
  const answers = { [sheet.tasks[0].id]: answerFor(sheet.tasks[0]), [sheet.tasks[1].id]: { value: "wrong" } };
  const grade = gradePowersWorksheet(sheet, answers);
  assert.equal(grade.correctAuto, 1); assert.equal(grade.wrongAuto, 1); assert.equal(grade.unansweredAuto, 2); assert.equal(grade.percentAuto, 25);
  for (const t of sheet.tasks) assert.equal(gradePowersTask(t, { base: " ", exponent: "", value: " " }).isAnswered, false);
  const invalid = gradePowersTask(task("write_power"), { base: {}, exponent: [] });
  assert.equal(invalid.isAnswered, true); assert.equal(invalid.points, 0);
});

test("saved and Space snapshots preserve every setting and select the powers editor and grading type", () => {
  const sheet = generatePowersWorksheet({ ...defaults, maxBase: 12, maxExponent: 6, taskCount: 8, includeZeroExponent: true, ruleOperation: "divide", showSupport: true }, "pt", true);
  const snapshot = { title: sheet.title, contentType: "powers_worksheet", taskType: "math_powers", lessonType: "math_powers", mathWorksheet: sheet };
  assert.equal(hasSnapshotContent(snapshot), true); assert.equal(hasAssignmentSnapshotContent(snapshot), true);
  const lesson = assignmentToLesson(snapshot);
  const teacherLesson = assignmentSnapshotToLesson(snapshot);
  assert.deepEqual(lesson?.mathWorksheet, sheet); assert.deepEqual(teacherLesson?.mathWorksheet, sheet);
  const derived = getAssignmentDerivedState(lesson, snapshot);
  assert.equal(derived.isPowersAssignment, true); assert.deepEqual(derived.powersWorksheet, sheet);
  assert.equal(isFractionWorksheet(sheet), false); assert.equal(studentFractionGuard(sheet), false);
  assert.equal(mathEditorHref("pt", "saved", "powers"), "/pt/producer/math/powers?edit=saved");
  const grade = gradePowersWorksheet(sheet, Object.fromEntries(sheet.tasks.map(t => [t.id, answerFor(t)])));
  assert.deepEqual(readAutoGrade({ auto: grade })?.byTask, grade.byTask);
});

test("student fields are labelled and answers and answer key stay hidden until explicit checking", () => {
  const sheet = { ...generatePowersWorksheet({ ...defaults, taskCount: 4 }), tasks: [task("write_power"), { ...task("expand"), id: "b" }, { ...task("evaluate"), id: "c" }, { ...task("power_rules", 3, 4, "divide", 2), id: "d" }], showAnswerKey: true };
  const $ = load(renderToStaticMarkup(<View worksheet={sheet} />));
  assert.equal($("input").length, 6); assert.equal($("input[aria-label]").length, 6); assert.equal($(".length-key").length, 0); assert.equal($(".length-result").length, 0); assert.equal($("input[readonly]").length, 0);
  const checked = load(renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={Object.fromEntries(sheet.tasks.map(t => [t.id, answerFor(t)]))} readOnly showAutoCheck />));
  assert.equal(checked("input[readonly]").length, 6); assert.equal(checked(".length-correct").length, 4); assert.match(checked(".length-summary").text(), /100%/);
});

test("paper has six tasks per page, blank answer spaces and an optional separate key", () => {
  const sheet = generatePowersWorksheet({ ...defaults, taskCount: 13 }, "nb", true);
  const answers = Object.fromEntries(sheet.tasks.map(t => [t.id, answerFor(t)]));
  const $ = load(renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={answers} printMode />));
  assert.equal($(".length-page").length, 3); assert.deepEqual($(".length-page").map((_, el) => $(el).find(".powers-task").length).get(), [6, 6, 1]);
  assert.equal($(".length-identity").length, 1); assert.equal($("input").length, 0); assert.equal($(".length-result").length, 0); assert.equal($(".length-key > div").length, 13);
  assert.equal($(".powers-base-blank").length, sheet.tasks.filter(t => t.type === "write_power" || t.type === "power_rules").length);
  const noKey = load(renderToStaticMarkup(<View worksheet={{ ...sheet, showAnswerKey: false }} printMode />)); assert.equal(noKey(".length-key").length, 0);
});

test("support pages leave extra space and preserve consecutive numbering", () => {
  const sheet = generatePowersWorksheet({ ...defaults, taskCount: 9, showSupport: true }, "pt", true);
  const $ = load(renderToStaticMarkup(<View worksheet={sheet} printMode />));
  assert.deepEqual($(".length-page").map((_, el) => $(el).find(".powers-task").length).get(), [4, 4, 1]);
  assert.deepEqual($(".length-number").map((_, el) => $(el).text()).get(), ["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  assert.equal($(".powers-hint").length, 9);
});

test("generation API validates JSON and settings", async () => {
  for (const body of ["{", "null", "[]", "{}", JSON.stringify({ settings: { ...defaults, maxExponent: 99 } })]) {
    const response = await POST(new Request("http://localhost/api/generate-powers-worksheet", { method: "POST", body }));
    assert.equal(response.status, 400);
  }
});

test("generation API supports each language and retains zero, rule and answer-key choices", async () => {
  for (const language of ["nb", "en", "pt"]) {
    const settings = { ...defaults, includeZeroExponent: true, showSupport: true, ruleOperation: "divide" };
    const response = await POST(new Request("http://localhost/api/generate-powers-worksheet", { method: "POST", body: JSON.stringify({ settings, language, showAnswerKey: true }) }));
    assert.equal(response.status, 200); const data = await response.json();
    assert.deepEqual(data.worksheet.settings, settings); assert.equal(data.worksheet.language, language); assert.equal(data.worksheet.showAnswerKey, true); assert.ok(sanitizePowersWorksheet(data.worksheet));
  }
});
