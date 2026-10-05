import assert from "node:assert/strict";
import test from "node:test";
import Fraction from "fraction.js";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { DEFAULT_LENGTH_SETTINGS, LENGTH_UNITS, convertLength, generateLengthWorksheet, gradeLengthWorksheet, lengthPairs, normalizeLengthSettings, parseLengthNumber, sanitizeLengthWorksheet } from "./worksheet";
import { getAssignmentDerivedState } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/assignmentDerivedState";
import { assignmentToLesson, hasSnapshotContent } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/helpers";
import { isFractionWorksheet as studentFractionGuard } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/worksheetTypeGuards";
import { assignmentSnapshotToLesson, hasAssignmentSnapshotContent, isFractionWorksheet as teacherFractionGuard } from "@/lib/submissions/readers";
import { POST } from "@/app/api/generate-length-worksheet/route";

const nodeRequire = createRequire(import.meta.url);
nodeRequire.extensions[".css"] = () => {};
const View = nodeRequire("../../../components/generators/math/length/LengthWorksheetView").default as typeof import("@/components/generators/math/length/LengthWorksheetView").default;

test("conversions use exact metric ratios, including Norwegian mil", () => {
  assert.equal(convertLength("1", "mil", "km"), "10");
  assert.equal(convertLength("1", "mil", "mm"), "10000000");
  assert.equal(convertLength("75", "cm", "m"), "0.75");
  assert.equal(convertLength("1.5", "m", "cm"), "150");
  assert.equal(convertLength("1", "mm", "m"), "0.001");
  for (const from of LENGTH_UNITS) for (const to of LENGTH_UNITS) assert.equal(convertLength(convertLength("12.34", from, to), to, from), "12.34");
});
for (const allowDecimals of [false, true]) test(`all units generate exact balanced conversions, decimals=${allowDecimals}`, () => {
  for (let run = 0; run < 20; run++) {
    const worksheet = generateLengthWorksheet({ ...DEFAULT_LENGTH_SETTINGS, units: [...LENGTH_UNITS], taskCount: 100, allowDecimals });
    const pairs = lengthPairs(worksheet.settings);
    const counts = new Map<string, number>();
    for (const task of worksheet.tasks) {
      assert.ok(worksheet.settings.units.includes(task.fromUnit));
      assert.notEqual(task.fromUnit, task.toUnit);
      const source = new Fraction(task.quantity);
      const answer = new Fraction(task.answer);
      assert.ok(source.compare(worksheet.settings.minimum) >= 0 && source.compare(worksheet.settings.maximum) <= 0);
      assert.equal(source.mul(allowDecimals ? 100 : 1).d, BigInt(1));
      assert.equal(answer.mul(allowDecimals ? 1000 : 1).d, BigInt(1));
      assert.equal(task.answer, convertLength(task.quantity, task.fromUnit, task.toUnit));
      const key = `${task.fromUnit}-${task.toUnit}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    assert.equal(counts.size, pairs.length);
    assert.ok(Math.max(...counts.values()) - Math.min(...counts.values()) <= 1);
    assert.equal(new Set(worksheet.tasks.map(task => task.id)).size, 100);
    assert.deepEqual(sanitizeLengthWorksheet(worksheet), worksheet);
  }
});
test("narrow whole-number ranges exclude impossible directions without rounding", () => {
  const worksheet = generateLengthWorksheet({ ...DEFAULT_LENGTH_SETTINGS, minimum: 1, maximum: 99 });
  assert.ok(worksheet.tasks.every(task => task.fromUnit === "m" && task.toUnit === "cm"));
  const decimal = generateLengthWorksheet({ ...DEFAULT_LENGTH_SETTINGS, units: ["km", "mil"], minimum: 1, maximum: 1, allowDecimals: true });
  assert.ok(decimal.tasks.some(task => task.fromUnit === "km" && task.answer === "0.1"));
  const fixed = generateLengthWorksheet({ ...DEFAULT_LENGTH_SETTINGS, minimum: 300, maximum: 300 });
  assert.ok(fixed.tasks.every(task => task.quantity === "300"));
  assert.ok(fixed.tasks.some(task => task.answer === "3"));
});
test("decimal boundaries are exact, including values not exactly representable as floats", () => {
  const worksheet = generateLengthWorksheet({ ...DEFAULT_LENGTH_SETTINGS, minimum: 1.13, maximum: 1.13, allowDecimals: true });
  assert.ok(worksheet.tasks.every(task => task.quantity === "1.13"));
  assert.ok(worksheet.tasks.every(task => task.answer === "113"));
  const zero = generateLengthWorksheet({ ...DEFAULT_LENGTH_SETTINGS, minimum: 0, maximum: 0 });
  assert.ok(zero.tasks.every(task => task.answer === "0"));
});
test("settings reject empty units, invalid numbers, decimals when off and excessive task counts", () => {
  for (const partial of [{ units: ["m"] }, { units: ["m", "m"] }, { units: ["m", "inch"] }, { minimum: NaN }, { maximum: Infinity }, { minimum: -1 }, { maximum: 100001 }, { minimum: 1001 }, { minimum: 1.13 }, { taskCount: 0 }, { taskCount: 101 }, { taskCount: 3.5 }]) assert.throws(() => normalizeLengthSettings({ ...DEFAULT_LENGTH_SETTINGS, ...partial }), /INVALID_/);
});
test("sanitization recomputes answers and rejects changed units, precision and duplicate IDs", () => {
  const worksheet = generateLengthWorksheet(DEFAULT_LENGTH_SETTINGS);
  const tampered = structuredClone(worksheet);
  tampered.tasks[0].answer = "9999";
  assert.equal(sanitizeLengthWorksheet(tampered)?.tasks[0].answer, worksheet.tasks[0].answer);
  tampered.tasks[1].id = tampered.tasks[0].id;
  assert.equal(sanitizeLengthWorksheet(tampered), null);
  assert.equal(sanitizeLengthWorksheet({ ...worksheet, tasks: [] }), null);
  assert.equal(sanitizeLengthWorksheet({ ...worksheet, kind: "fractions" }), null);
  const bad = structuredClone(worksheet);
  bad.tasks[0].quantity = "1.5";
  assert.equal(sanitizeLengthWorksheet(bad), null);
  bad.tasks[0].quantity = "100001";
  assert.equal(sanitizeLengthWorksheet(bad), null);
});
test("grading accepts comma, dot and equivalent formatting, but not incorrect precision", () => {
  const worksheet = generateLengthWorksheet({ ...DEFAULT_LENGTH_SETTINGS, minimum: 75, maximum: 75, allowDecimals: true });
  const task = worksheet.tasks.find(task => task.fromUnit === "cm")!;
  const sheet = { ...worksheet, tasks: [task] };
  for (const answer of ["0,75", "0.75", "00.7500", " 0,75 "]) assert.equal(gradeLengthWorksheet(sheet, { [task.id]: answer }).percentAuto, 100);
  for (const answer of ["0.7501", "75", "0.75 m", "3/4", "1e0", "0,7,5", "no"]) assert.equal(gradeLengthWorksheet(sheet, { [task.id]: answer }).wrongAuto, 1);
  assert.equal(gradeLengthWorksheet(sheet, { [task.id]: " " }).unansweredAuto, 1);
  for (const value of [null, {}, true, "NaN", "Infinity", "-1", "1 0"]) assert.equal(parseLengthNumber(value), null);
});
test("assignment snapshots retain the same worksheet and do not misclassify it as fractions", () => {
  const worksheet = generateLengthWorksheet(DEFAULT_LENGTH_SETTINGS);
  const assignment = { title: worksheet.title, lengthWorksheet: worksheet, contentType: "length_worksheet", mathType: "measurement" };
  assert.equal(hasSnapshotContent(assignment), true);
  assert.equal(hasAssignmentSnapshotContent(assignment), true);
  const student = getAssignmentDerivedState(assignmentToLesson(assignment), assignment);
  assert.deepEqual(student.lengthWorksheet, worksheet);
  assert.equal(student.isLengthAssignment, true);
  assert.equal(student.isFractionAssignment, false);
  assert.equal(studentFractionGuard(worksheet), false);
  assert.equal(teacherFractionGuard(worksheet), false);
  assert.deepEqual(assignmentSnapshotToLesson(assignment).lengthWorksheet, worksheet);
  assert.equal(getAssignmentDerivedState({ mathWorksheet: worksheet }, null).isLengthAssignment, true);
});
test("digital views share inline inputs, read-only results and hide the printable answer key", () => {
  const worksheet = generateLengthWorksheet({ ...DEFAULT_LENGTH_SETTINGS, taskCount: 6 }, "nb", true);
  const answers = Object.fromEntries(worksheet.tasks.map(task => [task.id, task.answer]));
  const student = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} />));
  assert.equal(student("input").length, 6);
  assert.equal(student(".length-key").length, 0);
  assert.equal(student(".length-result").length, 0);
  const teacher = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} readOnly showAutoCheck />));
  assert.equal(teacher("input[readonly]").length, 6);
  assert.equal(teacher(".length-correct").length, 6);
  assert.equal(teacher(".length-key").length, 0);
});
test("print output paginates at 36 tasks and keeps answers on a separate page", () => {
  const worksheet = generateLengthWorksheet({ ...DEFAULT_LENGTH_SETTINGS, taskCount: 100 }, "nb", true);
  const $ = load(renderToStaticMarkup(<View worksheet={worksheet} printMode />));
  assert.equal($(".length-page").length, 3);
  assert.equal($(".length-task").length, 100);
  assert.equal($(".length-answer-space").length, 100);
  assert.equal($("input").length, 0);
  assert.equal($(".length-key p").length, 100);
  assert.equal($(".length-identity").length, 1);
});
test("API validates requests and returns a serializable exact worksheet", async () => {
  const request = (body: unknown) => new Request("http://localhost/api/generate-length-worksheet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const valid = await POST(request({ settings: DEFAULT_LENGTH_SETTINGS, language: "nb" }));
  assert.equal(valid.status, 200);
  assert.ok(sanitizeLengthWorksheet((await valid.json()).worksheet));
  for (const body of [null, [], {}, { settings: { ...DEFAULT_LENGTH_SETTINGS, units: ["m"] } }]) assert.equal((await POST(request(body))).status, 400);
});
