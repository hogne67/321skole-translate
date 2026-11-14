import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { COORDINATES_AXES, COORDINATES_EXTENTS, COORDINATES_MODES, COORDINATES_TASKS_PER_PAGE, DEFAULT_COORDINATES_SETTINGS as defaults, coordinatesExpected, coordinatesLabel, coordinatesSteps, coordinatesTaskAnswer, coordinatesTaskTypes, generateCoordinatesWorksheet, getCoordinatesCopy, gradeCoordinatesTask, gradeCoordinatesWorksheet, normalizeCoordinatesSettings, parseCoordinatesValue, reflectCoordinates, sanitizeCoordinatesWorksheet, type CoordinatesAnswer, type CoordinatesTask } from "./worksheet";
import { COORDINATES_GRID, coordinatesFromGridPosition, coordinatesFromKey, coordinatesInGrid, coordinatesToSvg } from "./grid";
import { POST } from "@/app/api/generate-coordinates-worksheet/route";
import { getAssignmentDerivedState } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/assignmentDerivedState";
import { assignmentToLesson, hasSnapshotContent } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/helpers";
import { assignmentSnapshotToLesson, hasAssignmentSnapshotContent, isFractionWorksheet, isMathWorksheet, readAutoGrade } from "@/lib/submissions/readers";
import { isFractionWorksheet as studentFractionGuard } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/worksheetTypeGuards";
import { mathEditorHref } from "../editor";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/coordinates/CoordinatesWorksheetView").default as typeof import("@/components/generators/math/coordinates/CoordinatesWorksheetView").default;
const Grid = require("../../../components/generators/math/coordinates/CoordinatesGrid").default as typeof import("@/components/generators/math/coordinates/CoordinatesGrid").default;
const answerFor = (task: CoordinatesTask): CoordinatesAnswer => ({ points: coordinatesExpected(task).map(p => ({ x: String(p.x), y: String(p.y) })) });

for (const quadrants of ["positive", "all"] as const) test(`${quadrants}: all valid scales, task modes, point counts and axes generate bounded, restorable and correctly graded tasks`, () => {
  for (const extent of COORDINATES_EXTENTS) for (const step of coordinatesSteps(extent, quadrants)) for (const taskType of COORDINATES_MODES) {
    if (taskType === "reflect" && quadrants === "positive") continue;
    for (const pointCount of [1, 2, 3, 4, 5]) {
      if (pointCount < 3 && (taskType === "draw_figure" || taskType === "mixed")) continue;
      for (const reflectionAxis of COORDINATES_AXES) {
        const sheet = generateCoordinatesWorksheet({ ...defaults, taskType, quadrants, extent, step, pointCount, reflectionAxis, taskCount: 17, showSupport: true }, "pt", true);
        assert.deepEqual(sanitizeCoordinatesWorksheet(JSON.parse(JSON.stringify(sheet))), sheet);
        assert.equal(new Set(sheet.tasks.map(t => t.id)).size, 17);
        for (const task of sheet.tasks) {
          assert.equal(new Set(task.points.map(p => `${p.x}:${p.y}`)).size, pointCount);
          assert.ok([...task.points, ...coordinatesExpected(task)].every(p => coordinatesInGrid(p, sheet.settings)));
          if (task.type === "reflect" && reflectionAxis !== "mixed") assert.equal(task.axis, reflectionAxis);
        }
        assert.equal(gradeCoordinatesWorksheet(sheet, Object.fromEntries(sheet.tasks.map(t => [t.id, answerFor(t)]))).percentAuto, 100);
        if (taskType === "mixed") {
          const counts = coordinatesTaskTypes(sheet.settings).map(type => sheet.tasks.filter(t => t.type === type).length);
          assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
          if (quadrants === "positive") assert.ok(sheet.tasks.every(t => t.type !== "reflect"));
        } else assert.ok(sheet.tasks.every(t => t.type === taskType));
      }
    }
  }
});

test("invalid settings fail early, including impossible figure sizes, overly dense grids and positive-only reflection", () => {
  for (const patch of [{ taskType: "rotation" }, { quadrants: "none" }, { extent: 6 }, { extent: 20, step: 1 }, { step: "1" }, { step: 0 }, { step: 2 }, { pointCount: 2 }, { pointCount: 6 }, { pointCount: 3.5 }, { reflectionAxis: "z" }, { taskType: "reflect", quadrants: "positive" }, { taskCount: 0 }, { taskCount: 61 }, { taskCount: 1.5 }, { showSupport: "yes" }]) assert.throws(() => normalizeCoordinatesSettings({ ...defaults, ...patch }), /INVALID_/);
  assert.deepEqual(coordinatesSteps(20, "all"), [2, 5]);
  assert.deepEqual(coordinatesSteps(10, "positive"), [1, 2]);
});

