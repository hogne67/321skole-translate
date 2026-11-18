import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { DEFAULT_SCALE_SETTINGS, SCALE_LEVELS, SCALE_MODES, generateScaleWorksheet, gradeScaleTask, gradeScaleWorksheet, normalizeScaleSettings, sanitizeScaleWorksheet, scaleExpected, scaleExpectedUnit, scaleTaskPrompt, scaleSolution, type ScaleMeasurementTask, type ScaleSimilarTask } from "./worksheet";
import { scaleFullPageCounts, scalePageCapacity, scalePrintPages } from "./printLayout";
import { getAssignmentDerivedState } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/assignmentDerivedState";
import { mathEditorHref } from "../editor";
const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/scale/ScaleWorksheetView").default as typeof import("@/components/generators/math/scale/ScaleWorksheetView").default;
const Figure = require("../../../components/generators/math/scale/ScaleFigure").default as typeof import("@/components/generators/math/scale/ScaleFigure").default;
const measure: ScaleMeasurementTask = { id: "known", type: "real_length", drawing: 5, real: 5, realUnit: "m", left: 1, right: 100, context: "plan" };
const similar: ScaleSimilarTask = { id: "similar", type: "similar_sides", shape: "rectangle", a: 3, b: 4, factor: 3, missing: "large", unit: "cm" };
function seeded(seed: number) { return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; }; }

test("known reductions, enlargements, conversions and corresponding sides", () => {
  assert.equal(scaleExpected(measure), 5);
  assert.equal(scaleExpected({ ...measure, drawing: 4, real: 2, right: 50 }), 2);
  assert.equal(scaleExpected({ ...measure, type: "drawing_length", real: 8, drawing: 16, right: 50 }), 16);
  assert.equal(scaleExpected({ ...measure, drawing: 4, real: .4, right: 10000, realUnit: "km", context: "map" }), .4);
  assert.equal(scaleExpected({ ...measure, left: 5, right: 1, drawing: 12.5, real: 2.5, realUnit: "cm", context: "model" }), 2.5);
  assert.deepEqual(scaleExpected({ ...measure, type: "find_scale", drawing: 4, real: 2, right: 50 }), { left: 1, right: 50 });
  assert.equal(scaleExpected(similar), 12);
  assert.equal(scaleExpected({ ...similar, missing: "small" }), 4);
  assert.equal(scaleExpected({ ...similar, b: 3.5, factor: 2.5 }), 8.75);
  assert.equal(scaleExpectedUnit(measure), "m");
  assert.equal(scaleExpectedUnit({ ...measure, type: "drawing_length" }), "cm");
  assert.match(scaleSolution({ ...measure, type: "find_scale", drawing: 4, real: 2, right: 50 }, "nb"), /4 : 200 = 1 : 50/);
});

test("grading distinguishes requested units, equivalent ratios, normalized ratios and reversed scales", () => {
  assert.equal(gradeScaleTask(measure, { value: "5,00", unit: "m" }).points, 1);
  assert.equal(gradeScaleTask(measure, { value: "5", unit: "cm" }).points, .8);
  assert.equal(gradeScaleTask(measure, { value: "500", unit: "cm" }).points, 0, "answer must use the requested unit");
  assert.equal(gradeScaleTask(measure, { working: "5 × 100 = 500 cm = 5 m" }).points, 0);
  assert.equal(gradeScaleTask(measure, { working: "test" }).isAnswered, true);
  assert.equal(gradeScaleTask(measure, undefined).isAnswered, false);
  const task = { ...measure, type: "find_scale" as const };
  assert.equal(gradeScaleTask(task, { ratioLeft: "1", ratioRight: "100" }).points, 1);
  assert.equal(gradeScaleTask(task, { ratioLeft: "2", ratioRight: "200" }).points, .8);
  assert.equal(gradeScaleTask(task, { ratioLeft: "0,01", ratioRight: "1" }).points, .8);
  assert.equal(gradeScaleTask(task, { ratioLeft: "100", ratioRight: "1" }).points, 0);
  assert.equal(gradeScaleTask(task, { ratioLeft: "1" }).points, 0);
  assert.equal(gradeScaleTask({ ...task, left: 5, right: 1 }, { ratioLeft: "5", ratioRight: "1" }).points, 1);
  for (const value of ["0", "-5", "5 m", "1/2", "1e2", "Infinity", "<script>"]) assert.equal(gradeScaleTask(measure, { value, unit: "m" }).points, 0);
});

test("all modes and levels round-trip across languages, with balanced enlargement and similarity tasks", () => {
  for (const taskType of SCALE_MODES) for (const level of SCALE_LEVELS) for (const language of ["nb", "en", "pt"]) {
    const sheet = generateScaleWorksheet({ ...DEFAULT_SCALE_SETTINGS, taskType, level, taskCount: 32 }, language, true, seeded(123));
    assert.deepEqual(sanitizeScaleWorksheet(JSON.parse(JSON.stringify(sheet))), sheet, `${taskType}/${level}/${language}`);
    const answers = Object.fromEntries(sheet.tasks.map(task => { const expected = scaleExpected(task); return [task.id, typeof expected === "number" ? { value: String(expected), unit: scaleExpectedUnit(task) } : { ratioLeft: String(expected.left), ratioRight: String(expected.right) }]; }));
    assert.equal(gradeScaleWorksheet(sheet, answers).percentAuto, 100);
    assert.equal(gradeScaleWorksheet(sheet, {}).unansweredAuto, 32);
    sheet.tasks.forEach(task => assert.ok(!/[{}]|undefined/.test(scaleTaskPrompt(task, language))));
    const measurements = sheet.tasks.filter((t): t is ScaleMeasurementTask => t.type !== "similar_sides");
    if (level === "advanced" && measurements.length) assert.equal(new Set(measurements.map(t => t.left > 1)).size, 2);
    if (level === "units" && measurements.length) assert.equal(new Set(measurements.map(t => t.realUnit)).size, 2);
    const figures = sheet.tasks.filter((t): t is ScaleSimilarTask => t.type === "similar_sides");
    if (figures.length) assert.equal(new Set(figures.map(t => `${t.shape}/${t.missing}`)).size, 4);
    if (taskType === "mixed") assert.equal(new Set(sheet.tasks.map(t => t.type)).size, 4);
  }
});

