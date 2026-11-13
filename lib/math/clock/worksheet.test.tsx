import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { CLOCK_MINUTE_STEPS, CLOCK_MODES, CLOCK_TASKS_PER_PAGE, DEFAULT_CLOCK_SETTINGS as defaults, clockDuration, clockHandAngles, clockTaskPrompt, formatClockTime, generateClockWorksheet, getClockCopy, gradeClockTask, gradeClockWorksheet, normalizeClockSettings, parseClockTime, sanitizeClockWorksheet, type ClockTask } from "./worksheet";
import { POST } from "@/app/api/generate-clock-worksheet/route";
import { getAssignmentDerivedState } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/assignmentDerivedState";
import { assignmentToLesson, hasSnapshotContent } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/helpers";
import { assignmentSnapshotToLesson, hasAssignmentSnapshotContent, isFractionWorksheet, isMathWorksheet, readAutoGrade } from "@/lib/submissions/readers";
import { isFractionWorksheet as studentFractionGuard } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/worksheetTypeGuards";
import { mathEditorHref } from "../editor";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/clock/ClockWorksheetView").default as typeof import("@/components/generators/math/clock/ClockWorksheetView").default;
const Diagram = require("../../../components/generators/math/clock/ClockDiagram").default as typeof import("@/components/generators/math/clock/ClockDiagram").default;

for (const timeFormat of ["12h", "24h"] as const) test(`${timeFormat}: every mode and minute interval round-trips with balanced task types and correct grading`, () => {
  for (const minuteStep of CLOCK_MINUTE_STEPS) for (const taskType of CLOCK_MODES) for (const allowMidnight of [true, false]) {
    const worksheet = generateClockWorksheet({ ...defaults, timeFormat, minuteStep, taskType, allowMidnight, taskCount: 17 }, "pt", true);
    assert.deepEqual(sanitizeClockWorksheet(JSON.parse(JSON.stringify(worksheet))), worksheet);
    assert.equal(new Set(worksheet.tasks.map(task => task.id)).size, 17);
    const answers = Object.fromEntries(worksheet.tasks.map(task => [task.id, task.type === "elapsed" ? String(clockDuration(task)) : task.type === "draw_hands" ? { hour: String(Math.floor(task.timeMinutes / 60) % 12 || 12), minute: String(task.timeMinutes % 60) } : formatClockTime(task.timeMinutes, timeFormat)]));
    assert.equal(gradeClockWorksheet(worksheet, answers).percentAuto, 100);
    if (taskType === "mixed") {
      const counts = ["read_analog", "draw_hands", "elapsed"].map(type => worksheet.tasks.filter(task => task.type === type).length);
      assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
    } else assert.ok(worksheet.tasks.every(task => task.type === taskType));
    assert.ok(worksheet.tasks.every(task => task.type !== "elapsed" || allowMidnight || task.endMinutes > task.startMinutes));
  }
});

test("invalid settings fail before generating and deterministic randomness has bounded retries", () => {
  for (const patch of [{ taskType: "other" }, { minuteStep: 10 }, { timeFormat: "am" }, { taskCount: 0 }, { taskCount: 61 }, { taskCount: NaN }, { maxDuration: 0 }, { maxDuration: 90 }, { maxDuration: 420 }, { showSupport: 1 }, { allowMidnight: "true" }]) assert.throws(() => normalizeClockSettings({ ...defaults, ...patch }), /INVALID_/);
  assert.equal(generateClockWorksheet({ ...defaults, taskCount: 60 }, "en", false, () => 0).tasks.length, 60);
});

test("the hour hand moves continuously, including half past and midnight", () => {
  assert.deepEqual(clockHandAngles(210), { hour: 105, minute: 180 });
  assert.deepEqual(clockHandAngles(0), { hour: 0, minute: 0 });
  assert.deepEqual(clockHandAngles(1439), { hour: 359.5, minute: 354 });
  const $ = load(renderToStaticMarkup(<Diagram hour={3} minute={30} language="nb" />));
  assert.equal($("[data-hand='hour']").attr("transform"), "rotate(105 110 110)");
  assert.equal($("[data-hand='minute']").attr("transform"), "rotate(180 110 110)");
});

