import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { POST } from "@/app/api/generate-statistics-worksheet/route";
import { DEFAULT_STATISTICS_SETTINGS, STATISTICS_CHARTS, STATISTICS_DIFFICULTIES, STATISTICS_MODES, generateStatisticsWorksheet, gradeStatisticsTask, gradeStatisticsWorksheet, sanitizeStatisticsWorksheet } from "./worksheet";
import { statisticsPageCapacity, statisticsFullPageCounts, statisticsCountAfterOptionsChange, statisticsPrintPages } from "./printLayout";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/statistics/StatisticsWorksheetView").default as typeof import("../../../components/generators/math/statistics/StatisticsWorksheetView").default;

test("full sheets reserve the first-page header and adapt counts to diagrams, tables and explanations", () => {
  assert.equal(DEFAULT_STATISTICS_SETTINGS.taskCount, 3);
  assert.deepEqual(statisticsPageCapacity(DEFAULT_STATISTICS_SETTINGS), { first: 3, following: 4 });
  assert.deepEqual(statisticsPageCapacity({ taskType: "frequency_table", showSupport: false }), { first: 6, following: 7 });
  assert.deepEqual(statisticsPageCapacity({ taskType: "central_tendency", showSupport: false }), { first: 7, following: 8 });
  assert.deepEqual(statisticsPageCapacity({ taskType: "central_tendency", showSupport: true }), { first: 5, following: 6 });
  assert.deepEqual(statisticsFullPageCounts(DEFAULT_STATISTICS_SETTINGS).slice(0, 4), [3, 7, 11, 15]);
  assert.deepEqual(statisticsPrintPages([], DEFAULT_STATISTICS_SETTINGS), []);
  for (const taskType of STATISTICS_MODES) for (const showSupport of [false, true]) {
    const options = { taskType, showSupport }, capacity = statisticsPageCapacity(options);
    for (let count = 1; count <= 60; count++) {
      const tasks = Array.from({ length: count }, (_, i) => i), pages = statisticsPrintPages(tasks, options);
      assert.deepEqual(pages.flatMap(page => page.tasks), tasks);
      assert.ok(pages.every(page => page.tasks[0] === page.startIndex));
      assert.equal(pages[0].tasks.length, Math.min(count, capacity.first));
    }
    for (const count of statisticsFullPageCounts(options)) {
      const pages = statisticsPrintPages(Array.from({ length: count }), options);
      assert.equal(pages[0].tasks.length, capacity.first);
      assert.ok(pages.slice(1).every(page => page.tasks.length === capacity.following));
    }
    assert.equal(statisticsCountAfterOptionsChange(7, DEFAULT_STATISTICS_SETTINGS, options, false), statisticsFullPageCounts(options)[1]);
    assert.equal(statisticsCountAfterOptionsChange(6, DEFAULT_STATISTICS_SETTINGS, options, true), 6);
    assert.equal(statisticsCountAfterOptionsChange(2, DEFAULT_STATISTICS_SETTINGS, options, false), 2);
  }
  assert.equal(statisticsCountAfterOptionsChange(59, DEFAULT_STATISTICS_SETTINGS, { taskType: "central_tendency", showSupport: false }, false), 55);
});

test("paper keeps continuous numbering, complete diagrams and blank grids, with a separate key", () => {
  for (const taskType of STATISTICS_MODES) for (const showSupport of [false, true]) {
    const settings = { ...DEFAULT_STATISTICS_SETTINGS, taskType, showSupport, chartType: "mixed" as const, difficulty: "hard" as const, taskCount: statisticsFullPageCounts({ taskType, showSupport })[1] };
    const worksheet = generateStatisticsWorksheet(settings, "pt", true), capacity = statisticsPageCapacity(settings);
    const answers = Object.fromEntries(worksheet.tasks.map(task => [task.id, gradeStatisticsTask(task, undefined).correctAnswer]));
    const $ = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} printMode />));
    assert.deepEqual($(".length-page").toArray().map(page => $(page).find(".statistics-task").length), [capacity.first, capacity.following]);
    assert.deepEqual($(".length-number").toArray().map(el => Number($(el).text())), Array.from({ length: settings.taskCount }, (_, i) => i + 1));
    assert.equal($(".length-brand, .length-identity").length, 2);
    assert.equal($(".statistics-task-with-chart").length, worksheet.tasks.filter(task => task.type === "read_chart" || task.type === "draw_chart").length);
    assert.equal($(".statistics-task[data-task-type='draw_chart'] .statistics-data-mark").length, 0);
    assert.equal($(".statistics-blank-cell").length, worksheet.tasks.filter(task => task.type === "frequency_table").reduce((sum, task) => sum + task.dataset.values.length, 0));
    assert.equal($(".length-page .statistics-key").length, 0);
    assert.equal($(".statistics-key-item").length, settings.taskCount);
    assert.equal($("input, button, .length-result").length, 0);
  }
});