test("settings and malformed saved measurements are rejected; forged answers are discarded", () => {
  for (const patch of [{ taskType: "bad" }, { level: "bad" }, { taskCount: 0 }, { taskCount: 61 }, { taskCount: 1.5 }, { showSupport: 1 }]) assert.throws(() => normalizeScaleSettings({ ...DEFAULT_SCALE_SETTINGS, ...patch }));
  const sheet = generateScaleWorksheet({ ...DEFAULT_SCALE_SETTINGS, taskType: "real_length", level: "units" }, "nb", false, seeded(9));
  for (const patch of [{ drawing: 0 }, { real: Infinity }, { real: 99999 }, { right: 0 }, { left: 5 }, { realUnit: "mm" }, { context: "bad" }, { type: "similar_sides" }, { id: "bad/id" }]) {
    const edited = structuredClone(sheet); Object.assign(edited.tasks[0], patch); assert.equal(sanitizeScaleWorksheet(edited), null);
  }
  const duplicate = structuredClone(sheet); duplicate.tasks[1].id = duplicate.tasks[0].id; assert.equal(sanitizeScaleWorksheet(duplicate), null);
  const clean = sanitizeScaleWorksheet({ ...sheet, tasks: sheet.tasks.map(task => ({ ...task, answer: 999 })) })!;
  assert.ok(clean); assert.equal("answer" in clean.tasks[0], false);
  const figures = generateScaleWorksheet({ ...DEFAULT_SCALE_SETTINGS, taskType: "similar_sides" }, "nb", false, seeded(1));
  for (const patch of [{ a: 0 }, { b: NaN }, { factor: 0 }, { factor: 100 }, { missing: "a" }, { unit: "km" }]) {
    const edited = structuredClone(figures); Object.assign(edited.tasks[0], patch); assert.equal(sanitizeScaleWorksheet(edited), null);
  }
});

test("page counts keep all tasks once and number them consecutively", () => {
  assert.deepEqual(scaleFullPageCounts(false).slice(0, 3), [6, 14, 22]);
  assert.deepEqual(scaleFullPageCounts(true).slice(0, 3), [6, 12, 18]);
  for (const support of [false, true]) for (let count = 1; count <= 60; count++) {
    const tasks = Array.from({ length: count }, (_, i) => i), pages = scalePrintPages(tasks, support), cap = scalePageCapacity(support);
    assert.deepEqual(pages.flatMap(p => p.tasks), tasks);
    assert.ok(pages.every((p, i) => p.tasks.length <= (i === 0 ? cap.first : cap.following)));
  }
});

for (const language of ["nb", "en", "pt"] as const) test(`print, digital answers and hidden figure values (${language})`, () => {
  const sheet = generateScaleWorksheet({ ...DEFAULT_SCALE_SETTINGS, taskCount: 14, level: "advanced" }, language, true, seeded(91));
  const printed = load(renderToStaticMarkup(<View worksheet={sheet} printMode />));
  assert.equal(printed(".length-page").length, 2);
  assert.equal(printed(".length-page").first().find(".length-task").length, 6);
  assert.equal(printed(".length-key").length, 1);
  assert.equal(printed("input,textarea,select").length, 0);
  assert.equal(printed(".scale-print-ratio").length, sheet.tasks.filter(t => t.type === "find_scale").length);
  assert.deepEqual(printed(".length-number").map((_, e) => Number(printed(e).text())).get(), Array.from({ length: 14 }, (_, i) => i + 1));
  const pupil = load(renderToStaticMarkup(<View worksheet={sheet} readOnly showAutoCheck />));
  assert.equal(pupil(".length-key").length, 0);
  assert.equal(pupil("textarea[readonly]").length, 14);
  assert.ok(pupil("input,textarea,select").toArray().every(e => pupil(e).attr("aria-label")));
  for (const hidden of [measure, { ...measure, type: "drawing_length" as const }, { ...measure, type: "find_scale" as const }, similar, { ...similar, missing: "small" as const }]) {
    const figure = load(renderToStaticMarkup(<Figure task={hidden} language={language} />));
    assert.equal(figure("svg[role=img]").length, 1);
    assert.ok(figure("svg").text().includes("?"));
    if (hidden.type === "find_scale") assert.ok(figure("svg").text().includes("? : ?") && !figure("svg").text().includes("1 : 100"));
    if (hidden.type === "similar_sides") assert.ok(!figure("svg").text().includes(hidden.missing === "large" ? "12 cm" : "4 cm"));
    assert.ok(!figure("svg").html()?.includes("NaN"));
  }
  const derived = getAssignmentDerivedState({ mathWorksheet: sheet, mathType: "scale" } as Parameters<typeof getAssignmentDerivedState>[0], null);
  assert.equal(derived.isScaleAssignment, true); assert.equal(derived.isGeometryAssignment, false);
  assert.equal(mathEditorHref(language, "saved/id?", "scale"), `/${language}/producer/math/scale?edit=saved%2Fid%3F`);
});