const read: ClockTask = { id: "read", type: "read_analog", timeMinutes: 930 };
const draw: ClockTask = { id: "draw", type: "draw_hands", timeMinutes: 210 };
test("reading accepts equivalent 12-hour times and requires the correct period in 24-hour format", () => {
  for (const answer of ["3:30", "03:30", "15:30", " 3.30 "]) assert.equal(gradeClockTask(read, answer, defaults).isCorrect, true);
  assert.equal(gradeClockTask(read, "15:30", { ...defaults, timeFormat: "24h" }).isCorrect, true);
  assert.equal(gradeClockTask(read, "3:30", { ...defaults, timeFormat: "24h" }).isCorrect, false);
  for (const answer of ["24:00", "3:60", "3:3", "-3:30", "3:30abc", {}, [], 930]) assert.equal(gradeClockTask(read, answer, defaults).isCorrect, false);
  assert.equal(parseClockTime("00:00"), 0);
  assert.equal(gradeClockTask({ ...read, timeMinutes: 0 }, "12:00", defaults).isCorrect, true);
});

test("drawing grades the two hands independently and distinguishes blank, partial and wrong answers", () => {
  assert.equal(gradeClockTask(draw, { hour: "3", minute: "30" }, defaults).points, 1);
  for (const answer of [{ hour: "3", minute: "0" }, { hour: "4", minute: "30" }, { hour: "", minute: "30" }]) {
    const result = gradeClockTask(draw, answer, defaults);
    assert.equal(result.points, .5); assert.equal(result.isPartial, true);
  }
  assert.equal(gradeClockTask(draw, { hour: "15", minute: "60" }, defaults).points, 0);
  for (const answer of [undefined, null, "", {}, { hour: "", minute: "" }]) assert.equal(gradeClockTask(draw, answer, defaults).isAnswered, false);
  assert.equal(gradeClockTask(draw, "wrong", defaults).isAnswered, true);
  const worksheet = { ...generateClockWorksheet({ ...defaults, taskCount: 3 }), tasks: [draw, read, { ...read, id: "blank" }] };
  const grade = gradeClockWorksheet(worksheet, { draw: { hour: "3", minute: "" }, read: "bad" });
  assert.deepEqual([grade.partialAuto, grade.wrongAuto, grade.unansweredAuto, grade.percentAuto], [1, 1, 1, 17]);
});

test("elapsed time crosses noon and midnight correctly and explicitly names the following day", () => {
  for (const startMinutes of [690, 1410]) {
    const task: ClockTask = { id: "elapsed", type: "elapsed", startMinutes, endMinutes: (startMinutes + 90) % 1440 };
    assert.equal(clockDuration(task), 90);
    assert.equal(gradeClockTask(task, "90", defaults).isCorrect, true);
    for (const answer of ["1:30", "90 min", "-90", "90abc", 90]) assert.equal(gradeClockTask(task, answer, defaults).isCorrect, false);
    assert.equal(clockTaskPrompt(task, defaults, "nb").includes(getClockCopy("nb").nextDay), startMinutes === 1410);
  }
});

test("sanitization strips forged answers and rejects damaged times, IDs, types and midnight settings", () => {
  const sheet = generateClockWorksheet({ ...defaults, taskType: "read_analog" });
  assert.deepEqual(sanitizeClockWorksheet({ ...sheet, title: "forged", tasks: sheet.tasks.map(task => ({ ...task, answer: "forged" })) }), sheet);
  for (const patch of [{ id: "bad/id" }, { id: sheet.tasks[1].id }, { timeMinutes: -1 }, { timeMinutes: 1440 }, { timeMinutes: 1 }, { type: "draw_hands" }]) assert.equal(sanitizeClockWorksheet({ ...sheet, tasks: [{ ...sheet.tasks[0], ...patch }, ...sheet.tasks.slice(1)] }), null);
  assert.equal(sanitizeClockWorksheet({ ...sheet, tasks: [] }), null);
  const elapsed = { ...sheet, settings: { ...defaults, taskType: "elapsed", taskCount: 1 }, tasks: [{ id: "cross", type: "elapsed", startMinutes: 1410, endMinutes: 60 }] };
  assert.equal(sanitizeClockWorksheet(elapsed), null);
  assert.ok(sanitizeClockWorksheet({ ...elapsed, settings: { ...elapsed.settings, allowMidnight: true } }));
  assert.equal(sanitizeClockWorksheet({ ...elapsed, tasks: [{ id: "same", type: "elapsed", startMinutes: 60, endMinutes: 60 }] }), null);
});