test("deterministic random sources have bounded retries and valid polygons, and mixed reflection alternates axes", () => {
  for (const random of [() => 0, () => .4, () => .9999]) for (const taskType of COORDINATES_MODES) {
    const sheet = generateCoordinatesWorksheet({ ...defaults, taskType, taskCount: 60 }, "en", false, random);
    assert.equal(sheet.tasks.length, 60); assert.ok(sanitizeCoordinatesWorksheet(sheet));
  }
  const sheet = generateCoordinatesWorksheet({ ...defaults, taskType: "reflect", taskCount: 17 });
  assert.deepEqual(new Set(sheet.tasks.map(t => t.type === "reflect" ? t.axis : null)), new Set(["x", "y"]));
});

test("reflections change only the correct sign in every quadrant and leave mirror-axis points fixed", () => {
  for (const point of [{ x: 2, y: 3 }, { x: -2, y: 3 }, { x: -2, y: -3 }, { x: 2, y: -3 }, { x: 0, y: 3 }, { x: 2, y: 0 }, { x: 0, y: 0 }]) {
    for (const axis of ["x", "y"] as const) {
      const expected = { x: axis === "y" && point.x !== 0 ? -point.x : point.x, y: axis === "x" && point.y !== 0 ? -point.y : point.y };
      assert.deepEqual(reflectCoordinates(point, axis), expected);
      assert.deepEqual(reflectCoordinates(expected, axis), point);
      assert.equal(Object.is(expected.x, -0), false); assert.equal(Object.is(expected.y, -0), false);
    }
  }
});

test("SVG mapping and click snapping agree on every intersection, with y increasing upwards", () => {
  for (const quadrants of ["positive", "all"] as const) for (const extent of COORDINATES_EXTENTS) for (const step of coordinatesSteps(extent, quadrants)) {
    const settings = { ...defaults, quadrants, extent, step }, min = quadrants === "all" ? -extent : 0;
    for (let x = min; x <= extent; x += step) for (let y = min; y <= extent; y += step) {
      const svg = coordinatesToSvg({ x, y }, settings);
      assert.deepEqual(coordinatesFromGridPosition((svg.x - COORDINATES_GRID.left) / COORDINATES_GRID.size, (svg.y - COORDINATES_GRID.top) / COORDINATES_GRID.size, settings), { x, y });
    }
    assert.deepEqual(coordinatesFromGridPosition(-1, 2, settings), { x: min, y: min });
    assert.deepEqual(coordinatesFromGridPosition(2, -1, settings), { x: extent, y: extent });
  }
  assert.deepEqual(coordinatesFromGridPosition(.5, .5, defaults), { x: 0, y: 0 });
  assert.ok(coordinatesToSvg({ x: 0, y: 1 }, defaults).y < coordinatesToSvg({ x: 0, y: 0 }, defaults).y);
});

test("keyboard plotting follows the chosen scale and clamps at the bounds", () => {
  const settings = { ...defaults, extent: 20 as const, step: 5 };
  assert.deepEqual(coordinatesFromKey({ x: -5, y: 0 }, "ArrowRight", settings), { x: 0, y: 0 });
  assert.deepEqual(coordinatesFromKey({ x: 0, y: 0 }, "ArrowUp", settings), { x: 0, y: 5 });
  assert.deepEqual(coordinatesFromKey({ x: -20, y: 20 }, "ArrowLeft", settings), { x: -20, y: 20 });
  assert.deepEqual(coordinatesFromKey({ x: -20, y: 20 }, "ArrowUp", settings), { x: -20, y: 20 });
  assert.deepEqual(coordinatesFromKey({ x: 15, y: -15 }, "Home", settings), { x: 0, y: 0 });
  assert.equal(coordinatesFromKey({ x: 0, y: 0 }, "a", settings), null);
});

