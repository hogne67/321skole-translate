import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { DEFAULT_WORD_PROBLEMS_SETTINGS as defaults, generateWordProblemsWorksheet, sanitizeWordProblemsWorksheet } from "./worksheet";
import { wordProblemsFullPageCounts, wordProblemsPrintPages } from "./printLayout";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/word-problems/WordProblemsWorksheetView").default as typeof import("../../../components/generators/math/word-problems/WordProblemsWorksheetView").default;

test("full-sheet options account for the first-page heading and stay within 60 tasks", () => {
  assert.equal(defaults.taskCount, 5);
  assert.deepEqual(wordProblemsFullPageCounts(false), [5, 11, 17, 23, 29, 35, 41, 47, 53, 59]);
  assert.deepEqual(wordProblemsFullPageCounts(true), [4, 9, 14, 19, 24, 29, 34, 39, 44, 49, 54, 59]);
  for (const showSupport of [false, true]) for (const count of wordProblemsFullPageCounts(showSupport)) {
    const tasks = Array.from({ length: count }, (_, i) => i);
    const pages = wordProblemsPrintPages(tasks, { showSupport });
    assert.deepEqual(pages.flatMap(page => page.tasks), tasks);
    assert.ok(pages.slice(1).every(page => page.tasks.length === (showSupport ? 5 : 6)));
  }
});

test("custom counts keep every task, including a partially filled last page", () => {
  for (const showSupport of [false, true]) for (let count = 1; count <= 60; count++) {
    const tasks = Array.from({ length: count }, (_, i) => i);
    const pages = wordProblemsPrintPages(tasks, { showSupport });
    assert.deepEqual(pages.flatMap(page => page.tasks), tasks);
    assert.ok(pages.every(page => page.tasks[0] === page.startIndex));
  }
});

test("printed pages number tasks continuously and show identity only on the first page", () => {
  const sheet = generateWordProblemsWorksheet({ ...defaults, taskCount: 17 }, "nb", false);
  const $ = load(renderToStaticMarkup(<View worksheet={sheet} printMode />));
  assert.deepEqual($(".length-page").toArray().map(page => $(page).find(".word-problems-task").length), [5, 6, 6]);
  assert.deepEqual($(".length-number").toArray().map(el => Number($(el).text())), Array.from({ length: 17 }, (_, i) => i + 1));
  assert.equal($(".length-identity").length, 1);
  assert.equal($(".length-brand").length, 1);
  assert.equal($(".word-problems-lines").length, 17);
  assert.equal($("input, textarea, select").length, 0);
});

test("saved custom and former default counts survive reopening; digital answers remain available", () => {
  for (const taskCount of [3, 6, 11, 60]) {
    const original = generateWordProblemsWorksheet({ ...defaults, taskCount }, "nb", false);
    const restored = sanitizeWordProblemsWorksheet(JSON.parse(JSON.stringify(original)));
    assert.deepEqual(restored, original);
    const $ = load(renderToStaticMarkup(<View worksheet={restored!} />));
    assert.equal($("textarea").length, taskCount);
    assert.equal($("input").length, taskCount);
    assert.equal($("select").length, taskCount);
  }
});
