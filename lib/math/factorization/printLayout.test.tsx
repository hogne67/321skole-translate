import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { POST } from "@/app/api/generate-factorization-worksheet/route";
import { DEFAULT_FACTORIZATION_SETTINGS as defaults, FACTORIZATION_MAXIMUMS, FACTORIZATION_MODES, canonicalFactorTree, factorPairs, factorizationTaskAnswer, generateFactorizationWorksheet, gradeFactorizationWorksheet, sanitizeFactorizationWorksheet } from "./worksheet";
import { factorizationPageCapacity, factorizationFullPageCounts, factorizationCountAfterOptionsChange, factorizationPrintPages } from "./printLayout";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/factorization/FactorizationWorksheetView").default as typeof import("../../../components/generators/math/factorization/FactorizationWorksheetView").default;

test("full sheets account for pair-list size, drawing space, support and the first-page header", () => {
  assert.equal(defaults.taskCount, 6);
  assert.deepEqual(factorizationFullPageCounts(defaults), [6, 14, 22, 30, 38, 46, 54]);
  assert.deepEqual(factorizationPageCapacity({ ...defaults, maximum: 1000 }), { first: 4, following: 6 });
  assert.deepEqual(factorizationPageCapacity({ ...defaults, taskType: "missing_factor" }), { first: 24, following: 30 });
  assert.deepEqual(factorizationPageCapacity({ ...defaults, taskType: "missing_factor", showSupport: true }), { first: 20, following: 24 });
  assert.deepEqual(factorizationPageCapacity({ ...defaults, taskType: "prime_factors" }), { first: 20, following: 24 });
  assert.deepEqual(factorizationPageCapacity({ ...defaults, taskType: "prime_factors", showSupport: true }), { first: 14, following: 16 });
  assert.deepEqual(factorizationPageCapacity({ ...defaults, taskType: "factor_pairs", maximum: 20 }), { first: 18, following: 22 });
  assert.deepEqual(factorizationPageCapacity({ ...defaults, taskType: "factor_pairs", maximum: 1000 }), { first: 4, following: 6 });
  assert.deepEqual(factorizationPrintPages([], defaults), []);
  for (const taskType of FACTORIZATION_MODES) for (const maximum of FACTORIZATION_MAXIMUMS) for (const showSupport of [false, true]) {
    const options = { taskType, maximum, showSupport }, capacity = factorizationPageCapacity(options), counts = factorizationFullPageCounts(options);
    assert.ok(capacity.first <= capacity.following && capacity.first % 2 === 0 && capacity.following % 2 === 0);
    for (let count = 1; count <= 60; count++) {
      const tasks = Array.from({ length: count }, (_, i) => i), pages = factorizationPrintPages(tasks, options);
      assert.deepEqual(pages.flatMap(page => page.tasks), tasks);
      assert.ok(pages.every(page => page.startIndex === page.tasks[0]));
      assert.equal(pages[0].tasks.length, Math.min(count, capacity.first));
    }
    for (const count of counts) {
      const pages = factorizationPrintPages(Array.from({ length: count }), options);
      assert.equal(pages[0].tasks.length, capacity.first);
      assert.ok(pages.slice(1).every(page => page.tasks.length === capacity.following));
    }
    assert.equal(factorizationCountAfterOptionsChange(14, defaults, options, false), counts[1]);
    assert.equal(factorizationCountAfterOptionsChange(54, defaults, options, false), counts[Math.min(6, counts.length - 1)]);
    assert.equal(factorizationCountAfterOptionsChange(13, defaults, options, true), 13);
    assert.equal(factorizationCountAfterOptionsChange(3, defaults, options, false), 3);
  }
});

