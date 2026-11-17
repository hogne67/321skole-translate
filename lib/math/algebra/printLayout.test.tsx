import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { POST } from "@/app/api/generate-algebra-worksheet/route";
import { DEFAULT_ALGEBRA_SETTINGS as defaults, ALGEBRA_LEVELS, generateAlgebraWorksheet, gradeAlgebraTask, gradeAlgebraWorksheet, algebraTaskAnswer, sanitizeAlgebraWorksheet } from "./worksheet";
import { algebraPageCapacity, algebraFullPageCounts, algebraCountAfterOptionsChange, algebraPrintPages } from "./printLayout";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/algebra/AlgebraWorksheetView").default as typeof import("../../../components/generators/math/algebra/AlgebraWorksheetView").default;

test("full algebra sheets account for parentheses, mixed expressions, hints and the first-page header", () => {
  assert.equal(defaults.taskCount, 20);
  assert.deepEqual(algebraFullPageCounts(defaults), [20, 44]);
  assert.deepEqual(algebraPageCapacity({ ...defaults, includeParentheses: false }), { first: 24, following: 30 });
  assert.deepEqual(algebraPageCapacity({ ...defaults, showSupport: true }), { first: 14, following: 16 });
  assert.deepEqual(algebraPageCapacity({ ...defaults, level: "mixed" }), { first: 16, following: 20 });
  assert.deepEqual(algebraPageCapacity({ ...defaults, level: "mixed", showSupport: true }), { first: 12, following: 14 });
  assert.deepEqual(algebraPrintPages([], defaults), []);
  for (const level of ALGEBRA_LEVELS) for (const showSupport of [false, true]) for (const includeParentheses of [false, true]) {
    const options = { level, showSupport, includeParentheses }, capacity = algebraPageCapacity(options), counts = algebraFullPageCounts(options);
    for (let count = 1; count <= 60; count++) {
      const tasks = Array.from({ length: count }, (_, i) => i), pages = algebraPrintPages(tasks, options);
      assert.deepEqual(pages.flatMap(page => page.tasks), tasks);
      assert.ok(pages.every(page => page.startIndex === page.tasks[0]));
      assert.equal(pages[0].tasks.length, Math.min(count, capacity.first));
    }
    for (const count of counts) {
      const pages = algebraPrintPages(Array.from({ length: count }), options);
      assert.equal(pages[0].tasks.length, capacity.first);
      assert.ok(pages.slice(1).every(page => page.tasks.length === capacity.following));
    }
    assert.equal(algebraCountAfterOptionsChange(44, defaults, options, false), counts[1]);
    assert.equal(algebraCountAfterOptionsChange(25, defaults, options, true), 25);
    assert.equal(algebraCountAfterOptionsChange(8, defaults, options, false), 8);
    const previous = { ...defaults, level: "mixed" as const, showSupport: true };
    assert.equal(algebraCountAfterOptionsChange(54, previous, options, false), counts[Math.min(3, counts.length - 1)]);
  }
});

test("paper has complete first and following sheets, consecutive numbers, blank answers and a separate optional key", () => {
  for (const level of ALGEBRA_LEVELS) for (const showSupport of [false, true]) for (const includeParentheses of [false, true]) {
    const options = { ...defaults, level, showSupport, includeParentheses, allowNegative: true, maxCoefficient: 12 }, worksheet = generateAlgebraWorksheet({ ...options, taskCount: algebraFullPageCounts(options)[1] }, "pt", true), capacity = algebraPageCapacity(options);
    const $ = load(renderToStaticMarkup(<View worksheet={worksheet} printMode />));
    assert.deepEqual($(".length-page").toArray().map(page => $(page).find(".algebra-task").length), [capacity.first, capacity.following]);
    assert.deepEqual($(".length-number").toArray().map(el => Number($(el).text())), Array.from({ length: worksheet.tasks.length }, (_, i) => i + 1));
    assert.equal($(".length-brand, .length-identity").length, 2);
    assert.equal($(".algebra-answer-space").length, worksheet.tasks.length);
    assert.equal($(".algebra-hint").length, showSupport ? worksheet.tasks.length : 0);
    assert.equal($(".length-page .algebra-key, input, button, output, .length-result").length, 0);
    assert.equal($(".algebra-key > div").length, worksheet.tasks.length);
    assert.equal(load(renderToStaticMarkup(<View worksheet={{ ...worksheet, showAnswerKey: false }} printMode />))(".algebra-key").length, 0);
  }
});

test("old saved counts retain all choices, digital symbols and exact partial credit", () => {
  for (const level of ALGEBRA_LEVELS) for (const taskCount of [4, 8, 16, 60]) {
    const original = generateAlgebraWorksheet({ ...defaults, level, maxCoefficient: 12, taskCount, showSupport: true, allowNegative: true }, "en", true);
    const worksheet = sanitizeAlgebraWorksheet(JSON.parse(JSON.stringify(original)))!;
    assert.deepEqual(worksheet, original);
    const answers = Object.fromEntries(worksheet.tasks.map(task => [task.id, algebraTaskAnswer(task)]));
    assert.equal(gradeAlgebraWorksheet(worksheet, answers).percentAuto, 100);
    for (const task of worksheet.tasks) {
      const grade = gradeAlgebraTask(task, task.expression);
      assert.ok(grade.points === .5 || grade.points === 1);
    }
    const student = load(renderToStaticMarkup(<View worksheet={worksheet} />));
    assert.equal(student(".length-page").length, 1);
    assert.equal(student(".length-key, .length-result").length, 0);
    assert.equal(student("button[aria-label]").length, taskCount * 8);
    assert.equal(new Set(student("input").toArray().map(el => student(el).attr("id"))).size, taskCount);
    assert.ok(student("input").toArray().every(el => student(el).attr("value") === ""));
    const teacher = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} readOnly showAutoCheck />));
    assert.equal(teacher(".length-summary").length, 1);
    assert.equal(teacher(".length-correct").length, taskCount);
    assert.equal(teacher("input:not([readonly]), button").length, 0);
  }
});

test("generation API returns complete algebra sheets for every level and option in three languages", async () => {
  for (const language of ["nb", "en", "pt"]) for (const level of ALGEBRA_LEVELS) for (const maxCoefficient of [2, 6, 12]) for (const showSupport of [false, true]) for (const includeSquares of [false, true]) for (const includeParentheses of [false, true]) for (const allowNegative of [false, true]) {
    const options = { ...defaults, level, maxCoefficient, showSupport, includeSquares, includeParentheses, allowNegative }, settings = { ...options, taskCount: algebraFullPageCounts(options)[1] };
    const response = await POST(new Request("http://localhost/api/generate-algebra-worksheet", { method: "POST", body: JSON.stringify({ settings, language, showAnswerKey: true }) }));
    assert.equal(response.status, 200);
    const { worksheet } = await response.json();
    assert.deepEqual(worksheet.settings, settings);
    assert.equal(worksheet.language, language);
    assert.equal(worksheet.showAnswerKey, true);
    assert.deepEqual(sanitizeAlgebraWorksheet(worksheet), worksheet);
    assert.equal(new Set(worksheet.tasks.map((task: { id: string }) => task.id)).size, settings.taskCount);
  }
});
