import assert from "node:assert/strict";
import test from "node:test";
import { applyGeometryDisplayOptions, buildFormula, buildHint } from "./displayOptions";
import { sanitizeWorksheet } from "./sanitize";
import { GEOMETRY_FIGURES } from "./types";
import type { MathWorksheet } from "./types";

const worksheet: MathWorksheet = {
  title: "Geometri", language: "nb", level: "grade_8_10", difficulty: "hard", topic: "all",
  instructions: "Finn navn, omkrets og areal.", showFormulas: false, showAnswerKey: false,
  selectedShapes: ["rectangle"], answerSpace: "medium",
  tasks: [{
    id: "1", type: "all_in_one", prompt: "Finn navn, omkrets og areal.",
    figure: { kind: "rectangle", widthCm: 8, heightCm: 4 },
    answer: "Rektangel, 24 cm, 32 cm²", inputMode: "split_name_perimeter_area",
    expected: { shapeName: "rektangel", perimeterValue: 24, areaValue: 32, perimeterUnit: "cm", areaUnit: "cm2" },
  }],
};
const options = { includeHints: true, showFormulas: true, showAnswerKey: true, answerSpace: "large" as const };

test("display toggles add support without changing geometry or digital answers", () => {
  const result = applyGeometryDisplayOptions(worksheet, options);
  assert.match(result.tasks[0].hint!, /navngi/);
  assert.match(result.tasks[0].formula!, /lengde/);
  assert.deepEqual(result.tasks[0].figure, worksheet.tasks[0].figure);
  assert.deepEqual(result.tasks[0].expected, worksheet.tasks[0].expected);
  assert.equal(result.tasks[0].answer, worksheet.tasks[0].answer);
  assert.equal(result.showAnswerKey, true);
  assert.equal(result.answerSpace, "large");
  assert.equal(worksheet.showAnswerKey, false);
  assert.equal(worksheet.tasks[0].hint, undefined);
});

test("disabled support is omitted from the saved payload", () => {
  const supported = applyGeometryDisplayOptions(worksheet, options);
  const result = applyGeometryDisplayOptions(supported, { ...options, includeHints: false, showFormulas: false });
  assert.equal(result.tasks[0].hint, undefined);
  assert.equal(result.tasks[0].formula, undefined);
  const stored = JSON.parse(JSON.stringify(result));
  assert.equal("hint" in stored.tasks[0], false);
  assert.equal("formula" in stored.tasks[0], false);
});

test("existing custom support is retained", () => {
  const custom = { ...worksheet, tasks: [{ ...worksheet.tasks[0], hint: "Eget hint", formula: "Egen formel" }] };
  const result = applyGeometryDisplayOptions(custom, options);
  assert.equal(result.tasks[0].hint, "Eget hint");
  assert.equal(result.tasks[0].formula, "Egen formel");
});

test("all shapes and task types have support in every app language", () => {
  for (const language of ["nb", "en", "pt"] as const) {
    for (const kind of GEOMETRY_FIGURES) {
      assert.ok(buildFormula({ kind }, language));
      for (const type of ["shape_name", "perimeter", "area", "all_in_one"] as const) {
        assert.ok(buildHint(type, { kind }, language));
      }
    }
  }
  assert.equal(buildHint("area", undefined, "nb"), undefined);
});

test("draft and saved worksheet restoration preserves legacy settings and digital grading", () => {
  const restored = sanitizeWorksheet(JSON.parse(JSON.stringify(worksheet)));
  assert.ok(restored);
  assert.equal(restored.level, "grade_8_10");
  assert.equal(restored.difficulty, "hard");
  assert.equal(restored.tasks[0].inputMode, "split_name_perimeter_area");
  assert.deepEqual(JSON.parse(JSON.stringify(restored.tasks[0].expected)), worksheet.tasks[0].expected);
});

test("invalid digital metadata is not restored", () => {
  const restored = sanitizeWorksheet({ ...worksheet, tasks: [{ ...worksheet.tasks[0], inputMode: "invalid", expected: { areaValue: "32", perimeterValue: Infinity, areaUnit: "bad" } }] });
  assert.ok(restored);
  assert.equal(restored.tasks[0].inputMode, undefined);
  assert.equal(restored.tasks[0].expected?.areaValue, undefined);
  assert.equal(restored.tasks[0].expected?.perimeterValue, undefined);
  assert.equal(restored.tasks[0].expected?.areaUnit, undefined);
});
