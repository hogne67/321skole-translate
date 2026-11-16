import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { POST } from "@/app/api/generate-comparison-worksheet/route";
import { DEFAULT_COMPARISON_SETTINGS, generateComparisonWorksheet, gradeComparisonWorksheet, sanitizeComparisonWorksheet } from "./worksheet";
import { comparisonCountAfterSupportChange, comparisonFullPageCounts, comparisonPageCapacity, comparisonPrintPages } from "./printLayout";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/comparison/ComparisonWorksheetView").default as typeof import("../../../components/generators/math/comparison/ComparisonWorksheetView").default;
const smallPool = { ...DEFAULT_COMPARISON_SETTINGS, forms: ["fraction" as const], mode: "same" as const, denominators: [2] };

test("full-page choices and support changes preserve complete sheets and exact custom counts", () => {
  assert.deepEqual(comparisonFullPageCounts(false), [60, 129, 198]);
  assert.deepEqual(comparisonFullPageCounts(true).slice(0, 3), [14, 30, 46]);
  assert.equal(DEFAULT_COMPARISON_SETTINGS.taskCount, 60);
  for (const support of [false, true]) {
    for (let count = 1; count <= 200; count++) {
      const tasks = Array.from({ length: count }, (_, i) => i), pages = comparisonPrintPages(tasks, support);
      assert.deepEqual(pages.flatMap(page => page.tasks), tasks);
      assert.ok(pages.every(page => page.tasks[0] === page.startIndex));
    }
    assert.deepEqual(comparisonPrintPages([], support), []);
    const { first, following } = comparisonPageCapacity(support);
    for (const count of comparisonFullPageCounts(support)) {
      const pages = comparisonPrintPages(Array.from({ length: count }, (_, i) => i), support);
      assert.equal(pages[0].tasks.length, first);
      assert.ok(pages.slice(1).every(page => page.tasks.length === following));
    }
  }
  assert.equal(comparisonCountAfterSupportChange(129, false, true, false), 30);
  assert.equal(comparisonCountAfterSupportChange(30, true, false, false), 129);
  assert.equal(comparisonCountAfterSupportChange(190, true, false, false), 198);
  for (const count of [12, 36, 100, 200]) assert.equal(comparisonCountAfterSupportChange(count, false, true, true), count);
});

test("API accepts complete sheets and custom counts in all languages and both support modes", async () => {
  for (const language of ["nb", "en", "pt"]) for (const visualSupport of [false, true]) {
    for (const taskCount of [1, ...comparisonFullPageCounts(visualSupport).slice(0, 2), 200]) {
      const settings = { ...smallPool, visualSupport, taskCount };
      const response = await POST(new Request("http://localhost/api/generate-comparison-worksheet", { method: "POST", body: JSON.stringify({ settings, language, showAnswerKey: true }) }));
      assert.equal(response.status, 200);
      const { worksheet } = await response.json();
      assert.deepEqual(worksheet.settings, settings);
      assert.equal(worksheet.language, language);
      assert.equal(worksheet.tasks.length, taskCount);
      assert.equal(worksheet.showAnswerKey, true);
      assert.equal(new Set(worksheet.tasks.map((task: { id: string }) => task.id)).size, taskCount);
    }
  }
  const response = await POST(new Request("http://localhost/api/generate-comparison-worksheet", { method: "POST", body: JSON.stringify({ settings: { ...smallPool, taskCount: 201 } }) }));
  assert.equal(response.status, 400);
});

test("print numbering, visual supports and separate answer keys retain all tasks", () => {
  for (const visualSupport of [false, true]) {
    const worksheet = generateComparisonWorksheet({ ...smallPool, visualSupport, taskCount: 200 }, "nb", true);
    const $ = load(renderToStaticMarkup(<View worksheet={worksheet} printMode />));
    assert.deepEqual($(".length-page").toArray().map(page => $(page).find(".comparison-task").length), comparisonPrintPages(worksheet.tasks, visualSupport).map(page => page.tasks.length));
    assert.deepEqual($(".length-number").toArray().map(el => Number($(el).text())), Array.from({ length: 200 }, (_, i) => i + 1));
    assert.equal($(".length-brand, .length-identity").length, 2);
    assert.equal($(".length-page .length-key").length, 0);
    assert.equal($(".length-key p").length, 200);
    assert.equal($(".comparison-blank").length, 200);
    assert.equal($("svg").length, visualSupport ? 400 : 0);
    assert.equal($("select, .length-result").length, 0);
  }
});

test("old and new saved counts retain settings, digital answers and grading", () => {
  for (const visualSupport of [false, true]) for (const taskCount of [12, 36, 100, 129, 198, 200]) {
    const original = generateComparisonWorksheet({ ...smallPool, visualSupport, taskCount }, "pt", true);
    const worksheet = sanitizeComparisonWorksheet(JSON.parse(JSON.stringify(original)))!;
    assert.deepEqual(worksheet, original);
    const answers = Object.fromEntries(worksheet.tasks.map(task => [task.id, task.answer]));
    assert.equal(gradeComparisonWorksheet(worksheet, answers).percentAuto, 100);
    const student = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} />));
    assert.equal(student(".length-page").length, 1);
    assert.equal(student("select").length, taskCount);
    assert.equal(student("select option[selected]").length, taskCount);
    const teacher = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} readOnly showAutoCheck />));
    assert.equal(teacher(".comparison-readonly").length, taskCount);
    assert.equal(teacher(".length-correct").length, taskCount);
    assert.equal(teacher(".length-key, select").length, 0);
  }
});