test("Space snapshots retain all settings, tasks and partial grades without becoming geometry or fractions", () => {
  const worksheet = generateClockWorksheet({ ...defaults, minuteStep: 1, timeFormat: "24h", allowMidnight: true, showSupport: true }, "pt", true);
  const assignment = { mathWorksheet: worksheet, mathType: "clock", contentType: "clock_worksheet" };
  assert.ok(hasSnapshotContent(assignment)); assert.ok(hasAssignmentSnapshotContent(assignment));
  const derived = getAssignmentDerivedState(assignmentToLesson(assignment), assignment);
  assert.deepEqual(derived.clockWorksheet, worksheet); assert.equal(derived.isClockAssignment, true);
  assert.equal(derived.isGeometryAssignment, false); assert.equal(derived.isFractionAssignment, false); assert.equal(derived.isArithmeticAssignment, false);
  assert.equal(isFractionWorksheet(worksheet), false); assert.equal(studentFractionGuard(worksheet), false); assert.equal(isMathWorksheet(worksheet), false);
  assert.deepEqual(assignmentSnapshotToLesson(assignment).mathWorksheet, worksheet);
  const auto = gradeClockWorksheet(worksheet, {}); assert.deepEqual(readAutoGrade({ auto }), auto);
  assert.equal(mathEditorHref("pt", "saved", "clock"), "/pt/producer/math/clock?edit=saved");
});

test("drawing starts with blank hands and labeled empty controls, with feedback hidden until requested", () => {
  const sheet = { ...generateClockWorksheet({ ...defaults, taskType: "draw_hands", taskCount: 1 }, "nb", true), tasks: [draw] };
  const $ = load(renderToStaticMarkup(<View worksheet={sheet} />));
  assert.equal($("[data-hand]").length, 0); assert.equal($("select").length, 2);
  assert.ok($("select").toArray().every(el => $(el).attr("aria-label") && $(el).find("option[selected]").attr("value") === ""));
  assert.equal($(".length-result, .length-key").length, 0);
  assert.equal($("desc").text(), "");
  const result = load(renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={{ draw: { hour: "3", minute: "30" } }} readOnly showAutoCheck />));
  assert.equal(result("select[disabled]").length, 2); assert.equal(result(".length-correct").length, 1);
  assert.equal(result("[data-hand='hour']").attr("transform"), "rotate(105 110 110)");
});

test("24-hour reading shows the period of the day without revealing the answer as text", () => {
  const sheet = { ...generateClockWorksheet({ ...defaults, taskType: "read_analog", taskCount: 1, timeFormat: "24h" }), tasks: [read] };
  const $ = load(renderToStaticMarkup(<View worksheet={sheet} />));
  assert.ok($(".clock-face small").text().includes("12–23"));
  assert.equal($("input").attr("value"), ""); assert.equal($(".clock-task").text().includes("15:30"), false);
});

test("paper uses six tasks per page with blank drawing faces and a separate optional key", () => {
  const sheet = generateClockWorksheet({ ...defaults, taskType: "draw_hands", taskCount: 13 }, "en", true);
  const answers = Object.fromEntries(sheet.tasks.map(task => [task.id, { hour: "3", minute: "30" }]));
  const $ = load(renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={answers} printMode />));
  assert.equal($(".length-page").length, Math.ceil(13 / CLOCK_TASKS_PER_PAGE));
  assert.equal($(".clock-task").length, 13); assert.equal($("input, select, .length-result").length, 0);
  assert.equal($(".clock-task [data-hand]").length, 0); assert.equal($(".length-key").length, 1);
  assert.equal($(".clock-key-item").length, 13); assert.equal($(".clock-key [data-hand]").length, 26);
  assert.equal(load(renderToStaticMarkup(<View worksheet={{ ...sheet, showAnswerKey: false }} printMode />))(".length-key").length, 0);
});

test("localized generation API handles all modes and malformed requests", async () => {
  for (const language of ["nb", "en", "pt"]) for (const taskType of CLOCK_MODES) {
    const response = await POST(new Request("http://localhost/api/generate-clock-worksheet", { method: "POST", body: JSON.stringify({ settings: { ...defaults, taskType }, language, showAnswerKey: true }) }));
    assert.equal(response.status, 200);
    const { worksheet } = await response.json(); assert.ok(sanitizeClockWorksheet(worksheet));
    assert.equal(worksheet.title, getClockCopy(language).title); assert.equal(worksheet.showAnswerKey, true);
  }
  for (const body of [null, [], {}, { settings: { ...defaults, minuteStep: 7 } }]) assert.equal((await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }))).status, 400);
  assert.equal((await POST(new Request("http://localhost", { method: "POST", body: "{" }))).status, 400);
});
