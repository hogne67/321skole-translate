import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { POST } from "@/app/api/generate-equation-worksheet/route";
import { DEFAULT_EQUATION_SETTINGS, EQUATION_MODES, generateEquationWorksheet, equationSolution, equationSteps, gradeEquationTask, gradeEquationWorksheet, sanitizeEquationWorksheet } from "./worksheet";
import { equationPageCapacity, equationFullPageCounts, equationCountAfterOptionsChange, equationPrintPages } from "./printLayout";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/equations/EquationWorksheetView").default as typeof import("../../../components/generators/math/equations/EquationWorksheetView").default;

test("full sheets reserve the first-page header, with room for each equation's steps", () => {
  assert.equal(DEFAULT_EQUATION_SETTINGS.taskCount, 18);
  assert.deepEqual(equationPageCapacity({ taskType: "add" }), { first: 18, following: 20 });
  assert.deepEqual(equationPageCapacity({ taskType: "multiply" }), { first: 16, following: 18 });
  assert.deepEqual(equationPageCapacity({ taskType: "divide" }), { first: 14, following: 16 });
  assert.deepEqual(equationPageCapacity({ taskType: "multiply_add" }), { first: 10, following: 12 });
  assert.deepEqual(equationPageCapacity({ taskType: "fraction" }), { first: 6, following: 8 });
  assert.deepEqual(equationFullPageCounts({ taskType: "add" }).slice(0, 4), [18, 38, 58, 78]);
  assert.deepEqual(equationPrintPages([], DEFAULT_EQUATION_SETTINGS), []);
  for (const taskType of EQUATION_MODES) {
    const options = { taskType }, capacity = equationPageCapacity(options);
    for (let count = 1; count <= 200; count++) {
      const tasks = Array.from({ length: count }, (_, i) => i), pages = equationPrintPages(tasks, options);
      assert.deepEqual(pages.flatMap(page => page.tasks), tasks);
      assert.ok(pages.every(page => page.tasks[0] === page.startIndex));
    }
    for (const count of equationFullPageCounts(options)) {
      const pages = equationPrintPages(Array.from({ length: count }), options);
      assert.equal(pages[0].tasks.length, capacity.first);
      assert.ok(pages.slice(1).every(page => page.tasks.length === capacity.following));
    }
    assert.equal(equationCountAfterOptionsChange(38, DEFAULT_EQUATION_SETTINGS, options, false), equationFullPageCounts(options)[1]);
    assert.equal(equationCountAfterOptionsChange(37, DEFAULT_EQUATION_SETTINGS, options, true), 37);
  }
});

test("API supports full sheets for every type, language, support and number option", async () => {
  for (const language of ["nb", "en", "pt"]) for (const taskType of EQUATION_MODES) for (const showSupport of [false, true]) for (const signedDecimals of [false, true]) {
    const settings = { ...DEFAULT_EQUATION_SETTINGS, taskType, showSupport, allowNegative: signedDecimals, allowDecimals: signedDecimals, minimum: signedDecimals ? -100 : 1, maximum: 100, taskCount: equationFullPageCounts({ taskType })[1] };
    const response = await POST(new Request("http://localhost/api/generate-equation-worksheet", { method: "POST", body: JSON.stringify({ settings, language, showAnswerKey: true }) }));
    assert.equal(response.status, 200);
    const { worksheet } = await response.json();
    assert.deepEqual(worksheet.settings, settings);
    assert.equal(worksheet.language, language);
    assert.equal(worksheet.tasks.length, settings.taskCount);
    assert.equal(worksheet.showAnswerKey, true);
    assert.equal(new Set(worksheet.tasks.map((task: { id: string }) => task.id)).size, settings.taskCount);
    assert.deepEqual(sanitizeEquationWorksheet(worksheet), worksheet);
    for (const task of worksheet.tasks) assert.ok(equationSolution(task).compare(settings.minimum) >= 0 && equationSolution(task).compare(settings.maximum) <= 0);
  }
  for (const taskCount of [1, 200, 201]) {
    const response = await POST(new Request("http://localhost/api/generate-equation-worksheet", { method: "POST", body: JSON.stringify({ settings: { ...DEFAULT_EQUATION_SETTINGS, taskCount } }) }));
    assert.equal(response.status, taskCount === 201 ? 400 : 200);
  }
});

test("print pages retain numbering, calculation steps and a separate method key", () => {
  for (const [taskType, taskCount, expectedPages] of [["add", 38, [18, 20]], ["multiply_add", 22, [10, 12]], ["fraction", 14, [6, 8]]] as const) {
    const worksheet = generateEquationWorksheet({ ...DEFAULT_EQUATION_SETTINGS, taskType, taskCount }, "nb", true), $ = load(renderToStaticMarkup(<View worksheet={worksheet} printMode />));
    assert.deepEqual($(".length-page").toArray().map(page => $(page).find(".equation-task").length), expectedPages);
    assert.deepEqual($(".length-number").toArray().map(el => Number($(el).text())), Array.from({ length: taskCount }, (_, i) => i + 1));
    assert.equal($(".length-brand, .length-identity").length, 2);
    assert.equal($(".equation-step").length, worksheet.tasks.reduce((sum, task) => sum + equationSteps(task).length, 0));
    assert.equal($(".length-page .equation-key").length, 0);
    assert.equal($(".equation-key > div > div").length, taskCount);
    assert.equal($("input, select, .equation-feedback").length, 0);
  }
});

test("old and new saved counts retain digital answers, method fields and partial credit", () => {
  for (const taskType of EQUATION_MODES) for (const taskCount of [4, 8, 100, 200]) {
    const original = generateEquationWorksheet({ ...DEFAULT_EQUATION_SETTINGS, taskType, taskCount, minimum: -100, maximum: 100, allowNegative: true, allowDecimals: true }, "pt", true);
    const worksheet = sanitizeEquationWorksheet(JSON.parse(JSON.stringify(original)))!;
    assert.deepEqual(worksheet, original);
    const answers = Object.fromEntries(worksheet.tasks.map(task => [task.id, gradeEquationTask(task, null).correctAnswer]));
    assert.equal(gradeEquationWorksheet(worksheet, answers).percentAuto, 100);
    const methodOnly = Object.fromEntries(worksheet.tasks.map(task => [task.id, { steps: answers[task.id].steps.map(step => ({ ...step, right: "" })) }]));
    assert.equal(gradeEquationWorksheet(worksheet, methodOnly).percentAuto, 50);
    const $ = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} readOnly showAutoCheck />));
    const steps = worksheet.tasks.flatMap(task => equationSteps(task));
    assert.equal($(".length-page").length, 1);
    assert.equal($("input[readonly]").length, steps.reduce((sum, step) => sum + 2 + Number(!!step.collectX) + 2 * Number(!!step.expand), 0));
    assert.equal($("select[disabled]").length, steps.length + steps.filter(step => step.collectX).length);
    assert.equal($(".equation-key").length, 0);
  }
});
