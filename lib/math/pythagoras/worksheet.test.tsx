import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { DEFAULT_PYTHAGORAS_SETTINGS, PYTHAGORAS_LEVELS, PYTHAGORAS_MODES, generatePythagorasWorksheet, gradePythagorasTask, gradePythagorasWorksheet, normalizePythagorasSettings, pythagorasExpected, pythagorasIsRight, pythagorasSolution, pythagorasTaskPrompt, sanitizePythagorasWorksheet, type PythagorasTask } from "./worksheet";
import { pythagorasFullPageCounts, pythagorasPageCapacity, pythagorasPrintPages } from "./printLayout";
import { mathEditorHref } from "../editor";
import { getAssignmentDerivedState } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/assignmentDerivedState";
const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/pythagoras/PythagorasWorksheetView").default as typeof import("@/components/generators/math/pythagoras/PythagorasWorksheetView").default;
const Figure = require("../../../components/generators/math/pythagoras/PythagorasFigure").default as typeof import("@/components/generators/math/pythagoras/PythagorasFigure").default;
const triangle: PythagorasTask = { id: "known", type: "hypotenuse", a: 3, b: 4, c: 5, missing: "c", unit: "cm", orientation: 0, mirrored: false };
function seeded(seed: number) { return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; }; }

test("known lengths, subtraction for either leg, decimal rounding and right-angle checks", () => {
  assert.equal(pythagorasExpected(triangle), 5);
  assert.equal(pythagorasExpected({ ...triangle, type: "leg", missing: "a" }), 3);
  assert.equal(pythagorasExpected({ ...triangle, type: "leg", missing: "b" }), 4);
  assert.equal(pythagorasExpected({ ...triangle, a: 2, b: 3, c: Math.sqrt(13) }), 3.61);
  assert.equal(pythagorasExpected({ ...triangle, a: 1.5, b: 2, c: 2.5 }), 2.5);
  assert.equal(pythagorasExpected({ ...triangle, type: "check_triangle", missing: null }), "yes");
  assert.equal(pythagorasExpected({ ...triangle, type: "check_triangle", missing: null, c: 6 }), "no");
  assert.match(pythagorasSolution({ ...triangle, type: "leg", missing: "b" }, "nb"), /5² − 3²/);
});

test("partial marks require the right length; yes/no and working are treated independently", () => {
  assert.equal(gradePythagorasTask(triangle, { value: "5", unit: "cm" }).points, 1);
  assert.equal(gradePythagorasTask(triangle, { value: "5,00", unit: "m" }).points, .8);
  assert.equal(gradePythagorasTask(triangle, { value: "4", unit: "cm" }).points, 0);
  assert.equal(gradePythagorasTask(triangle, { working: "3² + 4² = 25" }).points, 0);
  assert.equal(gradePythagorasTask(triangle, { working: "3² + 4² = 25" }).isAnswered, true);
  assert.equal(gradePythagorasTask(triangle, undefined).isAnswered, false);
  for (const value of ["sqrt(25)", "5 cm", "5/1", "1e2", "NaN", "-5", "<script>"]) assert.equal(gradePythagorasTask(triangle, { value, unit: "cm" }).points, 0);
  const check = { ...triangle, type: "check_triangle" as const, missing: null };
  assert.equal(gradePythagorasTask(check, { value: "yes" }).points, 1);
  assert.equal(gradePythagorasTask(check, { value: "no", unit: "cm" }).points, 0);
  const root = { ...triangle, a: 2, b: 3, c: Math.sqrt(13) };
  assert.equal(gradePythagorasTask(root, { value: String(Math.sqrt(13)), unit: "cm" }).points, 1);
  assert.equal(gradePythagorasTask(root, { value: "3.60", unit: "cm" }).points, 0);
});

test("all modes, levels, units and ranges preserve exact givens and survive save/reopen", () => {
  for (const taskType of PYTHAGORAS_MODES) for (const level of PYTHAGORAS_LEVELS) for (const maximum of [10, 20, 50]) for (const language of ["nb", "en", "pt"]) {
    const sheet = generatePythagorasWorksheet({ ...DEFAULT_PYTHAGORAS_SETTINGS, taskType, level, maximum, taskCount: 32, lengthUnit: maximum === 10 ? "m" : "cm" }, language, true, seeded(1337));
    assert.deepEqual(sanitizePythagorasWorksheet(JSON.parse(JSON.stringify(sheet))), sheet, `${taskType}/${level}/${maximum}/${language}`);
    const answers = Object.fromEntries(sheet.tasks.map(task => [task.id, { value: String(pythagorasExpected(task)), unit: task.type === "check_triangle" ? "" : task.unit, working: "test" }]));
    assert.equal(gradePythagorasWorksheet(sheet, answers).percentAuto, 100);
    for (const task of sheet.tasks) {
      assert.ok(!pythagorasTaskPrompt(task, language).includes("undefined"));
      if (task.type !== "check_triangle") assert.ok(pythagorasIsRight(task));
      for (const side of ["a", "b", "c"] as const) {
        assert.ok(task[side] <= maximum && task[side] > 0);
        if (side !== task.missing) assert.ok(Number.isInteger(task[side] * (level === "decimals" ? 2 : 1)), "shown measurements must never be rounded irrational givens");
      }
      if (task.type === "word_problems") assert.equal(task.unit, "m");
    }
    const checks = sheet.tasks.filter(task => task.type === "check_triangle");
    if (checks.length) assert.equal(new Set(checks.map(pythagorasIsRight)).size, 2, "include both right and non-right triangles");
    const legs = sheet.tasks.filter(task => task.type === "leg");
    if (legs.length) assert.equal(new Set(legs.map(task => task.missing)).size, 2, "practise finding either leg");
    if (taskType === "word_problems" || taskType === "mixed") assert.equal(new Set(sheet.tasks.filter(t => t.type === "word_problems").map(t => t.context)).size, 4);
  }
});

