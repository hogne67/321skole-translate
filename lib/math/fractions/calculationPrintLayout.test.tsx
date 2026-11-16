import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { POST } from "@/app/api/generate-fraction-calculation-worksheet/route";
import { generateCalculationWorksheet, normalizeCalculationRequest } from "./generateCalculationWorksheet";
import { restoreFractionWorksheet } from "./restoreWorksheet";
import { gradeFractionWorksheet } from "./gradeWorksheet";
import { FRACTION_CALCULATION_FIRST_PAGE_COUNT, fractionCalculationFullPageCounts, fractionCalculationPrintPages } from "./calculationPrintLayout";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/fractions/FractionWorksheetView").default as typeof import("../../../components/generators/math/fractions/FractionWorksheetView").default;
const Panel = require("../../../components/generators/math/fractions/FractionCalculationPanel").default as typeof import("../../../components/generators/math/fractions/FractionCalculationPanel").default;

test("full sheets account for the first-page header and preserve exact custom counts", () => {
  assert.equal(FRACTION_CALCULATION_FIRST_PAGE_COUNT, 42);
  assert.equal(normalizeCalculationRequest({}).taskCount, 42);
  assert.deepEqual(fractionCalculationFullPageCounts(), [42, 93, 144, 195]);
  assert.deepEqual(fractionCalculationPrintPages([]), []);
  for (let count = 6; count <= 200; count++) {
    const tasks = Array.from({ length: count }, (_, i) => i), pages = fractionCalculationPrintPages(tasks);
    assert.deepEqual(pages.flatMap(p => p.tasks), tasks);
    assert.ok(pages.every(p => p.tasks[0] === p.startIndex));
  }
  for (const count of fractionCalculationFullPageCounts()) {
    const pages = fractionCalculationPrintPages(Array.from({ length: count }, (_, i) => i));
    assert.equal(pages[0].tasks.length, 42);
    assert.ok(pages.slice(1).every(p => p.tasks.length === 51));
  }
});

test("API supports the default, complete sheets and custom counts in every language", async () => {
  for (const language of ["nb", "en", "pt"]) for (const taskCount of [undefined, 6, 93, 144, 195, 200]) {
    const response = await POST(new Request("http://localhost/api/generate-fraction-calculation-worksheet", { method: "POST", body: JSON.stringify({ language, operation: "mixed", denominatorRelation: "different", denominatorMin: 98, denominatorMax: 100, taskCount, requireReduced: true }) }));
    assert.equal(response.status, 200);
    const { worksheet } = await response.json();
    assert.equal(worksheet.tasks.length, taskCount ?? 42);
    assert.equal(worksheet.language, language);
    assert.equal(worksheet.calculation.requireReduced, true);
    assert.equal(new Set(worksheet.tasks.map((task: { id: string }) => task.id)).size, worksheet.tasks.length);
  }
  for (const taskCount of [5, 201, 42.5]) assert.throws(() => normalizeCalculationRequest({ taskCount }), /INVALID_TASK_COUNT/);
});

test("paper pages number every task once, with identity fields once and a separate key", () => {
  const worksheet = generateCalculationWorksheet(normalizeCalculationRequest({ taskCount: 200, showAnswerKey: true, operation: "mixed" }));
  const $ = load(renderToStaticMarkup(<View worksheet={worksheet} printMode showAutoCheck={false} />));
  assert.deepEqual($(".fraction-calculation-page").toArray().map(p => $(p).find("article").length), [42, 51, 51, 51, 5]);
  assert.deepEqual($(".fraction-calculation-number").toArray().map(el => Number($(el).text())), Array.from({ length: 200 }, (_, i) => i + 1));
  assert.equal($(".fraction-worksheet-brand").length, 1);
  assert.equal($(".fraction-worksheet-identity").length, 1);
  assert.equal($(".fraction-calculation-blank").length, 200);
  assert.equal($(".fraction-calculation-page .fraction-answer-key").length, 0);
  assert.equal($(".fraction-answer-key > .grid > div").length, 200);
  assert.equal($("input, .fraction-calculation-feedback").length, 0);
});

test("saved worksheets retain old counts, new counts, settings, digital answers and partial credit", () => {
  for (const taskCount of [6, 36, 100, 144, 200]) {
    const original = generateCalculationWorksheet(normalizeCalculationRequest({ taskCount, operation: "mixed", denominatorRelation: "different", requireReduced: true }));
    const restored = restoreFractionWorksheet(JSON.parse(JSON.stringify(original)))!;
    assert.deepEqual(restored, original);
    const answers = Object.fromEntries(restored.tasks.map(task => [task.id, task.answer]));
    assert.equal(gradeFractionWorksheet(restored, answers).percentAuto, 100);
    const unreduced = Object.fromEntries(restored.tasks.map(task => { const [n, d] = task.answer.split("/").map(Number); return [task.id, `${n * 2}/${d * 2}`]; }));
    assert.equal(gradeFractionWorksheet(restored, unreduced).percentAuto, 50);
    const $ = load(renderToStaticMarkup(<View worksheet={restored} answersByTaskId={answers} variant="embedded" readOnly showIdentityFields={false} showAutoCheck={false} />));
    assert.equal($(".fraction-calculation-page").length, 1);
    assert.equal($("input").length, taskCount * 2);
    assert.equal($("fieldset[disabled] input").length, taskCount * 2);
    assert.equal($(".fraction-answer-key").length, 0);
  }
  const tooMany = generateCalculationWorksheet(normalizeCalculationRequest({ taskCount: 200 }));
  tooMany.tasks.push({ ...tooMany.tasks[0], id: "extra" });
  assert.equal(restoreFractionWorksheet(tooMany), null);
});

test("page and custom count controls are available in all three languages", () => {
  for (const language of ["nb", "en", "pt"] as const) {
    const props = { language, operation: "addition" as const, denominatorRelation: "same" as const, denominatorMin: 2, denominatorMax: 8, requireReduced: false, taskCount: 42, countMode: "pages" as "pages" | "custom", showAnswerKey: false, loading: false, saving: false, sharing: false, hasWorksheet: false, validRange: true, validDenominators: true, onCountModeChange() {}, onOperationChange() {}, onDenominatorRelationChange() {}, onMinimumChange() {}, onMaximumChange() {}, onTaskCountChange() {}, onRequireReducedChange() {}, onAnswerKeyChange() {}, onGenerate() {}, onSave() {}, onShare() {} };
    const $ = load(renderToStaticMarkup(<Panel {...props} />));
    assert.equal($("select[aria-describedby=fraction-calculation-page-hint] option[selected]").val(), "42");
    assert.ok($("select[aria-describedby=fraction-calculation-page-hint]").text().includes("195"));
    assert.doesNotMatch($("#fraction-calculation-page-hint").text(), /\{/);
    const custom = load(renderToStaticMarkup(<Panel {...props} countMode="custom" taskCount={100} />));
    assert.equal(custom("input[type=number]").first().attr("value"), "100");
    assert.equal(custom("input[type=number]").first().attr("max"), "200");
  }
});
