import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { mathEditorHref } from "./editor";
import { getMathEditorCopy } from "./editorCopy";
import { applyGeometryDisplayOptions } from "./geometry/displayOptions";
import { sanitizeWorksheet } from "./geometry/sanitize";
import type { MathWorksheet } from "./geometry/types";
import { generateWorksheet, normalizeRequest } from "./fractions/generateWorksheet";
import { generateCalculationWorksheet, normalizeCalculationRequest } from "./fractions/generateCalculationWorksheet";
import { restoreFractionWorksheet } from "./fractions/restoreWorksheet";
import { gradeFractionWorksheet } from "./fractions/gradeWorksheet";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const Actions = require("../../components/generators/math/MathGeneratorActions").default as typeof import("@/components/generators/math/MathGeneratorActions").default;
const GeometryView = require("../../components/generators/math/geometry/GeometryWorksheetView").default as typeof import("@/components/generators/math/geometry/GeometryWorksheetView").default;
const callbacks = { onGenerate() {}, onSave() {}, onShare() {} };

test("every generator action uses the same order, labels and availability in each language", () => {
  for (const language of ["nb", "en", "pt"]) {
    const copy = getMathEditorCopy(language);
    const $ = load(renderToStaticMarkup(<Actions language={language} hasWorksheet {...callbacks} />));
    assert.deepEqual($("button").map((_, el) => $(el).text()).get(), [copy.generate, copy.save, copy.share, copy.print]);
    assert.equal($("button[disabled]").length, 0);
    const empty = load(renderToStaticMarkup(<Actions language={language} hasWorksheet={false} {...callbacks} />));
    assert.equal(empty("button[disabled]").length, 3);
    const busy = load(renderToStaticMarkup(<Actions language={language} hasWorksheet loading {...callbacks} />));
    assert.equal(busy("button[disabled]").length, 4);
    assert.equal(busy('[role="status"]').text(), copy.loading);
    const invalid = load(renderToStaticMarkup(<Actions language={language} hasWorksheet canGenerate={false} {...callbacks} />));
    assert.equal(invalid("button[disabled]").length, 1, "invalid new settings must still allow printing an existing worksheet");
  }
});

test("saved worksheet links reopen each generator with the worksheet id", () => {
  for (const path of ["arithmetic", "geometry", "fractions", "comparison", "measurement", "percentage", "equations"]) {
    assert.equal(mathEditorHref("nb", "saved/id?", path), `/nb/producer/math/${path}?edit=saved%2Fid%3F`);
  }
  assert.equal(mathEditorHref("en", "id", "fractions", "math-fraction-calculation-generator"), "/en/producer/math/fraction-calculation?edit=id");
  assert.equal(mathEditorHref("pt", "id", "fractions", "", { topic: "calculation" }), "/pt/producer/math/fraction-calculation?edit=id");
  assert.equal(mathEditorHref("nb", "id", "length"), "/nb/producer/math/measurement?edit=id");
});

const geometry: MathWorksheet = {
  title: "Geometri", language: "nb", level: "grade_5_7", topic: "area", difficulty: "easy",
  instructions: "Finn arealet.", showAnswerKey: false, showFormulas: false, selectedShapes: ["rectangle"],
  tasks: [{ id: "original", type: "area", prompt: "Finn arealet.", answer: "24 cm²", figure: { kind: "rectangle", widthCm: 6, heightCm: 4 } }],
};

test("saved geometry prints the chosen answer space and optional support without changing the task", () => {
  for (const [answerSpace, height] of [["small", "40"], ["medium", "72"], ["large", "110"]] as const) {
    for (const support of [false, true]) {
      const sheet = sanitizeWorksheet(JSON.parse(JSON.stringify(applyGeometryDisplayOptions(geometry, {
        answerSpace, includeHints: support, showFormulas: support, showAnswerKey: support,
      }))));
      assert.ok(sheet);
      const $ = load(renderToStaticMarkup(<GeometryView worksheet={sheet} answerSpace={sheet.answerSpace!} includeHints t={key => key} tBrand={key => key} />));
      assert.equal($(".print-answer-box").hasClass(`min-h-[${height}px]`), true);
      assert.equal($(".print-hint").length, Number(support));
      assert.equal($(".print-task-list").first().find(".print-formula").length, Number(support));
      assert.equal($(".geometry-answer-key").length, Number(support));
      assert.deepEqual(JSON.parse(JSON.stringify(sheet.tasks[0].figure)), geometry.tasks[0].figure);
      assert.equal(sheet.tasks[0].id, "original");
      assert.equal(sheet.tasks[0].answer, "24 cm²");
    }
  }
});

test("visual fraction reopening preserves selected unused models, range, language, IDs and grading", () => {
  const generated = generateWorksheet(normalizeRequest({ language: "pt", topic: "mixed", taskCount: 3, visualKinds: ["circle"], denominatorMin: 3, denominatorMax: 7 }));
  const stored = { ...generated, showHints: false, showAnswerKey: true, visualKinds: ["bar", "rectangle", "circle"] };
  const restored = restoreFractionWorksheet(JSON.parse(JSON.stringify(stored)));
  assert.deepEqual(restored, JSON.parse(JSON.stringify(stored)));
  assert.equal(gradeFractionWorksheet(restored!, {}).totalAuto, generated.tasks.length);
  assert.deepEqual(restored!.denominatorRange, { min: 3, max: 7 });
  assert.equal(restoreFractionWorksheet({ ...stored, tasks: [stored.tasks[0], stored.tasks[0]] }), null);
  assert.equal(restoreFractionWorksheet({ ...stored, tasks: [{ ...stored.tasks[0], fraction: { numerator: 1, denominator: 0 } }] }), null);
});

test("fraction arithmetic reopening preserves operation, denominator settings and reduction", () => {
  const original = generateCalculationWorksheet(normalizeCalculationRequest({ language: "en", operation: "division", denominatorRelation: "different", denominatorMin: 4, denominatorMax: 9, requireReduced: true, taskCount: 12, showAnswerKey: true }));
  const restored = restoreFractionWorksheet(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(restored, original);
  assert.equal(restored?.calculation?.denominatorRelation, "different");
  assert.equal(restored?.calculation?.requireReduced, true);
  assert.equal(restored?.language, "en");
});
