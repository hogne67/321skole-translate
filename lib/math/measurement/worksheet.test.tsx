import assert from "node:assert/strict";
import test from "node:test";
import Fraction from "fraction.js";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { MEASUREMENT_CATEGORIES, convertMeasurement, generateMeasurementWorksheet, getMeasurementCopy, getMeasurementDefaults, getMeasurementUnits, gradeMeasurementWorksheet, measurementPairs, normalizeMeasurementSettings, sanitizeMeasurementWorksheet } from "./worksheet";
import { getAssignmentDerivedState } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/assignmentDerivedState";
import { assignmentToLesson, hasSnapshotContent } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/helpers";
import { assignmentSnapshotToLesson, hasAssignmentSnapshotContent, isFractionWorksheet } from "@/lib/submissions/readers";
import { POST } from "@/app/api/generate-measurement-worksheet/route";
const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/length/LengthWorksheetView").default as typeof import("@/components/generators/math/length/LengthWorksheetView").default;

test("mass and litre conversions use exact SI factors", () => {
  for (const [amount, from, to, expected] of [["1", "t", "kg", "1000"], ["1", "kg", "hg", "10"], ["1", "hg", "g", "100"], ["1", "g", "mg", "1000"], ["0.25", "kg", "g", "250"], ["250", "g", "kg", "0.25"], ["1", "l", "dl", "10"], ["1", "l", "ml", "1000"], ["25", "cl", "l", "0.25"], ["1.5", "dl", "ml", "150"]] as const) assert.equal(convertMeasurement(amount, from, to), expected);
});
test("categories cannot be mixed in settings, tasks or conversions", () => {
  assert.throws(() => convertMeasurement("1", "kg", "l"), /INVALID_UNITS/);
  assert.throws(() => convertMeasurement("1", "m", "g"), /INVALID_UNITS/);
  assert.throws(() => normalizeMeasurementSettings({ ...getMeasurementDefaults("mass"), units: ["kg", "l"] }), /INVALID_UNITS/);
  assert.throws(() => normalizeMeasurementSettings({ ...getMeasurementDefaults("length"), category: "temperature" }), /INVALID_CATEGORY/);
  const sheet = generateMeasurementWorksheet(getMeasurementDefaults("volume"));
  assert.equal(sanitizeMeasurementWorksheet({ ...sheet, settings: { ...sheet.settings, category: "mass" } }), null);
});
for (const category of MEASUREMENT_CATEGORIES) for (const allowDecimals of [false, true]) test(`${category} preserves ranges, exact precision, balanced pairs and grading, decimals=${allowDecimals}`, () => {
  for (let run = 0; run < 10; run++) {
    const worksheet = generateMeasurementWorksheet({ ...getMeasurementDefaults(category), units: [...getMeasurementUnits(category)], allowDecimals, taskCount: 100 });
    assert.equal(worksheet.kind, "measurement");
    assert.equal(worksheet.settings.category, category);
    const counts = new Map<string, number>();
    for (const task of worksheet.tasks) {
      assert.ok(getMeasurementUnits(category).includes(task.fromUnit));
      assert.ok(getMeasurementUnits(category).includes(task.toUnit));
      assert.equal(task.type, "unit_conversion");
      assert.equal(new Fraction(task.quantity).mul(allowDecimals ? 100 : 1).d, BigInt(1));
      assert.equal(new Fraction(task.answer).mul(allowDecimals ? 1000 : 1).d, BigInt(1));
      assert.equal(task.answer, convertMeasurement(task.quantity, task.fromUnit, task.toUnit));
      assert.ok(new Fraction(task.quantity).compare(worksheet.settings.minimum) >= 0 && new Fraction(task.quantity).compare(worksheet.settings.maximum) <= 0);
      const key = `${task.fromUnit}-${task.toUnit}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    assert.equal(counts.size, measurementPairs(worksheet.settings).length);
    assert.ok(Math.max(...counts.values()) - Math.min(...counts.values()) <= 1);
    assert.deepEqual(sanitizeMeasurementWorksheet(worksheet), worksheet);
    const answers = Object.fromEntries(worksheet.tasks.map(task => [task.id, task.answer.replace(".", ",")]));
    assert.equal(gradeMeasurementWorksheet(worksheet, answers).percentAuto, 100);
  }
});
test("the largest permitted tonne-to-milligram answer remains exact and gradeable", () => {
  const sheet = generateMeasurementWorksheet({ ...getMeasurementDefaults("mass"), units: ["t", "mg"], minimum: 100000, maximum: 100000 });
  assert.equal(sheet.tasks[0].answer, "100000000000000");
  assert.equal(gradeMeasurementWorksheet(sheet, Object.fromEntries(sheet.tasks.map(task => [task.id, task.answer]))).percentAuto, 100);
});
test("legacy length worksheets keep task IDs, answers, title and submission compatibility", () => {
  const current = generateMeasurementWorksheet(getMeasurementDefaults("length"));
  const settings = { ...current.settings };
  delete settings.category;
  const legacy = { ...current, kind: "length", settings, tasks: current.tasks.map((task, i) => ({ ...task, id: `length_${i + 1}`, type: "length_conversion" })) };
  const normalized = sanitizeMeasurementWorksheet(legacy)!;
  assert.ok(normalized);
  assert.equal(normalized.kind, "length");
  assert.equal(normalized.settings.category, "length");
  assert.equal(normalized.title, current.title);
  assert.deepEqual(normalized.tasks.map(task => task.id), legacy.tasks.map(task => task.id));
  assert.deepEqual(normalized.tasks.map(task => task.answer), legacy.tasks.map(task => task.answer));
  assert.equal(gradeMeasurementWorksheet(normalized, Object.fromEntries(legacy.tasks.map(task => [task.id, task.answer]))).percentAuto, 100);
  assert.equal(sanitizeMeasurementWorksheet({ ...legacy, settings: getMeasurementDefaults("mass") }), null);
});
for (const category of MEASUREMENT_CATEGORIES) test(`${category} snapshots reach student and teacher, with printable key kept out of student view`, () => {
  const worksheet = generateMeasurementWorksheet({ ...getMeasurementDefaults(category), taskCount: 6 }, "nb", true);
  const assignment = { measurementWorksheet: worksheet, contentType: "measurement_worksheet", mathType: "measurement" };
  assert.ok(hasSnapshotContent(assignment));
  assert.ok(hasAssignmentSnapshotContent(assignment));
  const student = getAssignmentDerivedState(assignmentToLesson(assignment), assignment);
  assert.deepEqual(student.lengthWorksheet, worksheet);
  assert.ok(student.isLengthAssignment);
  assert.equal(student.isFractionAssignment, false);
  assert.equal(isFractionWorksheet(worksheet), false);
  assert.deepEqual(assignmentSnapshotToLesson(assignment).measurementWorksheet, worksheet);
  const answers = Object.fromEntries(worksheet.tasks.map(task => [task.id, task.answer]));
  const teacher = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} readOnly showAutoCheck />));
  assert.equal(teacher("input[readonly]").length, 6);
  assert.equal(teacher(".length-correct").length, 6);
  assert.equal(teacher(".length-key").length, 0);
  const print = load(renderToStaticMarkup(<View worksheet={worksheet} printMode />));
  assert.equal(print(".length-key p").length, 6);
  assert.equal(print(".length-answer-space").length, 6);
});
test("category titles and menus are localized", () => {
  for (const language of ["nb", "en", "pt"]) for (const category of MEASUREMENT_CATEGORIES) {
    const copy = getMeasurementCopy(language, category);
    assert.equal(copy.title, copy[category]);
    const sheet = generateMeasurementWorksheet(getMeasurementDefaults(category), language);
    assert.equal(sheet.title, copy.worksheetTitle);
    assert.ok(sheet.title.includes(copy[category]));
  }
  assert.equal(getMeasurementCopy("pt").mass, "Massa");
});
test("API generates all categories and rejects cross-category unit requests", async () => {
  const req = (settings: unknown) => new Request("http://localhost/api/generate-measurement-worksheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings }) });
  for (const category of MEASUREMENT_CATEGORIES) {
    const response = await POST(req(getMeasurementDefaults(category)));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).worksheet.settings.category, category);
  }
  assert.equal((await POST(req({ ...getMeasurementDefaults("mass"), units: ["kg", "ml"] }))).status, 400);
});
