import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { POST } from "@/app/api/generate-coordinates-worksheet/route";
import { DEFAULT_COORDINATES_SETTINGS, COORDINATES_EXTENTS, COORDINATES_MODES, coordinatesExpected, coordinatesSteps, generateCoordinatesWorksheet, gradeCoordinatesWorksheet, sanitizeCoordinatesWorksheet } from "./worksheet";
import { coordinatesFullPageCounts, coordinatesPrintPages } from "./printLayout";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/coordinates/CoordinatesWorksheetView").default as typeof import("../../../components/generators/math/coordinates/CoordinatesWorksheetView").default;

test("full sheets keep four coordinate grids per page and every task exactly once", () => {
  assert.equal(DEFAULT_COORDINATES_SETTINGS.taskCount, 4);
  assert.deepEqual(coordinatesFullPageCounts(), Array.from({ length: 15 }, (_, page) => (page + 1) * 4));
  assert.deepEqual(coordinatesPrintPages([]), []);
  for (let count = 1; count <= 60; count++) {
    const tasks = Array.from({ length: count }, (_, i) => i), pages = coordinatesPrintPages(tasks);
    assert.deepEqual(pages.flatMap(page => page.tasks), tasks);
    assert.ok(pages.every(page => page.tasks[0] === page.startIndex));
    assert.equal(pages[0].tasks.length, Math.min(count, 4));
    assert.ok(pages.slice(0, -1).every(page => page.tasks.length === 4));
  }
});

test("paper retains axis scale, source figures, five-point answer fields and a separate key", () => {
  for (const taskType of COORDINATES_MODES) {
    const worksheet = generateCoordinatesWorksheet({ ...DEFAULT_COORDINATES_SETTINGS, taskType, extent: 20, step: 2, pointCount: 5, showSupport: true, taskCount: 8 }, "pt", true);
    const answers = Object.fromEntries(worksheet.tasks.map(task => [task.id, { points: coordinatesExpected(task).map(p => ({ x: String(p.x), y: String(p.y) })) }]));
    const $ = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} printMode />));
    assert.deepEqual($(".length-page").toArray().map(page => $(page).find(".coordinates-task").length), [4, 4]);
    assert.deepEqual($(".length-number").toArray().map(el => Number($(el).text())), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal($(".length-brand, .length-identity").length, 2);
    assert.equal($(".coordinates-task .coordinates-graphic").length, 8);
    assert.equal($(".coordinates-task .coordinates-source-point").length, worksheet.tasks.filter(task => task.type === "read_points" || task.type === "reflect").length * 5);
    assert.equal($(".coordinates-task .coordinates-answer-point").length, 0);
    assert.equal($(".coordinates-blank").length, worksheet.tasks.filter(task => task.type === "read_points").length * 10);
    assert.equal($(".coordinates-sheet").attr("data-point-count"), "5");
    assert.equal($(".length-page .coordinates-key").length, 0);
    assert.equal($(".coordinates-key-item").length, 8);
    assert.equal($("input, button, .length-result").length, 0);
  }
});

test("saved custom counts retain settings, digital plotting, coordinate fields and partial credit", () => {
  for (const taskType of COORDINATES_MODES) for (const taskCount of [2, 4, 13, 60]) {
    const original = generateCoordinatesWorksheet({ ...DEFAULT_COORDINATES_SETTINGS, taskType, taskCount, extent: 20, step: 5, pointCount: 5, reflectionAxis: "y", showSupport: true }, "en", true);
    const worksheet = sanitizeCoordinatesWorksheet(JSON.parse(JSON.stringify(original)))!;
    assert.deepEqual(worksheet, original);
    const answers = Object.fromEntries(worksheet.tasks.map(task => [task.id, { points: coordinatesExpected(task).map(p => ({ x: String(p.x), y: String(p.y) })) }]));
    const partial = Object.fromEntries(worksheet.tasks.map(task => [task.id, { points: coordinatesExpected(task).map(p => ({ x: String(p.x), y: "" })) }]));
    assert.equal(gradeCoordinatesWorksheet(worksheet, answers).percentAuto, 100);
    assert.equal(gradeCoordinatesWorksheet(worksheet, partial).percentAuto, 50);
    const student = load(renderToStaticMarkup(<View worksheet={worksheet} onAnswerChange={() => {}} />));
    const plotTasks = worksheet.tasks.filter(task => task.type !== "read_points");
    assert.equal(student(".length-page").length, 1);
    assert.equal(student("input").length, taskCount * 10);
    assert.equal(student(".coordinates-plot-area").length, plotTasks.length);
    assert.equal(student(".coordinates-point-picker button").length, plotTasks.length * 5);
    assert.equal(student(".length-key, .length-result").length, 0);
    const teacher = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} readOnly showAutoCheck />));
    assert.equal(teacher("input[readonly]").length, taskCount * 10);
    assert.equal(teacher("button").length, 0);
    assert.equal(teacher(".length-summary").length, 1);
    assert.equal(teacher(".length-correct").length, taskCount);
  }
});

test("generation API accepts full sheets in every language, mode, valid grid scale and support setting", async () => {
  for (const language of ["nb", "en", "pt"]) for (const taskType of COORDINATES_MODES) for (const quadrants of ["positive", "all"] as const) for (const extent of COORDINATES_EXTENTS) for (const step of coordinatesSteps(extent, quadrants)) for (const showSupport of [false, true]) {
    if (taskType === "reflect" && quadrants === "positive") continue;
    const settings = { ...DEFAULT_COORDINATES_SETTINGS, taskType, quadrants, extent, step, showSupport, pointCount: 5, taskCount: 8 };
    const response = await POST(new Request("http://localhost/api/generate-coordinates-worksheet", { method: "POST", body: JSON.stringify({ settings, language, showAnswerKey: true }) }));
    assert.equal(response.status, 200);
    const { worksheet } = await response.json();
    assert.deepEqual(worksheet.settings, settings);
    assert.equal(worksheet.language, language);
    assert.equal(worksheet.showAnswerKey, true);
    assert.deepEqual(sanitizeCoordinatesWorksheet(worksheet), worksheet);
    assert.equal(new Set(worksheet.tasks.map((task: { id: string }) => task.id)).size, 8);
  }
});
