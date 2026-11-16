import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import { load } from "cheerio";
import nb from "@/messages/nb/math/mathGeometry.json";
import en from "@/messages/en/math/mathGeometry.json";
import pt from "@/messages/pt/math/mathGeometry.json";
import { buildFormula, buildHint } from "./displayOptions";
import { sanitizeWorksheet } from "./sanitize";
import type { MathWorksheet } from "./types";
import { DEFAULT_GEOMETRY_PRINT_OPTIONS as defaults, geometryFullPageCounts, geometryPageCapacity, geometryPrintPages, geometryTaskCountAfterOptionsChange, normalizeGeometryTaskCount } from "./printLayout";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/geometry/GeometryWorksheetView").default as typeof import("../../../components/generators/math/geometry/GeometryWorksheetView").default;
const Panel = require("../../../components/generators/math/geometry/GeometryGeneratorPanel").default as typeof import("../../../components/generators/math/geometry/GeometryGeneratorPanel").default;
const translate = createTranslator({ locale: "nb", messages: nb, namespace: "mathGeometry" });
const t = (key: string) => translate(key as Parameters<typeof translate>[0]);
const makeSheet = (count: number): MathWorksheet => ({ title: "Geometri", instructions: "Vis utregningen.", language: "nb", level: "grade_5_7", difficulty: "easy", topic: "all", selectedShapes: ["square"], showFormulas: false, showAnswerKey: false, answerSpace: "medium", tasks: Array.from({ length: count }, (_, i) => ({ id: String(i), type: "all_in_one", prompt: "Finn navn, omkrets og areal.", figure: { kind: "square", sideCm: 6 }, answer: "Kvadrat; 24 cm; 36 cm²", inputMode: "split_name_perimeter_area", expected: { shapeName: "kvadrat", perimeterValue: 24, areaValue: 36, perimeterUnit: "cm", areaUnit: "cm2" } })) });

test("default and full-sheet counts account for first-page identity fields", () => {
  assert.deepEqual(geometryPageCapacity(defaults), { first: 5, following: 6 });
  assert.deepEqual(geometryFullPageCounts(defaults), [5, 11, 17, 23, 29, 35, 41, 47, 53, 59]);
  for (const answerSpace of ["small", "medium", "large"] as const) for (const includeHints of [false, true]) for (const showFormulas of [false, true]) {
    const options = { answerSpace, includeHints, showFormulas }, capacity = geometryPageCapacity(options);
    for (const count of geometryFullPageCounts(options)) {
      assert.ok(count <= 60);
      const pages = geometryPrintPages(Array.from({ length: count }, (_, i) => i), options);
      assert.equal(pages[0].tasks.length, capacity.first);
      assert.ok(pages.slice(1).every(p => p.tasks.length === capacity.following));
    }
    for (let count = 1; count <= 60; count++) {
      const tasks = Array.from({ length: count }, (_, i) => i), pages = geometryPrintPages(tasks, options);
      assert.deepEqual(pages.flatMap(p => p.tasks), tasks);
      assert.ok(pages.every(p => p.tasks[0] === p.startIndex));
    }
  }
});

test("changing display options keeps full-page choices and preserves custom counts", () => {
  const supported = { ...defaults, showFormulas: true };
  assert.equal(geometryTaskCountAfterOptionsChange(11, defaults, supported, false), 9);
  assert.equal(geometryTaskCountAfterOptionsChange(9, supported, defaults, false), 11);
  assert.equal(geometryTaskCountAfterOptionsChange(11, defaults, supported, true), 11);
  assert.equal(geometryTaskCountAfterOptionsChange(6, defaults, supported, false), 6);
  assert.equal(normalizeGeometryTaskCount(undefined, defaults), 5);
  assert.equal(normalizeGeometryTaskCount(Infinity, supported), 4);
  assert.equal(normalizeGeometryTaskCount(-1, defaults), 1);
  assert.equal(normalizeGeometryTaskCount(1000, defaults), 60);
});

test("paper pages keep continuous numbering, diagrams, measurements and a separate answer key", () => {
  const sheet = { ...makeSheet(17), showAnswerKey: true };
  const $ = load(renderToStaticMarkup(<View worksheet={sheet} answerSpace="medium" includeHints={false} t={t} tBrand={() => "skole"} />));
  assert.deepEqual($(".geometry-task-page").toArray().map(p => $(p).find(".print-task").length), [5, 6, 6]);
  assert.deepEqual($(".geometry-task-page .print-task-num").toArray().map(el => Number($(el).text())), Array.from({ length: 17 }, (_, i) => i + 1));
  assert.equal($(".print-brandbar").length, 1);
  assert.equal($(".print-meta-grid").length, 1);
  assert.equal($(".geometry-task-page svg").length, 17);
  assert.equal($(".geometry-task-page .print-answer-key").length, 0);
  assert.equal($(".geometry-answer-key .print-answer-key").length, 17);
  assert.equal($("input, textarea, select").length, 0);
});

test("saved counts and display options survive reopening without changing digital answers", () => {
  for (const count of [4, 6, 12, 60]) {
    const original = makeSheet(count);
    original.showFormulas = true;
    original.answerSpace = "large";
    original.tasks = original.tasks.map(task => ({ ...task, formula: buildFormula(task.figure!, "nb"), hint: buildHint(task.type, task.figure, "nb") }));
    const restored = sanitizeWorksheet(JSON.parse(JSON.stringify(original)))!;
    assert.equal(restored.tasks.length, count);
    assert.equal(restored.answerSpace, "large");
    assert.equal(restored.showFormulas, true);
    assert.deepEqual(restored.tasks.map(task => task.expected), original.tasks.map(task => task.expected));
    const $ = load(renderToStaticMarkup(<View worksheet={restored} answerSpace="large" includeHints t={t} tBrand={() => "skole"} />));
    assert.equal($(".geometry-task-page .print-hint").length, count);
    assert.equal($(".geometry-task-page .print-formula").length, count);
    assert.equal($(".geometry-task-page .print-task").length, count);
  }
});

test("page controls have translated full-sheet options and keep an explicit custom count", () => {
  for (const [language, messages] of Object.entries({ nb, en, pt })) {
    const translator = createTranslator({ locale: language, messages, namespace: "mathGeometry" });
    const panelTranslate = (key: string, values?: Record<string, string | number>) => translator(key as Parameters<typeof translator>[0], values);
    const p = { t: panelTranslate, language, topic: "all" as const, difficulty: "easy" as const, taskCount: 5, countMode: "pages" as "pages" | "custom", ...defaults, selectedShapes: ["square" as const], showAnswerKey: false, generating: false, saving: false, canGenerate: true, hasWorksheet: false, onCountModeChange() {}, onShare() {}, onTopicChange() {}, onMeasurementsChange() {}, onTaskCountChange() {}, onAnswerSpaceChange() {}, onToggleShape() {}, onSelectAll() {}, onClearAll() {}, onHintsChange() {}, onFormulasChange() {}, onAnswerKeyChange() {}, onGenerate() {}, onSave() {} };
    const $ = load(renderToStaticMarkup(<Panel {...p} />));
    assert.equal($("select[aria-describedby=geometry-page-count-hint] option[selected]").val(), "5");
    assert.ok($("select[aria-describedby=geometry-page-count-hint]").text().includes("11"));
    assert.doesNotMatch($("#geometry-page-count-hint").text(), /\{|generator\./);
    const custom = load(renderToStaticMarkup(<Panel {...p} countMode="custom" taskCount={12} />));
    assert.equal(custom("input[type=number]").attr("value"), "12");
  }
});
