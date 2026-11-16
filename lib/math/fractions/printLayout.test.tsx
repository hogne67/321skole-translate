import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { POST } from "@/app/api/generate-fraction-worksheet/route";
import { generateWorksheet, normalizeRequest } from "./generateWorksheet";
import { generateCalculationWorksheet, normalizeCalculationRequest } from "./generateCalculationWorksheet";
import { restoreFractionWorksheet } from "./restoreWorksheet";
import { DEFAULT_FRACTION_VISUAL_PRINT_OPTIONS as defaults, fractionVisualCountAfterOptionsChange, fractionVisualFullPageCounts, fractionVisualPageCapacity, fractionVisualPrintPages, normalizeFractionVisualTaskCount } from "./printLayout";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/fractions/FractionWorksheetView").default as typeof import("../../../components/generators/math/fractions/FractionWorksheetView").default;
const Panel = require("../../../components/generators/math/fractions/FractionGeneratorPanel").default as typeof import("../../../components/generators/math/fractions/FractionGeneratorPanel").default;

test("default full-page options include first-page identity fields and stay within 60 tasks", () => {
  assert.deepEqual(fractionVisualPageCapacity(defaults), { first: 8, following: 10 });
  assert.deepEqual(fractionVisualFullPageCounts(defaults), [8, 18, 28, 38, 48, 58]);
  for (const topic of ["mixed", "part_of_whole", "write_fraction", "choose_fraction"] as const) for (const visual of ["bar", "rectangle", "circle"] as const) for (const showHints of [false, true]) {
    const options = { topic, visualKinds: [visual], showHints, denominatorMax: 12 }, capacity = fractionVisualPageCapacity(options);
    for (const count of fractionVisualFullPageCounts(options)) {
      assert.ok(count <= 60);
      const pages = fractionVisualPrintPages(Array.from({ length: count }, (_, i) => i), options);
      assert.equal(pages[0].tasks.length, capacity.first);
      assert.ok(pages.slice(1).every(p => p.tasks.length === capacity.following));
    }
    for (let count = 1; count <= 60; count++) {
      const tasks = Array.from({ length: count }, (_, i) => i), pages = fractionVisualPrintPages(tasks, options);
      assert.deepEqual(pages.flatMap(p => p.tasks), tasks);
      assert.ok(pages.every(p => p.tasks[0] === p.startIndex));
    }
  }
});

test("changing options preserves full-sheet choices or an exact custom count", () => {
  const circles = { ...defaults, visualKinds: ["circle" as const] };
  assert.equal(fractionVisualCountAfterOptionsChange(18, defaults, circles, false), 14);
  assert.equal(fractionVisualCountAfterOptionsChange(14, circles, defaults, false), 18);
  assert.equal(fractionVisualCountAfterOptionsChange(18, defaults, circles, true), 18);
  assert.equal(fractionVisualCountAfterOptionsChange(7, defaults, circles, false), 7);
  assert.equal(normalizeFractionVisualTaskCount(undefined, defaults), 8);
  assert.equal(normalizeFractionVisualTaskCount(Infinity, defaults), 8);
  assert.equal(normalizeFractionVisualTaskCount(-1, defaults), 1);
  assert.equal(normalizeFractionVisualTaskCount(1000, defaults), 60);
});

test("API accepts full sheets and custom counts and retains the figure and hint settings", async () => {
  for (const taskCount of [undefined, 1, 18, 28, 60]) for (const showHints of [false, true]) {
    const response = await POST(new Request("http://localhost/api/generate-fraction-worksheet", { method: "POST", body: JSON.stringify({ visualKinds: ["bar"], taskCount, showHints, denominatorMin: 12, denominatorMax: 12 }) }));
    assert.equal(response.status, 200);
    const { worksheet } = await response.json();
    assert.equal(worksheet.tasks.length, taskCount ?? fractionVisualPageCapacity({ ...defaults, showHints }).first);
    assert.deepEqual(worksheet.visualKinds, ["bar"]);
    assert.equal(worksheet.showHints, showHints);
    assert.deepEqual(worksheet.denominatorRange, { min: 12, max: 12 });
    assert.ok(worksheet.tasks.every((task: { fraction: { denominator: number } }) => task.fraction.denominator === 12));
  }
});

