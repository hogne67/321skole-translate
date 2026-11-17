import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { POST } from "@/app/api/generate-place-value-worksheet/route";
import { DEFAULT_PLACE_VALUE_SETTINGS, PLACE_VALUE_MODES, generatePlaceValueWorksheet, gradePlaceValueWorksheet, placeValueDigit, placeValueExponents, placeValueTaskAnswer, sanitizePlaceValueWorksheet } from "./worksheet";
import { placeValuePageCapacity, placeValueFullPageCounts, placeValueCountAfterOptionsChange, placeValuePrintPages } from "./printLayout";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/place-value/PlaceValueWorksheetView").default as typeof import("../../../components/generators/math/place-value/PlaceValueWorksheetView").default;

test("full sheets adapt to table width, marked digits and the first-page header", () => {
  assert.equal(DEFAULT_PLACE_VALUE_SETTINGS.taskCount, 7);
  const options = { ...DEFAULT_PLACE_VALUE_SETTINGS };
  assert.deepEqual(placeValuePageCapacity(options), { first: 7, following: 8 });
  assert.deepEqual(placeValuePageCapacity({ ...options, integerDigits: 6, decimalPlaces: 3 }), { first: 6, following: 7 });
  assert.deepEqual(placeValuePageCapacity({ ...options, taskType: "expand" }), { first: 8, following: 10 });
  assert.deepEqual(placeValuePageCapacity({ ...options, taskType: "expand", integerDigits: 6, decimalPlaces: 3 }), { first: 7, following: 9 });
  assert.deepEqual(placeValuePageCapacity({ ...options, showPlaceValueTable: false }), { first: 12, following: 14 });
  assert.deepEqual(placeValuePageCapacity({ ...options, taskType: "expand", showPlaceValueTable: false }), { first: 18, following: 20 });
  assert.deepEqual(placeValueFullPageCounts(options).slice(0, 4), [7, 15, 23, 31]);
  assert.deepEqual(placeValuePrintPages([], options), []);
  for (const taskType of PLACE_VALUE_MODES) for (const integerDigits of [1, 3, 6] as const) for (const decimalPlaces of [0, 3] as const) for (const showPlaceValueTable of [false, true]) {
    const next = { taskType, integerDigits, decimalPlaces, showPlaceValueTable }, capacity = placeValuePageCapacity(next);
    for (let count = 1; count <= 60; count++) {
      const tasks = Array.from({ length: count }, (_, i) => i), pages = placeValuePrintPages(tasks, next);
      assert.deepEqual(pages.flatMap(page => page.tasks), tasks);
      assert.ok(pages.every(page => page.tasks[0] === page.startIndex));
      assert.equal(pages[0].tasks.length, Math.min(count, capacity.first));
    }
    for (const count of placeValueFullPageCounts(next)) {
      const pages = placeValuePrintPages(Array.from({ length: count }), next);
      assert.equal(pages[0].tasks.length, capacity.first);
      assert.ok(pages.slice(1).every(page => page.tasks.length === capacity.following));
    }
    assert.equal(placeValueCountAfterOptionsChange(15, options, next, false), placeValueFullPageCounts(next)[1]);
    assert.equal(placeValueCountAfterOptionsChange(8, options, next, true), 8);
    assert.equal(placeValueCountAfterOptionsChange(4, options, next, false), 4);
  }
});