test("invalid settings and forged dimensions cannot override computed answers", () => {
  for (const patch of [{ taskType: "bad" }, { level: "bad" }, { maximum: "20" }, { maximum: 100 }, { taskCount: 0 }, { taskCount: 61 }, { taskCount: 1.5 }, { showSupport: "true" }, { rotateFigures: 1 }, { lengthUnit: "km" }]) assert.throws(() => normalizePythagorasSettings({ ...DEFAULT_PYTHAGORAS_SETTINGS, ...patch }));
  const sheet = generatePythagorasWorksheet({ ...DEFAULT_PYTHAGORAS_SETTINGS, taskType: "hypotenuse", rotateFigures: false }, "nb", false, seeded(7));
  for (const patch of [{ a: 0 }, { b: Infinity }, { c: 99 }, { c: 1 }, { a: 2.1 }, { unit: "m" }, { missing: "a" }, { orientation: 5 }, { mirrored: true }, { id: "bad/id" }]) {
    const edited = structuredClone(sheet); Object.assign(edited.tasks[0], patch); assert.equal(sanitizePythagorasWorksheet(edited), null);
  }
  const duplicate = structuredClone(sheet); duplicate.tasks[1].id = duplicate.tasks[0].id; assert.equal(sanitizePythagorasWorksheet(duplicate), null);
  const clean = sanitizePythagorasWorksheet({ ...sheet, tasks: sheet.tasks.map(task => ({ ...task, answer: 99999 })) })!;
  assert.ok(clean); assert.equal("answer" in clean.tasks[0], false);
});

test("full-page counts preserve every task exactly once with consecutive numbering", () => {
  assert.deepEqual(pythagorasFullPageCounts(false).slice(0, 3), [6, 14, 22]);
  assert.deepEqual(pythagorasFullPageCounts(true).slice(0, 3), [6, 12, 18]);
  for (const support of [false, true]) for (let count = 1; count <= 60; count++) {
    const tasks = Array.from({ length: count }, (_, i) => i), pages = pythagorasPrintPages(tasks, support), capacity = pythagorasPageCapacity(support);
    assert.deepEqual(pages.flatMap(page => page.tasks), tasks);
    assert.ok(pages.every((page, i) => page.tasks.length <= (i === 0 ? capacity.first : capacity.following)));
  }
});

for (const language of ["nb", "en", "pt"] as const) test(`print, digital answers, hidden lengths and check-triangle diagrams (${language})`, () => {
  const sheet = generatePythagorasWorksheet({ ...DEFAULT_PYTHAGORAS_SETTINGS, taskCount: 14, level: "roots" }, language, true, seeded(9));
  const printed = load(renderToStaticMarkup(<View worksheet={sheet} printMode />));
  assert.equal(printed(".length-page").length, 2);
  assert.equal(printed(".length-page").first().find(".length-task").length, 6);
  assert.equal(printed(".length-page").last().find(".length-task").length, 8);
  assert.equal(printed(".length-key").length, 1);
  assert.equal(printed("input,textarea,select").length, 0);
  assert.deepEqual(printed(".length-number").map((_, e) => Number(printed(e).text())).get(), Array.from({ length: 14 }, (_, i) => i + 1));
  const pupil = load(renderToStaticMarkup(<View worksheet={sheet} readOnly showAutoCheck />));
  assert.equal(pupil(".length-key").length, 0);
  assert.equal(pupil("textarea[readonly]").length, 14);
  assert.ok(pupil("input,textarea,select").toArray().every(e => pupil(e).attr("aria-label")));
  const checks = sheet.tasks.filter(t => t.type === "check_triangle").length;
  assert.equal(pupil("select").length, 14);
  assert.equal(pupil("input[readonly]").length, 14 - checks);
  for (const orientation of [0, 1, 2, 3] as const) for (const mirrored of [false, true]) {
    const figure = load(renderToStaticMarkup(<Figure task={{ ...triangle, c: 19.357, orientation, mirrored }} language={language} />));
    assert.equal(figure("[data-right-angle]").length, 1);
    assert.ok(figure("svg").text().includes("c = ?"));
    assert.ok(!figure("svg").attr("aria-label")?.includes("19"));
    assert.ok(!figure("svg").text().includes("19"));
    assert.ok(!figure("svg").html()?.includes("NaN"));
  }
  const check = load(renderToStaticMarkup(<Figure task={{ ...triangle, type: "check_triangle", missing: null }} language={language} />));
  assert.equal(check("[data-right-angle]").length, 0);
  assert.equal(mathEditorHref(language, "saved/id?", "pythagoras"), `/${language}/producer/math/pythagoras?edit=saved%2Fid%3F`);
  const derived = getAssignmentDerivedState({ mathWorksheet: sheet, mathType: "pythagoras" } as Parameters<typeof getAssignmentDerivedState>[0], null);
  assert.equal(derived.isPythagorasAssignment, true);
  assert.equal(derived.isGeometryAssignment, false);
});