test("paper numbers tasks continuously, keeps identity fields once and separates the key", () => {
  const worksheet = generateWorksheet(normalizeRequest({ visualKinds: ["bar"], taskCount: 28, showAnswerKey: true, showHints: true, denominatorMin: 12, denominatorMax: 12 }));
  const $ = load(renderToStaticMarkup(<View worksheet={worksheet} printMode variant="generator" showAutoCheck={false} />));
  assert.deepEqual($(".fraction-visual-page").toArray().map(p => $(p).find("article").length), [8, 10, 10]);
  assert.deepEqual($(".fraction-print-prompt > div:first-child").toArray().map(el => Number($(el).text())), Array.from({ length: 28 }, (_, i) => i + 1));
  assert.equal($(".fraction-worksheet-brand").length, 1);
  assert.equal($(".fraction-worksheet-identity").length, 1);
  assert.equal($(".fraction-visual-page svg").length, 28);
  assert.equal($(".fraction-visual-page .fraction-answer-key").length, 0);
  assert.equal($(".fraction-answer-key > .grid > div").length, 28);
  assert.equal($("input").length, 0);
});

test("saved counts and digital fraction answers survive the print changes", () => {
  for (const taskCount of [3, 6, 12, 60]) {
    const original = generateWorksheet(normalizeRequest({ taskCount, topic: "write_fraction", showHints: false, visualKinds: ["circle"], denominatorMin: 12, denominatorMax: 12 }));
    const restored = restoreFractionWorksheet(JSON.parse(JSON.stringify(original)))!;
    assert.equal(restored.tasks.length, taskCount);
    assert.deepEqual(restored.visualKinds, ["circle"]);
    assert.equal(restored.showHints, false);
    const answers = Object.fromEntries(restored.tasks.map(task => [task.id, "11/12"]));
    const $ = load(renderToStaticMarkup(<View worksheet={restored} answersByTaskId={answers} variant="embedded" readOnly showAutoCheck={false} />));
    assert.equal($(".fraction-visual-page").length, 1);
    assert.equal($("article").length, taskCount);
    assert.equal($("fieldset[disabled] input").length, taskCount * 2);
    assert.deepEqual($("article").first().find("input").toArray().map(el => $(el).attr("value")), ["11", "12"]);
  }
});

test("the page selector offers full sheets and explicit custom counts", () => {
  const props = { language: "nb" as const, topic: "mixed" as const, taskCount: 8, countMode: "pages" as "pages" | "custom", denominatorMin: 2, denominatorMax: 8, visualKinds: ["bar" as const], includeHints: true, showAnswerKey: false, loading: false, saving: false, sharing: false, hasWorksheet: false, validRange: true, onCountModeChange() {}, onTopicChange() {}, onTaskCountChange() {}, onMinimumChange() {}, onMaximumChange() {}, onToggleVisual() {}, onHintsChange() {}, onAnswerKeyChange() {}, onGenerate() {}, onSave() {}, onShare() {} };
  const $ = load(renderToStaticMarkup(<Panel {...props} />));
  assert.equal($("select[aria-describedby=fraction-visual-page-hint] option[selected]").val(), "8");
  assert.ok($("select[aria-describedby=fraction-visual-page-hint]").text().includes("18"));
  assert.doesNotMatch($("#fraction-visual-page-hint").text(), /\{/);
  const custom = load(renderToStaticMarkup(<Panel {...props} countMode="custom" taskCount={7} />));
  assert.equal(custom("input[type=number]").first().attr("value"), "7");
});

test("fraction calculation keeps its existing settings and print view", () => {
  const worksheet = generateCalculationWorksheet(normalizeCalculationRequest({ taskCount: 36 }));
  const $ = load(renderToStaticMarkup(<View worksheet={worksheet} printMode showAutoCheck={false} />));
  assert.equal($(".fraction-visual-page, .fraction-visual-worksheet").length, 0);
  assert.equal($(".fraction-calculation-blank").length, 36);
});
