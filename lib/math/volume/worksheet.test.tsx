import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { DEFAULT_VOLUME_SETTINGS, VOLUME_MODES, VOLUME_SHAPES, generateVolumeWorksheet, gradeVolumeTask, gradeVolumeWorksheet, normalizeVolumeSettings, sanitizeVolumeWorksheet, volumeAnswerText, volumeExpected, volumeExpectedUnit, volumeGivenMagnitude, volumeTaskPrompt, type VolumeTask } from "./worksheet";
import { volumeFullPageCounts, volumePageCapacity, volumePrintPages } from "./printLayout";
import { mathEditorHref } from "../editor";
import { isMathWorksheet } from "@/lib/submissions/readers";
const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/volume/VolumeWorksheetView").default as typeof import("@/components/generators/math/volume/VolumeWorksheetView").default;
const Figure = require("../../../components/generators/math/volume/VolumeFigure").default as typeof import("@/components/generators/math/volume/VolumeFigure").default;
const base: VolumeTask = { id: "test", type: "calculate", shape: "cuboid", length: 2, width: 3, height: 4, lengthUnit: "cm" };
function random(seed: number) { return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; }; }

test("known cube, prism and cylinder values, missing measurements and litres", () => {
  assert.equal(volumeExpected(base), 24);
  assert.equal(volumeExpected({ ...base, shape: "cube", length: 3, width: 3, height: 3 }), 27);
  assert.equal(volumeExpected({ ...base, shape: "cylinder", length: 2, width: 2, height: 5 }), 62.8);
  assert.equal(volumeExpected({ ...base, shape: "cylinder", length: 1.5, width: 1.5, height: 2.5 }), 17.66);
  assert.equal(volumeExpected({ ...base, type: "missing_measure" }), 4);
  assert.equal(volumeExpected({ ...base, type: "missing_measure", shape: "cube", length: 3, width: 3, height: 3 }), 3);
  assert.equal(volumeExpected({ ...base, type: "word_problems", lengthUnit: "dm" }), 24);
  assert.equal(volumeExpectedUnit({ ...base, type: "word_problems", lengthUnit: "dm" }), "l");
  const decimal = { ...base, type: "missing_measure" as const, shape: "cube" as const, length: 1.5, width: 1.5, height: 1.5 };
  assert.equal(volumeGivenMagnitude(decimal), 3.375);
  assert.match(volumeTaskPrompt(decimal, "nb"), /3,375 cm³/);
});

test("grading separates number and requested unit, supports decimal commas and does not award working alone", () => {
  assert.equal(gradeVolumeTask(base, { value: "24", unit: "cm3" }).points, 1);
  assert.equal(gradeVolumeTask(base, { value: "24,00", unit: "cm3" }).points, 1);
  assert.equal(gradeVolumeTask(base, { value: "24", unit: "cm" }).points, .8);
  assert.equal(gradeVolumeTask(base, { value: "24", unit: "" }).isPartial, true);
  assert.equal(gradeVolumeTask(base, { value: "23", unit: "cm3" }).points, 0);
  assert.equal(gradeVolumeTask(base, { working: "2 * 3 * 4" }).points, 0);
  assert.equal(gradeVolumeTask(base, { working: "2 * 3 * 4" }).isAnswered, true);
  for (const value of [undefined, {}, { value: "", unit: "", working: "" }]) assert.equal(gradeVolumeTask(base, value).isAnswered, false);
  for (const value of ["NaN", "Infinity", "24cm3", "24/1", "<script>", "2e1", "-24"]) assert.equal(gradeVolumeTask(base, { value, unit: "cm3" }).points, 0);
});

for (const language of ["nb", "en", "pt"] as const) test(`generation, sanitization and complete grading across modes and solids (${language})`, () => {
  for (const taskType of VOLUME_MODES) for (const shape of VOLUME_SHAPES) for (const allowDecimals of [false, true]) {
    if (taskType === "count_cubes" && shape === "cylinder") continue;
    const sheet = generateVolumeWorksheet({ ...DEFAULT_VOLUME_SETTINGS, taskType, shapes: [shape], allowDecimals, taskCount: 16 }, language, true, random(27));
    assert.deepEqual(sanitizeVolumeWorksheet(JSON.parse(JSON.stringify(sheet))), sheet);
    assert.equal(isMathWorksheet(sheet), false, "volume must not fall through to the 2D geometry renderer");
    assert.equal(new Set(sheet.tasks.map(t => t.id)).size, 16);
    const answers = Object.fromEntries(sheet.tasks.map(task => [task.id, { value: String(volumeExpected(task)), unit: volumeExpectedUnit(task), working: "test" }]));
    assert.equal(gradeVolumeWorksheet(sheet, answers).percentAuto, 100);
    assert.equal(gradeVolumeWorksheet(sheet, {}).unansweredAuto, 16);
    for (const task of sheet.tasks) {
      assert.ok(task.shape === shape);
      assert.ok(volumeExpected(task) > 0);
      assert.ok(!volumeTaskPrompt(task, language).includes("undefined"));
      if (task.type === "count_cubes") assert.ok([task.length, task.width, task.height].every(v => Number.isInteger(v) && v <= 5));
      if (task.type === "word_problems") assert.equal(task.lengthUnit, "dm");
    }
    if (taskType === "mixed") assert.equal(new Set(sheet.tasks.map(t => t.type)).size, shape === "cylinder" ? 3 : 4);
  }
});