test("paper retains numbered tasks, blank place-value tables and long answer lines with a separate key", () => {
  for (const taskType of ["expand", "mixed"] as const) for (const showPlaceValueTable of [false, true]) for (const wide of [false, true]) {
    const options = { ...DEFAULT_PLACE_VALUE_SETTINGS, taskType, showPlaceValueTable, integerDigits: wide ? 6 as const : 3 as const, decimalPlaces: wide ? 3 as const : 0 as const };
    const worksheet = generatePlaceValueWorksheet({ ...options, taskCount: placeValueFullPageCounts(options)[1] }, "pt", true), capacity = placeValuePageCapacity(options);
    const $ = load(renderToStaticMarkup(<View worksheet={worksheet} printMode />));
    assert.deepEqual($(".length-page").toArray().map(page => $(page).find(".place-value-task").length), [capacity.first, capacity.following]);
    assert.deepEqual($(".length-number").toArray().map(el => Number($(el).text())), Array.from({ length: worksheet.tasks.length }, (_, i) => i + 1));
    assert.equal($(".length-brand, .length-identity").length, 2);
    assert.equal($(".place-value-table").length, showPlaceValueTable ? worksheet.tasks.length : 0);
    assert.equal($(".place-value-cell-space").length, showPlaceValueTable ? worksheet.tasks.length * (options.integerDigits + options.decimalPlaces) : 0);
    assert.equal($(".place-value-answer-space").length, worksheet.tasks.length);
    assert.equal($(".length-page .place-value-key").length, 0);
    assert.equal($(".place-value-key-item").length, worksheet.tasks.length);
    assert.equal($("input, button, .length-result").length, 0);
  }
});

test("saved old counts retain decimal settings, support-table fields and exact digital grading", () => {
  for (const taskType of PLACE_VALUE_MODES) for (const taskCount of [2, 8, 25, 60]) {
    const original = generatePlaceValueWorksheet({ ...DEFAULT_PLACE_VALUE_SETTINGS, taskType, taskCount, integerDigits: 6, decimalPlaces: 3, showPlaceValueTable: true }, "en", true);
    const worksheet = sanitizePlaceValueWorksheet(JSON.parse(JSON.stringify(original)))!;
    assert.deepEqual(worksheet, original);
    const answers = Object.fromEntries(worksheet.tasks.map(task => [task.id, { value: placeValueTaskAnswer(task, worksheet.settings, "en"), table: placeValueExponents(worksheet.settings).map(exponent => String(placeValueDigit(task, exponent, worksheet.settings))) }]));
    assert.equal(gradePlaceValueWorksheet(worksheet, answers).percentAuto, 100);
    const tablesOnly = Object.fromEntries(worksheet.tasks.map(task => [task.id, { ...answers[task.id], value: "" }]));
    assert.equal(gradePlaceValueWorksheet(worksheet, tablesOnly).unansweredAuto, taskCount);
    assert.equal(gradePlaceValueWorksheet(worksheet, tablesOnly).percentAuto, 0);
    const student = load(renderToStaticMarkup(<View worksheet={worksheet} />));
    assert.equal(student(".length-page").length, 1);
    assert.equal(student("input").length, taskCount * 10);
    assert.equal(student(".length-key, .length-result").length, 0);
    const teacher = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} readOnly showAutoCheck />));
    assert.equal(teacher("input[readonly]").length, taskCount * 10);
    assert.equal(teacher(".length-summary").length, 1);
    assert.equal(teacher(".length-correct").length, taskCount);
  }
});

test("generation API accepts full sheets in every language, mode, digit count, precision and table setting", async () => {
  for (const language of ["nb", "en", "pt"]) for (const taskType of PLACE_VALUE_MODES) for (const integerDigits of [1, 2, 3, 4, 5, 6] as const) for (const decimalPlaces of [0, 1, 2, 3] as const) for (const showPlaceValueTable of [false, true]) {
    const options = { ...DEFAULT_PLACE_VALUE_SETTINGS, taskType, integerDigits, decimalPlaces, showPlaceValueTable }, settings = { ...options, taskCount: placeValueFullPageCounts(options)[1] };
    const response = await POST(new Request("http://localhost/api/generate-place-value-worksheet", { method: "POST", body: JSON.stringify({ settings, language, showAnswerKey: true }) }));
    assert.equal(response.status, 200);
    const { worksheet } = await response.json();
    assert.deepEqual(worksheet.settings, settings);
    assert.equal(worksheet.language, language);
    assert.equal(worksheet.showAnswerKey, true);
    assert.deepEqual(sanitizePlaceValueWorksheet(worksheet), worksheet);
    assert.equal(new Set(worksheet.tasks.map((task: { id: string }) => task.id)).size, settings.taskCount);
  }
});
