import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { POST } from "@/app/api/generate-clock-worksheet/route";
import { CLOCK_MINUTE_STEPS, CLOCK_MODES, DEFAULT_CLOCK_SETTINGS, generateClockWorksheet, gradeClockTask, gradeClockWorksheet, sanitizeClockWorksheet } from "./worksheet";
import { clockFullPageCounts, clockPrintPages } from "./printLayout";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/clock/ClockWorksheetView").default as typeof import("../../../components/generators/math/clock/ClockWorksheetView").default;

test("full sheets reserve the first-page header and retain every clock task in order", () => {
  assert.equal(DEFAULT_CLOCK_SETTINGS.taskCount, 8);
  assert.deepEqual(clockFullPageCounts(), [8, 18, 28, 38, 48, 58]);
  assert.deepEqual(clockPrintPages([]), []);
  for (let count = 1; count <= 60; count++) {
    const tasks = Array.from({ length: count }, (_, i) => i), pages = clockPrintPages(tasks);
    assert.deepEqual(pages.flatMap(page => page.tasks), tasks);
    assert.ok(pages.every(page => page.tasks[0] === page.startIndex));
    assert.equal(pages[0].tasks.length, Math.min(count, 8));
    assert.ok(pages.slice(1, -1).every(page => page.tasks.length === 10));
  }
  for (const count of clockFullPageCounts()) {
    const pages = clockPrintPages(Array.from({ length: count }));
    assert.equal(pages[0].tasks.length, 8);
    assert.ok(pages.slice(1).every(page => page.tasks.length === 10));
  }
});

test("paper keeps continuous numbering, blank drawing faces, day periods and a separate key", () => {
  for (const taskType of CLOCK_MODES) {
    const worksheet = generateClockWorksheet({ ...DEFAULT_CLOCK_SETTINGS, taskType, timeFormat: "24h", minuteStep: 1, allowMidnight: true, taskCount: 28, showSupport: true }, "pt", true);
    const $ = load(renderToStaticMarkup(<View worksheet={worksheet} printMode />));
    assert.deepEqual($(".length-page").toArray().map(page => $(page).find(".clock-task").length), [8, 10, 10]);
    assert.deepEqual($(".length-number").toArray().map(el => Number($(el).text())), Array.from({ length: 28 }, (_, i) => i + 1));
    assert.equal($(".length-brand, .length-identity").length, 2);
    assert.equal($(".clock-paper-answer").length, worksheet.tasks.filter(task => task.type !== "draw_hands").length);
    assert.equal($(".clock-face small").length, worksheet.tasks.filter(task => task.type === "read_analog").length);
    assert.equal($(".clock-task[data-task-type='draw_hands'] [data-hand]").length, 0);
    assert.equal($(".length-page .clock-key").length, 0);
    assert.equal($(".clock-key-item").length, 28);
    assert.equal($("input, select, .length-result").length, 0);
  }
});

test("saved custom counts retain digital controls, grading and partial credit for the two hands", () => {
  for (const taskType of CLOCK_MODES) for (const taskCount of [6, 16, 60]) {
    const original = generateClockWorksheet({ ...DEFAULT_CLOCK_SETTINGS, taskType, taskCount, timeFormat: "24h", minuteStep: 1, allowMidnight: true, maxDuration: 360, showSupport: true }, "en", true);
    const worksheet = sanitizeClockWorksheet(JSON.parse(JSON.stringify(original)))!;
    assert.deepEqual(worksheet, original);
    const answers = Object.fromEntries(worksheet.tasks.map(task => {
      const answer = gradeClockTask(task, undefined, worksheet.settings).correctAnswer;
      return [task.id, typeof answer === "number" ? String(answer) : answer];
    }));
    assert.equal(gradeClockWorksheet(worksheet, answers).percentAuto, 100);
    const handTasks = worksheet.tasks.filter(task => task.type === "draw_hands");
    const partialAnswers = { ...answers };
    for (const task of handTasks) partialAnswers[task.id] = { hour: String(Math.floor(task.timeMinutes / 60) % 12 || 12), minute: "" };
    const partial = gradeClockWorksheet(worksheet, partialAnswers);
    assert.equal(partial.partialAuto, handTasks.length);
    assert.equal(partial.percentAuto, Math.round((taskCount - handTasks.length / 2) / taskCount * 100));
    const student = load(renderToStaticMarkup(<View worksheet={worksheet} />));
    assert.equal(student(".length-page").length, 1);
    assert.equal(student("select").length, handTasks.length * 2);
    assert.equal(student("input").length, taskCount - handTasks.length);
    assert.equal(student(".length-key, .length-result").length, 0);
    const teacher = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} readOnly showAutoCheck />));
    assert.equal(teacher("select[disabled]").length, handTasks.length * 2);
    assert.equal(teacher("input[readonly]").length, taskCount - handTasks.length);
    assert.equal(teacher(".length-summary").length, 1);
    assert.equal(teacher(".length-correct").length, taskCount);
  }
});

test("generation API accepts full sheets in every language, mode, interval and time format", async () => {
  for (const language of ["nb", "en", "pt"]) for (const taskType of CLOCK_MODES) for (const minuteStep of CLOCK_MINUTE_STEPS) for (const timeFormat of ["12h", "24h"] as const) for (const showSupport of [false, true]) {
    const settings = { ...DEFAULT_CLOCK_SETTINGS, taskType, minuteStep, timeFormat, showSupport, allowMidnight: true, maxDuration: 360, taskCount: 18 };
    const response = await POST(new Request("http://localhost/api/generate-clock-worksheet", { method: "POST", body: JSON.stringify({ settings, language, showAnswerKey: true }) }));
    assert.equal(response.status, 200);
    const { worksheet } = await response.json();
    assert.deepEqual(worksheet.settings, settings);
    assert.equal(worksheet.language, language);
    assert.equal(worksheet.showAnswerKey, true);
    assert.deepEqual(sanitizeClockWorksheet(worksheet), worksheet);
    assert.equal(new Set(worksheet.tasks.map((task: { id: string }) => task.id)).size, 18);
  }
});