const readTask: CoordinatesTask = { id: "read", type: "read_points", points: [{ x: -2, y: 3 }, { x: 0, y: 0 }] };
test("grading keeps point order, distinguishes x and y, accepts zero and minus signs, and awards each coordinate equally", () => {
  assert.equal(gradeCoordinatesTask(readTask, { points: [{ x: "−2", y: "+3.0" }, { x: "-0", y: "0,00" }] }).points, 1);
  const partial = gradeCoordinatesTask(readTask, { points: [{ x: "-2", y: "-3" }, { x: "", y: "0" }] });
  assert.equal(partial.points, .5); assert.equal(partial.isPartial, true);
  assert.deepEqual(partial.byPoint.map(p => p.isCorrect), [false, false]);
  assert.equal(gradeCoordinatesTask(readTask, { points: [{ x: "3", y: "-2" }, { x: "0", y: "0" }] }).points, .5);
  assert.equal(gradeCoordinatesTask(readTask, { points: [{ x: "0", y: "0" }, { x: "-2", y: "3" }] }).points, 0);
  for (const value of [undefined, null, "", {}, { points: [{ x: "", y: " " }] }]) assert.equal(gradeCoordinatesTask(readTask, value).isAnswered, false);
  for (const value of ["2abc", "2+0", "2/1", "2e0", "2.5", "Infinity", {}, [], 2]) assert.equal(parseCoordinatesValue(value), null);
  const worksheet = { ...generateCoordinatesWorksheet({ ...defaults, taskCount: 3 }), tasks: [readTask, { ...readTask, id: "wrong" }, { ...readTask, id: "blank" }] };
  const grade = gradeCoordinatesWorksheet(worksheet, { read: { points: [{ x: "-2", y: "-3" }, { x: "", y: "0" }] }, wrong: "bad" });
  assert.deepEqual([grade.partialAuto, grade.wrongAuto, grade.unansweredAuto, grade.percentAuto], [1, 1, 1, 17]);
});

test("sanitization strips forged keys and rejects invalid positions, repeated IDs, duplicate points and damaged polygons", () => {
  const sheet = generateCoordinatesWorksheet({ ...defaults, taskType: "read_points" });
  assert.deepEqual(sanitizeCoordinatesWorksheet({ ...sheet, title: "forged", tasks: sheet.tasks.map(t => ({ ...t, answer: "forged" })) }), sheet);
  for (const patch of [{ id: "bad/id" }, { id: sheet.tasks[1].id }, { type: "reflect" }, { points: [] }, { points: [{ x: 99, y: 0 }, ...sheet.tasks[0].points.slice(1)] }, { points: [sheet.tasks[0].points[1], ...sheet.tasks[0].points.slice(1)] }]) assert.equal(sanitizeCoordinatesWorksheet({ ...sheet, tasks: [{ ...sheet.tasks[0], ...patch }, ...sheet.tasks.slice(1)] }), null);
  const draw = generateCoordinatesWorksheet({ ...defaults, taskType: "draw_figure", pointCount: 4, taskCount: 1 });
  for (const points of [[{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }], [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 }]]) assert.equal(sanitizeCoordinatesWorksheet({ ...draw, tasks: [{ ...draw.tasks[0], points }] }), null);
  const scaled = generateCoordinatesWorksheet({ ...defaults, extent: 10, step: 2, taskType: "read_points" });
  assert.equal(sanitizeCoordinatesWorksheet({ ...scaled, tasks: [{ ...scaled.tasks[0], points: [{ x: 1, y: 0 }, ...scaled.tasks[0].points.slice(1)] }, ...scaled.tasks.slice(1)] }), null);
  const reflection = generateCoordinatesWorksheet({ ...defaults, taskType: "reflect", reflectionAxis: "x" });
  assert.equal(sanitizeCoordinatesWorksheet({ ...reflection, tasks: [{ ...reflection.tasks[0], axis: "y" }, ...reflection.tasks.slice(1)] }), null);
  assert.equal(sanitizeCoordinatesWorksheet({ ...sheet, tasks: [] }), null); assert.equal(sanitizeCoordinatesWorksheet({ ...sheet, version: 2 }), null);
});

test("Space snapshots and editors preserve the grid scale, reflection settings, point labels and grading", () => {
  const worksheet = generateCoordinatesWorksheet({ ...defaults, extent: 20, step: 5, reflectionAxis: "y", showSupport: true }, "pt", true);
  const assignment = { mathWorksheet: worksheet, mathType: "coordinates", contentType: "coordinates_worksheet" };
  assert.ok(hasSnapshotContent(assignment)); assert.ok(hasAssignmentSnapshotContent(assignment));
  const derived = getAssignmentDerivedState(assignmentToLesson(assignment), assignment);
  assert.deepEqual(derived.coordinatesWorksheet, worksheet); assert.equal(derived.isCoordinatesAssignment, true);
  assert.equal(derived.isGeometryAssignment, false); assert.equal(derived.isFractionAssignment, false); assert.equal(derived.isArithmeticAssignment, false);
  assert.equal(isFractionWorksheet(worksheet), false); assert.equal(studentFractionGuard(worksheet), false); assert.equal(isMathWorksheet(worksheet), false);
  assert.deepEqual(assignmentSnapshotToLesson(assignment).mathWorksheet, worksheet);
  const auto = gradeCoordinatesWorksheet(worksheet, Object.fromEntries(worksheet.tasks.map(t => [t.id, answerFor(t)])));
  assert.equal(auto.percentAuto, 100); assert.deepEqual(readAutoGrade({ auto }), auto);
  assert.equal(mathEditorHref("pt", "saved", "coordinates"), "/pt/producer/math/coordinates?edit=saved");
});