test("paper keeps every blank factor row and tree, continuous numbering and a separate worked key", () => {
  for (const taskType of FACTORIZATION_MODES) for (const maximum of [20, 1000] as const) for (const showSupport of [false, true]) {
    const options = { ...defaults, taskType, maximum, showSupport }, worksheet = generateFactorizationWorksheet({ ...options, taskCount: factorizationFullPageCounts(options)[1] }, "pt", true), capacity = factorizationPageCapacity(options);
    const $ = load(renderToStaticMarkup(<View worksheet={worksheet} printMode />));
    assert.deepEqual($(".length-page").toArray().map(page => $(page).find(".factorization-task").length), [capacity.first, capacity.following]);
    assert.deepEqual($(".length-number").toArray().map(el => Number($(el).text())), Array.from({ length: worksheet.tasks.length }, (_, i) => i + 1));
    assert.equal($(".length-brand, .length-identity").length, 2);
    assert.equal($(".factor-pair-blank").length, worksheet.tasks.filter(task => task.type === "factor_pairs").reduce((sum, task) => sum + factorPairs(task.number).length * 2, 0));
    assert.equal($(".factor-tree-paper-space").length, worksheet.tasks.filter(task => task.type === "factor_tree").length);
    assert.equal($(".factorization-answer-space").length, worksheet.tasks.filter(task => ["missing_factor", "prime_factors"].includes(task.type)).length);
    assert.equal($(".length-page .factor-tree-prime, .length-page .factorization-key, input, button, .length-result").length, 0);
    assert.equal($(".factorization-key-item").length, worksheet.tasks.length);
  }
});

test("saved counts retain exact tasks and tree answers while digital work uses one summary", () => {
  for (const taskType of FACTORIZATION_MODES) for (const taskCount of [2, 4, 13, 60]) {
    const original = generateFactorizationWorksheet({ ...defaults, taskType, maximum: 1000, taskCount, showSupport: true, showPowers: true }, "en", true);
    const worksheet = sanitizeFactorizationWorksheet(JSON.parse(JSON.stringify(original)))!;
    assert.deepEqual(worksheet, original);
    const answers = Object.fromEntries(worksheet.tasks.map(task => [task.id, { value: factorizationTaskAnswer(task, worksheet.settings), pairs: factorPairs(task.number).map(([left, right]) => ({ left: String(left), right: String(right) })), nodes: canonicalFactorTree(task.number) }]));
    assert.equal(gradeFactorizationWorksheet(worksheet, answers).percentAuto, 100);
    const student = load(renderToStaticMarkup(<View worksheet={worksheet} />));
    assert.equal(student(".length-page").length, 1);
    assert.equal(student(".length-result, .length-key, .factor-tree-prime").length, 0);
    assert.ok(student("input").toArray().every(el => student(el).attr("value") === ""));
    const teacher = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} readOnly showAutoCheck />));
    assert.equal(teacher(".length-summary").length, 1);
    assert.equal(teacher(".length-correct").length, taskCount);
    assert.equal(teacher("input:not([readonly]), button").length, 0);
  }
});

test("generation API returns full sheets for every mode, range, support and powers setting in three languages", async () => {
  for (const language of ["nb", "en", "pt"]) for (const taskType of FACTORIZATION_MODES) for (const maximum of FACTORIZATION_MAXIMUMS) for (const showSupport of [false, true]) for (const showPowers of [false, true]) {
    const options = { ...defaults, taskType, maximum, showSupport, showPowers }, settings = { ...options, taskCount: factorizationFullPageCounts(options)[1] };
    const response = await POST(new Request("http://localhost/api/generate-factorization-worksheet", { method: "POST", body: JSON.stringify({ settings, language, showAnswerKey: true }) }));
    assert.equal(response.status, 200);
    const { worksheet } = await response.json();
    assert.deepEqual(worksheet.settings, settings);
    assert.equal(worksheet.language, language);
    assert.equal(worksheet.showAnswerKey, true);
    assert.deepEqual(sanitizeFactorizationWorksheet(worksheet), worksheet);
    assert.equal(new Set(worksheet.tasks.map((task: { id: string }) => task.id)).size, settings.taskCount);
  }
});
