import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { POST } from "@/app/api/generate-measurement-worksheet/route";
import { MEASUREMENT_CATEGORIES, generateMeasurementWorksheet, getMeasurementDefaults, gradeMeasurementWorksheet, sanitizeMeasurementWorksheet } from "./worksheet";
import { measurementFullPageCounts, measurementPrintPages } from "./printLayout";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/length/LengthWorksheetView").default as typeof import("../../../components/generators/math/length/LengthWorksheetView").default;

test("full sheets account for the first-page header without losing or repeating tasks", () => {
  assert.deepEqual(measurementFullPageCounts(), [52, 112, 172]);
  for (let count = 1; count <= 200; count++) {
    const tasks = Array.from({ length: count }, (_, i) => i), pages = measurementPrintPages(tasks);
    assert.deepEqual(pages.flatMap(page => page.tasks), tasks);
    assert.ok(pages.every(page => page.tasks[0] === page.startIndex));
  }
  assert.deepEqual(measurementPrintPages([]), []);
  for (const count of measurementFullPageCounts()) {
    const pages = measurementPrintPages(Array.from({ length: count }, (_, i) => i));
    assert.equal(pages[0].tasks.length, 52);
    assert.ok(pages.slice(1).every(page => page.tasks.length === 60));
  }
});

test("all categories and languages generate full sheets and accept exact custom counts", async () => {
  for (const language of ["nb", "en", "pt"]) for (const category of MEASUREMENT_CATEGORIES) {
    assert.equal(getMeasurementDefaults(category).taskCount, 52);
    for (const taskCount of [1, 52, 112, 172, 200]) {
      const response = await POST(new Request("http://localhost/api/generate-measurement-worksheet", { method: "POST", body: JSON.stringify({ language, settings: { ...getMeasurementDefaults(category), taskCount, allowDecimals: true } }) }));
      assert.equal(response.status, 200);
      const { worksheet } = await response.json();
      assert.equal(worksheet.tasks.length, taskCount);
      assert.equal(worksheet.language, language);
      assert.equal(worksheet.settings.category, category);
      assert.equal(worksheet.settings.allowDecimals, true);
      assert.equal(new Set(worksheet.tasks.map((task: { id: string }) => task.id)).size, taskCount);
    }
  }
  for (const taskCount of [0, 201, 1.5]) {
    const response = await POST(new Request("http://localhost/api/generate-measurement-worksheet", { method: "POST", body: JSON.stringify({ settings: { ...getMeasurementDefaults("length"), taskCount } }) }));
    assert.equal(response.status, 400);
  }
});

test("print numbering and answer keys stay separate across multiple pages", () => {
  const worksheet = generateMeasurementWorksheet({ ...getMeasurementDefaults("mass"), units: ["t", "mg"], minimum: 100000, maximum: 100000, taskCount: 200 }, "nb", true);
  const $ = load(renderToStaticMarkup(<View worksheet={worksheet} printMode />));
  assert.deepEqual($(".length-page").toArray().map(page => $(page).find(".length-task").length), [52, 60, 60, 28]);
  assert.deepEqual($(".length-number").toArray().map(el => Number($(el).text())), Array.from({ length: 200 }, (_, i) => i + 1));
  assert.equal($(".length-brand").length, 1);
  assert.equal($(".length-identity").length, 1);
  assert.equal($(".length-page .length-key").length, 0);
  assert.equal($(".length-key p").length, 200);
  assert.equal($(".length-answer-space[style='width:39.5mm']").length, 200);
  assert.equal($("input, .length-result").length, 0);
});

test("saved old and new counts preserve settings, exact answers and digital grading", () => {
  for (const category of MEASUREMENT_CATEGORIES) for (const taskCount of [1, 36, 100, 112, 172, 200]) {
    const original = generateMeasurementWorksheet({ ...getMeasurementDefaults(category), taskCount, allowDecimals: true }, "pt", true);
    const worksheet = sanitizeMeasurementWorksheet(JSON.parse(JSON.stringify(original)))!;
    assert.deepEqual(worksheet, original);
    const answers = Object.fromEntries(worksheet.tasks.map(task => [task.id, task.answer.replace(".", ",")]));
    assert.equal(gradeMeasurementWorksheet(worksheet, answers).percentAuto, 100);
    const $ = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} readOnly showAutoCheck />));
    assert.equal($(".length-page").length, 1);
    assert.equal($("input[readonly]").length, taskCount);
    assert.equal($(".length-correct").length, taskCount);
    assert.equal($(".length-key").length, 0);
  }
});