test("plotting and drawing start with empty grids and labeled coordinate controls; keys and feedback stay hidden", () => {
  for (const taskType of ["place_points", "draw_figure"] as const) {
    const sheet = generateCoordinatesWorksheet({ ...defaults, taskType, taskCount: 1 }, "nb", true);
    const $ = load(renderToStaticMarkup(<View worksheet={sheet} />));
    assert.equal($(".coordinates-source-point, .coordinates-answer-point, .coordinates-answer-edge").length, 0);
    assert.equal($(".coordinates-grid desc").text(), "");
    assert.equal($("input").length, 6); assert.ok($("input").toArray().every(el => $(el).attr("aria-label") && $(el).attr("value") === ""));
    assert.equal($("button.coordinates-plot-area").length, 1); assert.equal($(".coordinates-point-picker button").length, 3);
    assert.equal($(".length-key, .length-result").length, 0);
    const teacher = load(renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={{ [sheet.tasks[0].id]: answerFor(sheet.tasks[0]) }} readOnly showAutoCheck />));
    assert.equal(teacher("input[readonly]").length, 6); assert.equal(teacher(".length-correct").length, 1);
    assert.equal(teacher(".coordinates-answer-point").length, 3); assert.equal(teacher("button").length, 0);
    assert.equal(teacher(".coordinates-answer-edge").length, taskType === "draw_figure" ? 3 : 0);
  }
});

test("reflection shows only original points before answering; fixed-point labels remain distinct in the key", () => {
  const task: CoordinatesTask = { id: "axis", type: "reflect", axis: "x", points: [{ x: 2, y: 0 }] };
  const sheet = { ...generateCoordinatesWorksheet({ ...defaults, taskType: "reflect", pointCount: 1, taskCount: 1 }, "nb", true), tasks: [task] };
  const $ = load(renderToStaticMarkup(<View worksheet={sheet} />));
  assert.equal($(".coordinates-source-point").length, 1); assert.equal($(".coordinates-answer-point").length, 0);
  assert.equal($(".coordinates-reflection-axis").length, 1);
  const key = load(renderToStaticMarkup(<Grid settings={sheet.settings} language="nb" sourcePoints={task.points} answerPoints={coordinatesExpected(task)} reflected />));
  assert.equal(key(".coordinates-source-point text").text(), "A"); assert.equal(key(".coordinates-answer-point text").text(), "A′");
  assert.notEqual(key(".coordinates-source-point text").attr("y"), key(".coordinates-answer-point text").attr("y"));
  assert.equal(coordinatesTaskAnswer(task), "A′ = (2, 0)");
});

test("paper uses two grids per page, blank plotting spaces and a separate optional visual key", () => {
  for (const taskType of COORDINATES_MODES) {
    const sheet = generateCoordinatesWorksheet({ ...defaults, taskType, taskCount: 5 }, "en", true);
    const answers = Object.fromEntries(sheet.tasks.map(t => [t.id, answerFor(t)]));
    const $ = load(renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={answers} printMode />));
    assert.equal($(".length-page").length, Math.ceil(5 / COORDINATES_TASKS_PER_PAGE));
    assert.equal($(".coordinates-task").length, 5); assert.equal($("input, button, .length-result").length, 0);
    assert.equal($(".coordinates-task .coordinates-answer-point").length, 0);
    assert.equal($(".length-key").length, 1); assert.equal($(".coordinates-key-item").length, 5);
    assert.equal(load(renderToStaticMarkup(<View worksheet={{ ...sheet, showAnswerKey: false }} printMode />))(".length-key").length, 0);
  }
});

test("generation API accepts every mode in all worksheet languages and rejects malformed requests", async () => {
  for (const language of ["nb", "en", "pt"]) for (const taskType of COORDINATES_MODES) {
    const response = await POST(new Request("http://localhost/api/generate-coordinates-worksheet", { method: "POST", body: JSON.stringify({ settings: { ...defaults, taskType }, language, showAnswerKey: true }) }));
    assert.equal(response.status, 200); const { worksheet } = await response.json();
    assert.ok(sanitizeCoordinatesWorksheet(worksheet)); assert.equal(worksheet.title, getCoordinatesCopy(language).title); assert.equal(worksheet.showAnswerKey, true);
  }
  assert.equal(coordinatesLabel(4, true), "E′");
  for (const body of [null, [], {}, { settings: { ...defaults, extent: 20, step: 1 } }]) assert.equal((await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }))).status, 400);
  assert.equal((await POST(new Request("http://localhost", { method: "POST", body: "{" }))).status, 400);
});