test("old custom counts retain settings, digital plotting and table fields, and partial credit", () => {
  for (const taskType of STATISTICS_MODES) for (const taskCount of [2, 6, 25, 60]) {
    const original = generateStatisticsWorksheet({ ...DEFAULT_STATISTICS_SETTINGS, taskType, taskCount, difficulty: "hard", chartType: "mixed", showSupport: true }, "en", true);
    const worksheet = sanitizeStatisticsWorksheet(JSON.parse(JSON.stringify(original)))!;
    assert.deepEqual(worksheet, original);
    const answers = Object.fromEntries(worksheet.tasks.map(task => [task.id, gradeStatisticsTask(task, undefined).correctAnswer]));
    assert.equal(gradeStatisticsWorksheet(worksheet, answers).percentAuto, 100);
    const entryTasks = worksheet.tasks.filter(task => task.type === "draw_chart" || task.type === "frequency_table"), partialAnswers = { ...answers };
    for (const task of entryTasks) partialAnswers[task.id] = { frequencies: task.dataset.frequencies.map((n, i) => i < 3 ? String(n) : "") };
    const partial = gradeStatisticsWorksheet(worksheet, partialAnswers);
    assert.equal(partial.partialAuto, entryTasks.length);
    assert.equal(partial.percentAuto, Math.round((taskCount - entryTasks.length / 2) / taskCount * 100));
    const student = load(renderToStaticMarkup(<View worksheet={worksheet} onAnswerChange={() => {}} />));
    const inputCount = taskCount - entryTasks.length + entryTasks.length * 6;
    assert.equal(student(".length-page").length, 1);
    assert.equal(student("input").length, inputCount);
    assert.equal(student(".statistics-plot-button").length, worksheet.tasks.filter(task => task.type === "draw_chart").length * 6);
    assert.equal(student(".length-key, .length-result").length, 0);
    const teacher = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} readOnly showAutoCheck />));
    assert.equal(teacher("input[readonly]").length, inputCount);
    assert.equal(teacher("button").length, 0);
    assert.equal(teacher(".length-summary").length, 1);
    assert.equal(teacher(".length-correct").length, taskCount);
  }
});

test("generation API accepts full sheets in each language, mode, difficulty and diagram type", async () => {
  for (const language of ["nb", "en", "pt"]) for (const taskType of STATISTICS_MODES) for (const difficulty of STATISTICS_DIFFICULTIES) for (const chartType of STATISTICS_CHARTS) for (const showSupport of [false, true]) {
    const settings = { ...DEFAULT_STATISTICS_SETTINGS, taskType, difficulty, chartType, showSupport, taskCount: statisticsFullPageCounts({ taskType, showSupport })[1] };
    const response = await POST(new Request("http://localhost/api/generate-statistics-worksheet", { method: "POST", body: JSON.stringify({ settings, language, showAnswerKey: true }) }));
    assert.equal(response.status, 200);
    const { worksheet } = await response.json();
    assert.deepEqual(worksheet.settings, settings);
    assert.equal(worksheet.language, language);
    assert.equal(worksheet.showAnswerKey, true);
    assert.deepEqual(sanitizeStatisticsWorksheet(worksheet), worksheet);
    assert.equal(new Set(worksheet.tasks.map((task: { id: string }) => task.id)).size, settings.taskCount);
  }
});
