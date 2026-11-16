import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { arithmeticPrintPages, arithmeticTasksPerPage, defaultArithmeticTaskCount, maxArithmeticTaskCount } from "./printLayout";
import { sanitizeArithmeticWorksheet } from "./sanitize";
import type { ArithmeticLayout, ArithmeticTask, ArithmeticWorksheet } from "./types";
const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/arithmetic/ArithmeticWorksheetView").default as typeof import("@/components/generators/math/arithmetic/ArithmeticWorksheetView").default;
const makeSheet = (layout: ArithmeticLayout, taskCount = defaultArithmeticTaskCount(layout), prototype: Partial<ArithmeticTask> = {}): ArithmeticWorksheet => ({ title: "Arithmetic", language: "nb", level: "grade_3_4", operation: "addition", difficulty: "easy", instructions: "Calculate.", layout, showAnswerKey: false, taskCount, numberRange: { min: 0, max: 50 }, tasks: Array.from({ length: taskCount }, (_, i) => ({ id: `task_${i + 1}`, operation: "addition", left: 29, right: 19, answer: 48, expression: "29 + 19", prompt: "29 + 19 =", ...prototype })) });

test("each layout starts with a full-page default and preserves supported custom count limits", () => {
  assert.equal(defaultArithmeticTaskCount("grid"), 100); assert.equal(defaultArithmeticTaskCount("vertical"), 32); assert.equal(defaultArithmeticTaskCount("visual"), 8);
  assert.deepEqual(["grid", "vertical", "visual"].map(layout => maxArithmeticTaskCount(layout as ArithmeticLayout)), [120, 36, 18]);
  assert.deepEqual(arithmeticPrintPages([], "grid"), []);
});

for (const layout of ["grid", "vertical", "visual"] as const) test(`${layout}: custom overflow pages keep every task exactly once with consecutive numbering`, () => {
  const perPage = arithmeticTasksPerPage(layout), sheet = makeSheet(layout, perPage + 3), pages = arithmeticPrintPages(sheet.tasks, layout);
  assert.deepEqual(pages.map(page => page.length), [perPage, 3]); assert.deepEqual(pages.flat(), sheet.tasks);
  const $ = load(renderToStaticMarkup(<View worksheet={sheet} />));
  const taskClass = layout === "grid" ? ".arithmetic-grid-task" : layout === "vertical" ? ".arithmetic-vertical-task" : ".arithmetic-visual-task";
  const indexClass = layout === "grid" ? ".arithmetic-grid-index" : layout === "vertical" ? ".arithmetic-vertical-index" : ".arithmetic-visual-index";
  assert.equal($(".arithmetic-task-page").length, 2); assert.equal($(".arithmetic-task-page").first().find(taskClass).length, perPage);
  assert.deepEqual($(indexClass).map((_, el) => Number($(el).text())).get(), Array.from({ length: perPage + 3 }, (_, i) => i + 1));
  assert.equal($(".arithmetic-brandbar").length, 1); assert.equal($(".arithmetic-identity-grid").length, 1); assert.equal($(".arithmetic-continuation").length, 1);
});

test("all default layouts render on one task page and keys contain every answer only once", () => {
  for (const layout of ["grid", "vertical", "visual"] as const) {
    const sheet = { ...makeSheet(layout), showAnswerKey: true }, $ = load(renderToStaticMarkup(<View worksheet={sheet} />));
    assert.equal($(".arithmetic-task-page").length, 1); assert.equal($(".arithmetic-answer-key").length, 1); assert.equal($(".arithmetic-answer-key > div > div").length, sheet.taskCount);
  }
});

test("missing-operand print slots and known results survive grid and vertical pagination", () => {
  for (const layout of ["grid", "vertical"] as const) {
    const sheet = makeSheet(layout, arithmeticTasksPerPage(layout) + 1, { left: 29, right: 19, answer: 19, unknownPosition: "right", expression: "29 + □ = 48", prompt: "29 + □ = 48" });
    const $ = load(renderToStaticMarkup(<View worksheet={sheet} />)); assert.equal($(".arithmetic-missing-slot").length, sheet.taskCount); assert.match($(".arithmetic-task-page").last().text(), /48/);
    if (layout === "grid") assert.equal($(".arithmetic-grid-task-missing").length, sheet.taskCount);
  }
});

test("compact multiplication and division groups retain every dot and group", () => {
  for (const [operation, left, right, answer, groups, dots] of [["multiplication", 12, 12, 144, 12, 144], ["division", 36, 3, 12, 12, 36]] as const) {
    const sheet = makeSheet("visual", 8, { operation, left, right, answer, expression: `${left} ${operation === "multiplication" ? "×" : "÷"} ${right}`, prompt: "Calculate" });
    const $ = load(renderToStaticMarkup(<View worksheet={sheet} />)); assert.equal($(".arithmetic-visual-groups").length, 8); assert.equal($(".arithmetic-visual-groups .arithmetic-visual-group").length, groups * 8); assert.equal($(".arithmetic-dot").length, dots * 8);
  }
});

test("maximum add and subtract visuals retain forty dots in each operand", () => {
  for (const operation of ["addition", "subtraction"] as const) {
    const sheet = makeSheet("visual", 8, { operation, left: 40, right: 40, answer: operation === "addition" ? 80 : 0 });
    const $ = load(renderToStaticMarkup(<View worksheet={sheet} />)); assert.equal($(".arithmetic-dot").length, 80 * 8); assert.equal($(".arithmetic-visual-task").length, 8);
  }
});

test("reopening saved worksheets retains their original task count and settings", () => {
  for (const layout of ["grid", "vertical", "visual"] as const) {
    const original = makeSheet(layout, maxArithmeticTaskCount(layout)), restored = sanitizeArithmeticWorksheet(JSON.parse(JSON.stringify(original)));
    assert.ok(restored); assert.equal(restored.taskCount, original.taskCount); assert.equal(restored.layout, layout); assert.deepEqual(restored.tasks, original.tasks);
    assert.equal(arithmeticPrintPages(restored.tasks, layout).flat().length, original.taskCount);
  }
});
