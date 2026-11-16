import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { POST } from "@/app/api/generate-number-line-worksheet/route";
import { DEFAULT_NUMBER_LINE_SETTINGS, NUMBER_LINE_FORMS, NUMBER_LINE_MODES, NUMBER_LINE_STEPS, generateNumberLineWorksheet, gradeNumberLineWorksheet, numberLineValue, sanitizeNumberLineWorksheet } from "./worksheet";
import { numberLineFullPageCounts, numberLinePrintPages } from "./printLayout";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/number-line/NumberLineWorksheetView").default as typeof import("../../../components/generators/math/number-line/NumberLineWorksheetView").default;

test("full sheets reserve the first-page header and keep every task exactly once", () => {
  assert.equal(DEFAULT_NUMBER_LINE_SETTINGS.taskCount, 7);
  assert.deepEqual(numberLineFullPageCounts(), [7, 15, 23, 31, 39, 47, 55]);
  assert.deepEqual(numberLinePrintPages([]), []);
  for (let count = 1; count <= 60; count++) {
    const tasks = Array.from({ length: count }, (_, i) => i), pages = numberLinePrintPages(tasks);
    assert.deepEqual(pages.flatMap(page => page.tasks), tasks);
    assert.ok(pages.every(page => page.tasks[0] === page.startIndex));
    assert.equal(pages[0].tasks.length, Math.min(count, 7));
    assert.ok(pages.slice(1, -1).every(page => page.tasks.length === 8));
  }
  for (const count of numberLineFullPageCounts()) {
    const pages = numberLinePrintPages(Array.from({ length: count }));
    assert.equal(pages[0].tasks.length, 7);
    assert.ok(pages.slice(1).every(page => page.tasks.length === 8));
  }
});

test("paper retains wide diagrams, continuous numbering and a separate position key", () => {
  for (const taskType of NUMBER_LINE_MODES) for (const form of NUMBER_LINE_FORMS) {
    const worksheet = generateNumberLineWorksheet({ ...DEFAULT_NUMBER_LINE_SETTINGS, taskType, form, step: NUMBER_LINE_STEPS[form][0], minimum: -20, maximum: 20, taskCount: 23, showSupport: true }, "pt", true);
    const $ = load(renderToStaticMarkup(<View worksheet={worksheet} printMode />));
    assert.deepEqual($(".length-page").toArray().map(page => $(page).find(".number-line-task").length), [7, 8, 8]);
    assert.deepEqual($(".length-number").toArray().map(el => Number($(el).text())), Array.from({ length: 23 }, (_, i) => i + 1));
    assert.equal($(".length-brand, .length-identity").length, 2);
    assert.equal($(".number-line-graphic").length, 23);
    assert.equal($(".number-line-heading .number-line-paper-answer").length, worksheet.tasks.filter(task => task.type !== "place").length);
    assert.equal($(".length-page .number-line-key").length, 0);
    assert.equal($(".number-line-key > div > p").length, 23);
    assert.equal($("input, button, .length-result, .number-line-selection").length, 0);
  }
});

test("saved custom counts and settings retain digital fields, clickable marks and grading", () => {
  for (const taskCount of [1, 6, 12, 15, 60]) {
    const original = generateNumberLineWorksheet({ ...DEFAULT_NUMBER_LINE_SETTINGS, form: "fractions", step: "1/8", minimum: -2, maximum: 2, intervals: 8, taskCount, showSupport: true }, "en", true);
    const worksheet = sanitizeNumberLineWorksheet(JSON.parse(JSON.stringify(original)))!;
    assert.deepEqual(worksheet, original);
    const answers = Object.fromEntries(worksheet.tasks.map(task => [task.id, numberLineValue(task).toFraction()]));
    assert.equal(gradeNumberLineWorksheet(worksheet, answers).percentAuto, 100);
    const $ = load(renderToStaticMarkup(<View worksheet={worksheet} onAnswerChange={() => {}} />));
    assert.equal($(".length-page").length, 1);
    assert.equal($("input").length, taskCount);
    assert.equal($("button").length, worksheet.tasks.filter(task => task.type === "place").length * 9);
    assert.equal($(".length-key, .length-result").length, 0);
    const teacher = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} readOnly showAutoCheck />));
    assert.equal(teacher("input[readonly], .length-correct").length, taskCount * 2);
    assert.equal(teacher(".length-summary").length, 1);
    assert.equal(teacher("button").length, 0);
  }
});

test("generation API accepts full sheets in each language, mode and number form", async () => {
  for (const language of ["nb", "en", "pt"]) for (const taskType of NUMBER_LINE_MODES) for (const form of NUMBER_LINE_FORMS) for (const showSupport of [false, true]) {
    const settings = { ...DEFAULT_NUMBER_LINE_SETTINGS, taskType, form, step: NUMBER_LINE_STEPS[form][0], minimum: -1000, maximum: 1000, showSupport, taskCount: 15 };
    const response = await POST(new Request("http://localhost/api/generate-number-line-worksheet", { method: "POST", body: JSON.stringify({ settings, language, showAnswerKey: true }) }));
    assert.equal(response.status, 200);
    const { worksheet } = await response.json();
    assert.deepEqual(worksheet.settings, settings);
    assert.equal(worksheet.language, language);
    assert.equal(worksheet.showAnswerKey, true);
    assert.deepEqual(sanitizeNumberLineWorksheet(worksheet), worksheet);
    assert.equal(new Set(worksheet.tasks.map((task: { id: string }) => task.id)).size, 15);
  }
});
