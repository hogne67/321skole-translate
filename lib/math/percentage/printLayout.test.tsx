import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { POST } from "@/app/api/generate-percentage-worksheet/route";
import { DEFAULT_PERCENTAGE_SETTINGS, PERCENTAGE_MODES, generatePercentageWorksheet, gradePercentageTask, gradePercentageWorksheet, isPercentageChange, sanitizePercentageWorksheet } from "./worksheet";
import { percentagePageCapacity, percentageFullPageCounts, percentageCountAfterOptionsChange, percentagePrintPages } from "./printLayout";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/percentage/PercentageWorksheetView").default as typeof import("../../../components/generators/math/percentage/PercentageWorksheetView").default;

test("full-sheet counts reserve the first-page header and preserve exact custom counts", () => {
  assert.equal(DEFAULT_PERCENTAGE_SETTINGS.taskCount, 14);
  assert.deepEqual(percentagePageCapacity(DEFAULT_PERCENTAGE_SETTINGS), { first: 14, following: 16 });
  assert.deepEqual(percentagePageCapacity({ ...DEFAULT_PERCENTAGE_SETTINGS, showSupport: false }), { first: 16, following: 18 });
  assert.deepEqual(percentageFullPageCounts(DEFAULT_PERCENTAGE_SETTINGS).slice(0, 4), [14, 30, 46, 62]);
  assert.deepEqual(percentagePrintPages([], DEFAULT_PERCENTAGE_SETTINGS), []);
  for (const taskType of PERCENTAGE_MODES) for (const showSupport of [false, true]) for (const showConclusion of [false, true]) {
    const options = { taskType, showSupport, showConclusion }, capacity = percentagePageCapacity(options);
    for (let count = 1; count <= 200; count++) {
      const tasks = Array.from({ length: count }, (_, i) => i), pages = percentagePrintPages(tasks, options);
      assert.deepEqual(pages.flatMap(page => page.tasks), tasks);
      assert.ok(pages.every(page => page.tasks[0] === page.startIndex));
    }
    for (const count of percentageFullPageCounts(options)) {
      const pages = percentagePrintPages(Array.from({ length: count }), options);
      assert.equal(pages[0].tasks.length, capacity.first);
      assert.ok(pages.slice(1).every(page => page.tasks.length === capacity.following));
    }
    const twoSheets = percentageFullPageCounts(options)[1];
    assert.equal(percentageCountAfterOptionsChange(30, DEFAULT_PERCENTAGE_SETTINGS, options, false), twoSheets);
    assert.equal(percentageCountAfterOptionsChange(37, DEFAULT_PERCENTAGE_SETTINGS, options, true), 37);
  }
});

test("API generates full sheets for every type, support option, sentence option and language", async () => {
  for (const language of ["nb", "en", "pt"]) for (const taskType of PERCENTAGE_MODES) for (const showSupport of [false, true]) for (const showConclusion of [false, true]) {
    const options = { ...DEFAULT_PERCENTAGE_SETTINGS, taskType, showSupport, showConclusion }, taskCount = percentageFullPageCounts(options)[1];
    const settings = { ...options, taskCount };
    const response = await POST(new Request("http://localhost/api/generate-percentage-worksheet", { method: "POST", body: JSON.stringify({ settings, language, showAnswerKey: true }) }));
    assert.equal(response.status, 200);
    const { worksheet } = await response.json();
    assert.deepEqual(worksheet.settings, settings);
    assert.equal(worksheet.language, language);
    assert.equal(worksheet.tasks.length, taskCount);
    assert.equal(worksheet.showAnswerKey, true);
    assert.equal(new Set(worksheet.tasks.map((task: { id: string }) => task.id)).size, taskCount);
    assert.deepEqual(sanitizePercentageWorksheet(worksheet), worksheet);
  }
  for (const taskCount of [1, 200, 201]) {
    const response = await POST(new Request("http://localhost/api/generate-percentage-worksheet", { method: "POST", body: JSON.stringify({ settings: { ...DEFAULT_PERCENTAGE_SETTINGS, taskCount } }) }));
    assert.equal(response.status, taskCount === 201 ? 400 : 200);
  }
});

test("paper numbering, calculation boxes, sentence lines and answer keys stay complete", () => {
  for (const taskType of ["mixed", "discount"] as const) {
    const settings = { ...DEFAULT_PERCENTAGE_SETTINGS, taskType, showConclusion: taskType === "discount", taskCount: taskType === "discount" ? 20 : 30 };
    const worksheet = generatePercentageWorksheet(settings, "nb", true), $ = load(renderToStaticMarkup(<View worksheet={worksheet} printMode />));
    assert.deepEqual($(".length-page").toArray().map(page => $(page).find(".percentage-task").length), taskType === "discount" ? [10, 10] : [14, 16]);
    assert.deepEqual($(".length-number").toArray().map(el => Number($(el).text())), Array.from({ length: settings.taskCount }, (_, i) => i + 1));
    assert.equal($(".length-brand, .length-identity").length, 2);
    assert.equal($(".percentage-blank").length, settings.taskCount * (taskType === "discount" ? 6 : 4));
    assert.equal($(".percentage-conclusion-line").length, taskType === "discount" ? 20 : 0);
    assert.equal($(".length-page .length-key").length, 0);
    assert.equal($(".percentage-key-task").length, settings.taskCount);
    assert.equal($("input, textarea, .percentage-feedback").length, 0);
  }
});

test("old and new saved counts keep settings, digital answers, sentences and partial credit", () => {
  for (const taskType of PERCENTAGE_MODES) for (const taskCount of [8, 10, 12, 100, 200]) {
    const original = generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, taskType, taskCount, showSupport: false, showConclusion: true }, "pt", true);
    const worksheet = sanitizePercentageWorksheet(JSON.parse(JSON.stringify(original)))!;
    assert.deepEqual(worksheet, original);
    const answers = Object.fromEntries(worksheet.tasks.map(task => [task.id, { ...gradePercentageTask(task, null).correctAnswer, conclusion: "Resposta com uma frase." }]));
    assert.equal(gradePercentageWorksheet(worksheet, answers).percentAuto, 100);
    const partial = Object.fromEntries(worksheet.tasks.map(task => [task.id, isPercentageChange(task.type) ? { finalValue: String(task.type === "discount" ? task.whole - task.part : task.whole + task.part) } : task.type === "find_percentage" ? { percent: String(task.percent) } : { result: String(task.type === "find_whole" ? task.whole : task.part) }]));
    assert.equal(gradePercentageWorksheet(worksheet, partial).percentAuto, isPercentageChange(taskType) ? 25 : 50);
    const $ = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} readOnly showAutoCheck />));
    assert.equal($(".length-page").length, 1);
    assert.equal($("input[readonly]").length, taskCount * (isPercentageChange(taskType) ? 6 : 4));
    assert.equal($("textarea[readonly]").length, taskCount);
    assert.ok($("textarea").toArray().every(el => $(el).text() === "Resposta com uma frase."));
    assert.equal($(".length-key").length, 0);
  }
});