test("malformed settings and tampered saved worksheets are rejected, and stored answers cannot override computed results", () => {
  for (const patch of [{ shapes: [] }, { shapes: ["sphere"] }, { shapes: ["cube", "cube"] }, { taskCount: 0 }, { taskCount: 61 }, { taskCount: 1.5 }, { maximum: "10" }, { allowDecimals: "true" }, { taskType: "unknown" }, { taskType: "count_cubes", shapes: ["cylinder"] }]) assert.throws(() => normalizeVolumeSettings({ ...DEFAULT_VOLUME_SETTINGS, ...patch }));
  const sheet = generateVolumeWorksheet({ ...DEFAULT_VOLUME_SETTINGS, shapes: ["cube"], taskType: "calculate" }, "nb", false, random(19));
  for (const patch of [{ length: -1 }, { length: Infinity }, { width: 99 }, { shape: "cylinder" }, { id: "bad/id" }, { type: "bad" }, { lengthUnit: "mm" }]) {
    const copy = structuredClone(sheet); Object.assign(copy.tasks[0], patch); assert.equal(sanitizeVolumeWorksheet(copy), null);
  }
  const duplicate = structuredClone(sheet); duplicate.tasks[1].id = duplicate.tasks[0].id; assert.equal(sanitizeVolumeWorksheet(duplicate), null);
  assert.equal(sanitizeVolumeWorksheet({ ...sheet, tasks: [] }), null);
  const forged = { ...sheet, tasks: sheet.tasks.map(task => ({ ...task, answer: 999999 })) };
  const clean = sanitizeVolumeWorksheet(forged)!;
  assert.equal("answer" in clean.tasks[0], false);
  assert.notEqual(volumeExpected(clean.tasks[0]), 999999);
});

test("page presets and explicit custom counts preserve every task once with continuous numbering", () => {
  assert.deepEqual(volumeFullPageCounts(false).slice(0, 3), [6, 14, 22]);
  assert.deepEqual(volumeFullPageCounts(true).slice(0, 3), [6, 12, 18]);
  for (const support of [false, true]) for (let count = 1; count <= 60; count++) {
    const tasks = Array.from({ length: count }, (_, i) => i), pages = volumePrintPages(tasks, support), capacity = volumePageCapacity(support);
    assert.deepEqual(pages.flatMap(p => p.tasks), tasks);
    assert.ok(pages.every((p, i) => p.tasks.length <= (i === 0 ? capacity.first : capacity.following)));
    assert.deepEqual(pages.map(p => p.startIndex), pages.map((_, i) => i === 0 ? 0 : capacity.first + (i - 1) * capacity.following));
  }
});

for (const language of ["nb", "en", "pt"] as const) test(`print, student answers and figures have correct boundaries and accessible labels (${language})`, () => {
  const sheet = generateVolumeWorksheet({ ...DEFAULT_VOLUME_SETTINGS, taskCount: 14, shapes: ["cube", "cuboid", "cylinder"], allowDecimals: true }, language, true, random(99));
  const printed = load(renderToStaticMarkup(<View worksheet={sheet} printMode />));
  assert.equal(printed(".length-page").length, 2);
  assert.equal(printed(".length-page").first().find(".length-task").length, 6);
  assert.equal(printed(".length-page").last().find(".length-task").length, 8);
  assert.equal(printed(".length-identity").length, 1);
  assert.equal(printed(".length-key").length, 1);
  assert.equal(printed("input,textarea,select").length, 0);
  assert.deepEqual(printed(".length-number").map((_, e) => Number(printed(e).text())).get(), Array.from({ length: 14 }, (_, i) => i + 1));
  const first = sheet.tasks[0], answers = { [first.id]: { value: String(volumeExpected(first)), unit: volumeExpectedUnit(first), working: "My working" } };
  const pupil = load(renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={answers} readOnly showAutoCheck />));
  assert.equal(pupil(".length-key").length, 0, "saved teacher key is never exposed by digital pupil rendering");
  assert.equal(pupil("input[readonly],textarea[readonly],select[disabled]").length, 42);
  assert.equal(pupil("textarea").first().text(), "My working");
  assert.ok(pupil(".length-summary").text().includes("7%"));
  pupil("input,textarea,select").each((_, e) => assert.ok(pupil(e).attr("aria-label")));
  assert.equal(pupil("svg[role=img]").length, 14);
  const hidden: VolumeTask = { ...base, shape: "cylinder", type: "missing_measure", length: 2, width: 2, height: 19.5 };
  const figure = load(renderToStaticMarkup(<Figure task={hidden} language={language} />));
  assert.ok(figure("svg").attr("aria-label")?.includes("?"));
  assert.ok(figure("svg").text().includes("r = 2 cm"));
  assert.ok(!figure("svg").text().includes("19.5") && !figure("svg").text().includes("19,5"));
  assert.equal(mathEditorHref(language, "saved/id?", "volume"), `/${language}/producer/math/volume?edit=saved%2Fid%3F`);
  assert.ok(volumeAnswerText(first, language).length > 1);
});
