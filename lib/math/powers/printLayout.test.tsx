import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { POST } from "@/app/api/generate-powers-worksheet/route";
import { DEFAULT_POWERS_SETTINGS as defaults, POWERS_MODES, POWERS_RULE_OPERATIONS, generatePowersWorksheet, gradePowersTask, gradePowersWorksheet, powersResultExponent, powersTaskAnswer, sanitizePowersWorksheet } from "./worksheet";
import { powersPageCapacity, powersFullPageCounts, powersCountAfterOptionsChange, powersPrintPages } from "./printLayout";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/powers/PowersWorksheetView").default as typeof import("../../../components/generators/math/powers/PowersWorksheetView").default;

test("full sheets account for power boxes, repeated products, support and the first-page header", () => {
  assert.equal(defaults.taskCount, 20);
  assert.deepEqual(powersFullPageCounts(defaults), [20, 44]);
  assert.deepEqual(powersPageCapacity({ ...defaults, showSupport: true }), { first: 14, following: 16 });
  assert.deepEqual(powersPageCapacity({ taskType: "evaluate", showSupport: false }), { first: 28, following: 32 });
  assert.deepEqual(powersPageCapacity({ taskType: "evaluate", showSupport: true }), { first: 18, following: 22 });
  assert.deepEqual(powersPageCapacity({ taskType: "expand", showSupport: false }), { first: 22, following: 28 });
  assert.deepEqual(powersPageCapacity({ taskType: "expand", showSupport: true }), { first: 16, following: 20 });
  assert.deepEqual(powersPrintPages([], defaults), []);
  for (const taskType of POWERS_MODES) for (const showSupport of [false, true]) {
    const options = { taskType, showSupport }, capacity = powersPageCapacity(options), counts = powersFullPageCounts(options);
    for (let count = 1; count <= 60; count++) {
      const tasks = Array.from({ length: count }, (_, i) => i), pages = powersPrintPages(tasks, options);
      assert.deepEqual(pages.flatMap(page => page.tasks), tasks);
      assert.ok(pages.every(page => page.startIndex === page.tasks[0]));
      assert.equal(pages[0].tasks.length, Math.min(count, capacity.first));
    }
    for (const count of counts) {
      const pages = powersPrintPages(Array.from({ length: count }), options);
      assert.equal(pages[0].tasks.length, capacity.first);
      assert.ok(pages.slice(1).every(page => page.tasks.length === capacity.following));
    }
    assert.equal(powersCountAfterOptionsChange(44, defaults, options, false), counts[1]);
    assert.equal(powersCountAfterOptionsChange(12, defaults, options, true), 12);
    assert.equal(powersCountAfterOptionsChange(6, defaults, options, false), 6);
    assert.equal(powersCountAfterOptionsChange(46, { ...defaults, showSupport: true }, options, false), counts[Math.min(2, counts.length - 1)]);
  }
});

test("paper keeps numbered tasks, blank bases and raised exponents, hints and a separate key", () => {
  for (const taskType of POWERS_MODES) for (const showSupport of [false, true]) {
    const options = { ...defaults, taskType, showSupport, maxBase: 12, maxExponent: 6, includeZeroExponent: true }, worksheet = generatePowersWorksheet({ ...options, taskCount: powersFullPageCounts(options)[1] }, "pt", true), capacity = powersPageCapacity(options);
    const $ = load(renderToStaticMarkup(<View worksheet={worksheet} printMode />));
    assert.deepEqual($(".length-page").toArray().map(page => $(page).find(".powers-task").length), [capacity.first, capacity.following]);
    assert.deepEqual($(".length-number").toArray().map(el => Number($(el).text())), Array.from({ length: worksheet.tasks.length }, (_, i) => i + 1));
    assert.equal($(".length-brand, .length-identity").length, 2);
    const powerTasks = worksheet.tasks.filter(task => task.type === "write_power" || task.type === "power_rules").length;
    assert.equal($(".powers-base-blank").length, powerTasks);
    assert.equal($(".powers-exponent-blank").length, powerTasks);
    assert.equal($(".powers-answer-space").length, worksheet.tasks.length - powerTasks);
    assert.equal($(".powers-hint").length, showSupport ? worksheet.tasks.length : 0);
    assert.equal($(".length-page .powers-key, input, button, .length-result").length, 0);
    assert.equal($(".powers-key > div").length, worksheet.tasks.length);
  }
});

test("saved old counts retain zero, operation and support choices and exact digital partial credit", () => {
  for (const taskType of POWERS_MODES) for (const taskCount of [4, 6, 12, 60]) {
    const original = generatePowersWorksheet({ ...defaults, taskType, maxBase: 12, maxExponent: 6, taskCount, showSupport: true, includeZeroExponent: true, ruleOperation: "divide" }, "en", true);
    const worksheet = sanitizePowersWorksheet(JSON.parse(JSON.stringify(original)))!;
    assert.deepEqual(worksheet, original);
    const answers = Object.fromEntries(worksheet.tasks.map(task => [task.id, { base: String(task.base), exponent: String(powersResultExponent(task)), value: powersTaskAnswer(task) }]));
    assert.equal(gradePowersWorksheet(worksheet, answers).percentAuto, 100);
    for (const task of worksheet.tasks.filter(task => task.type === "write_power" || task.type === "power_rules")) assert.equal(gradePowersTask(task, { base: String(task.base) }).points, .5);
    const student = load(renderToStaticMarkup(<View worksheet={worksheet} />));
    assert.equal(student(".length-page").length, 1);
    assert.equal(student(".length-key, .length-result").length, 0);
    assert.ok(student("input").toArray().every(el => student(el).attr("value") === ""));
    const teacher = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} readOnly showAutoCheck />));
    assert.equal(teacher(".length-summary").length, 1);
    assert.equal(teacher(".length-correct").length, taskCount);
    assert.equal(teacher("input:not([readonly])").length, 0);
  }
});

test("generation API returns full sheets for each task, range, zero, operation and support choice in three languages", async () => {
  for (const language of ["nb", "en", "pt"]) for (const taskType of POWERS_MODES) for (const [maxBase, maxExponent] of [[2, 2], [10, 4], [12, 6]]) for (const showSupport of [false, true]) for (const includeZeroExponent of [false, true]) for (const ruleOperation of POWERS_RULE_OPERATIONS) {
    const options = { ...defaults, taskType, maxBase, maxExponent, showSupport, includeZeroExponent, ruleOperation }, settings = { ...options, taskCount: powersFullPageCounts(options)[1] };
    const response = await POST(new Request("http://localhost/api/generate-powers-worksheet", { method: "POST", body: JSON.stringify({ settings, language, showAnswerKey: true }) }));
    assert.equal(response.status, 200);
    const { worksheet } = await response.json();
    assert.deepEqual(worksheet.settings, settings);
    assert.equal(worksheet.language, language);
    assert.equal(worksheet.showAnswerKey, true);
    assert.deepEqual(sanitizePowersWorksheet(worksheet), worksheet);
    assert.equal(new Set(worksheet.tasks.map((task: { id: string }) => task.id)).size, settings.taskCount);
  }
});
