import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { DEFAULT_STATISTICS_SETTINGS as defaults, STATISTICS_CHARTS, STATISTICS_DIFFICULTIES, STATISTICS_MODES, STATISTICS_TASKS_PER_PAGE, generateStatisticsWorksheet, getStatisticsCopy, gradeStatisticsTask, gradeStatisticsWorksheet, normalizeStatisticsSettings, parseStatisticsNumber, sanitizeStatisticsWorksheet, statisticsAxis, statisticsMetricValue, statisticsModes, statisticsObservations, statisticsTaskAnswer, type StatisticsTask } from "./worksheet";
import { POST } from "@/app/api/generate-statistics-worksheet/route";
import { getAssignmentDerivedState } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/assignmentDerivedState";
import { assignmentToLesson, hasSnapshotContent } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/helpers";
import { assignmentSnapshotToLesson, hasAssignmentSnapshotContent, isFractionWorksheet, isMathWorksheet, readAutoGrade } from "@/lib/submissions/readers";
import { isFractionWorksheet as studentFractionGuard } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/worksheetTypeGuards";
import { mathEditorHref } from "../editor";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/statistics/StatisticsWorksheetView").default as typeof import("@/components/generators/math/statistics/StatisticsWorksheetView").default;
const Diagram = require("../../../components/generators/math/statistics/StatisticsDiagram").default as typeof import("@/components/generators/math/statistics/StatisticsDiagram").default;
const answerFor = (task: StatisticsTask) => task.type === "draw_chart" || task.type === "frequency_table" ? { frequencies: task.dataset.frequencies.map(String) } : statisticsMetricValue(task).toFraction();
const data = { theme: "books" as const, values: [0, 1, 2, 3], frequencies: [0, 2, 1, 0] };
const central = (metric: "mean" | "median" | "mode" | "range"): StatisticsTask => ({ id: metric, type: "central_tendency", dataset: data, metric });

for (const difficulty of STATISTICS_DIFFICULTIES) test(`${difficulty}: every task and chart option round-trips with correct answers and balanced task types`, () => {
  for (const chartType of STATISTICS_CHARTS) for (const taskType of STATISTICS_MODES) {
    const sheet = generateStatisticsWorksheet({ ...defaults, difficulty, chartType, taskType, taskCount: 25, showSupport: true }, "pt", true);
    assert.deepEqual(sanitizeStatisticsWorksheet(JSON.parse(JSON.stringify(sheet))), sheet);
    assert.equal(new Set(sheet.tasks.map(task => task.id)).size, 25);
    const answers = Object.fromEntries(sheet.tasks.map(task => [task.id, answerFor(task)]));
    assert.equal(gradeStatisticsWorksheet(sheet, answers).percentAuto, 100);
    if (taskType === "mixed") {
      const counts = ["read_chart", "draw_chart", "central_tendency", "frequency_table"].map(type => sheet.tasks.filter(task => task.type === type).length);
      assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
    } else assert.ok(sheet.tasks.every(task => task.type === taskType));
    if (chartType === "mixed" && (taskType === "mixed" || taskType === "draw_chart" || taskType === "read_chart")) for (const type of ["read_chart", "draw_chart"]) {
      const tasks = sheet.tasks.filter(t => t.type === type);
      if (tasks.length > 1) assert.deepEqual(new Set(tasks.map(t => "chart" in t ? t.chart : null)), new Set(["bar", "line"]));
    }
  }
});

test("settings reject unsupported and unbounded requests, including non-integer counts", () => {
  for (const patch of [{ taskType: "pie" }, { chartType: "pie" }, { difficulty: "expert" }, { taskCount: 0 }, { taskCount: 61 }, { taskCount: 1.5 }, { taskCount: NaN }, { showSupport: "yes" }]) assert.throws(() => normalizeStatisticsSettings({ ...defaults, ...patch }), /INVALID_/);
});

test("bounded generation handles deterministic random sources and tied frequencies without invalid modes", () => {
  for (const random of [() => 0, () => .2, () => .9999]) for (const taskType of STATISTICS_MODES) {
    const sheet = generateStatisticsWorksheet({ ...defaults, taskType, taskCount: 60 }, "en", false, random);
    assert.equal(sheet.tasks.length, 60); assert.ok(sanitizeStatisticsWorksheet(sheet));
    for (const task of sheet.tasks) if ("metric" in task && task.metric === "mode") assert.equal(statisticsModes(task.dataset).length, 1);
  }
});

test("central measures use weighted observations, ignore empty categories in the range, and handle even medians", () => {
  assert.deepEqual(statisticsObservations(data), [1, 1, 2]);
  for (const [metric, expected] of [["mean", "4/3"], ["median", "1"], ["mode", "1"], ["range", "1"]] as const) assert.equal(statisticsMetricValue(central(metric) as Extract<StatisticsTask, { type: "central_tendency" }>).toFraction(), expected);
  const even = { ...central("median"), dataset: { ...data, frequencies: [0, 2, 2, 0] } } as Extract<StatisticsTask, { type: "central_tendency" }>;
  assert.equal(statisticsMetricValue(even).toFraction(), "3/2");
  assert.equal(gradeStatisticsTask(central("mean"), "0.75").isCorrect, false);
  assert.equal(gradeStatisticsTask(central("range"), "3").isCorrect, false);
  const total: StatisticsTask = { id: "total", type: "read_chart", dataset: data, chart: "bar", metric: "total", targetValue: 0 };
  assert.equal(statisticsMetricValue(total).toFraction(), "3");
  assert.equal(gradeStatisticsTask({ ...total, metric: "frequency" }, "0").isCorrect, true);
});

test("means accept exact fractions or the specified one-decimal rounding, including halfway cases", () => {
  for (const answer of ["4/3", "8 / 6", "1.3", "1,3"]) assert.equal(gradeStatisticsTask(central("mean"), answer).isCorrect, true);
  for (const answer of ["1.33", "1.31", "1", "4/0", "1.3abc", "1e0", {}, [], 1.3]) assert.equal(gradeStatisticsTask(central("mean"), answer).isCorrect, false);
  assert.equal(parseStatisticsNumber("NaN"), null); assert.equal(parseStatisticsNumber("1,2,3"), null);
  const half = { ...central("mean"), dataset: { ...data, frequencies: [0, 3, 1, 0] } } as Extract<StatisticsTask, { type: "central_tendency" }>;
  assert.equal(statisticsTaskAnswer(half, "nb"), "1,3");
  assert.equal(gradeStatisticsTask(half, "1.3").isCorrect, true);
  assert.equal(gradeStatisticsTask(half, "1.2").isCorrect, false);
});

test("chart and table entries earn independent partial credit, including an explicit zero", () => {
  const task: StatisticsTask = { id: "draw", type: "draw_chart", dataset: data, chart: "bar" };
  const grade = gradeStatisticsTask(task, { frequencies: ["0", "2", "", "9"] });
  assert.equal(grade.points, .5); assert.equal(grade.isPartial, true); assert.deepEqual(grade.correctByEntry, [true, true, false, false]);
  for (const value of [undefined, null, "", {}, { frequencies: ["", " "] }]) assert.equal(gradeStatisticsTask(task, value).isAnswered, false);
  for (const value of ["bad", 0, []]) assert.equal(gradeStatisticsTask(task, value).isCorrect, false);
  const sheet = { ...generateStatisticsWorksheet({ ...defaults, taskCount: 3 }), tasks: [task, central("mean"), central("median")] };
  const auto = gradeStatisticsWorksheet(sheet, { draw: { frequencies: ["0", "2", "", "9"] }, mean: "wrong" });
  assert.deepEqual([auto.partialAuto, auto.wrongAuto, auto.unansweredAuto, auto.percentAuto], [1, 1, 1, 17]);
});

test("sanitization strips forged answer keys and rejects damaged data, IDs, charts and ambiguous modes", () => {
  const sheet = generateStatisticsWorksheet({ ...defaults, taskType: "read_chart" });
  assert.deepEqual(sanitizeStatisticsWorksheet({ ...sheet, title: "forged", tasks: sheet.tasks.map(task => ({ ...task, answer: "forged" })) }), sheet);
  for (const patch of [{ id: "bad/id" }, { id: sheet.tasks[1].id }, { chart: "pie" }, { chart: "line" }, { type: "draw_chart" }, { targetValue: -1 }, { metric: "mean" }]) assert.equal(sanitizeStatisticsWorksheet({ ...sheet, tasks: [{ ...sheet.tasks[0], ...patch }, ...sheet.tasks.slice(1)] }), null);
  for (const patch of [{ values: [0, 2, 1, 3] }, { values: [0, 1, 2] }, { frequencies: [0, 0, 0, 0] }, { frequencies: [0, 0, 0, 2] }, { frequencies: [1, 2, 3, 99] }, { frequencies: [1, 2, .5, 1] }, { theme: "injected" }]) assert.equal(sanitizeStatisticsWorksheet({ ...sheet, tasks: [{ ...sheet.tasks[0], dataset: { ...data, ...patch } }, ...sheet.tasks.slice(1)] }), null);
  const tied = { ...sheet, settings: { ...defaults, taskType: "central_tendency", taskCount: 1 }, tasks: [{ ...central("mode"), dataset: { ...data, frequencies: [1, 2, 2, 1] } }] };
  assert.equal(sanitizeStatisticsWorksheet(tied), null);
  assert.ok(sanitizeStatisticsWorksheet({ ...tied, tasks: [{ ...tied.tasks[0], metric: "median" }] }));
  assert.equal(sanitizeStatisticsWorksheet({ ...sheet, tasks: [] }), null);
  assert.equal(sanitizeStatisticsWorksheet({ ...sheet, version: 2 }), null);
});

test("frequency-table observations preserve their order and must match the saved frequencies exactly", () => {
  const sheet = generateStatisticsWorksheet({ ...defaults, taskType: "frequency_table" });
  assert.deepEqual(sanitizeStatisticsWorksheet(sheet), sheet);
  const task = sheet.tasks[0] as Extract<StatisticsTask, { type: "frequency_table" }>;
  for (const observations of [[], [...task.observations, 1000], task.observations.map(() => task.dataset.values[0]), ["0", ...task.observations.slice(1)]]) assert.equal(sanitizeStatisticsWorksheet({ ...sheet, tasks: [{ ...task, observations }, ...sheet.tasks.slice(1)] }), null);
});

test("student and teacher Space snapshot readers preserve settings, observations and partial grades", () => {
  const worksheet = generateStatisticsWorksheet({ ...defaults, difficulty: "hard", chartType: "mixed", showSupport: true }, "pt", true);
  const assignment = { mathWorksheet: worksheet, mathType: "statistics", contentType: "statistics_worksheet" };
  assert.ok(hasSnapshotContent(assignment)); assert.ok(hasAssignmentSnapshotContent(assignment));
  const derived = getAssignmentDerivedState(assignmentToLesson(assignment), assignment);
  assert.deepEqual(derived.statisticsWorksheet, worksheet); assert.equal(derived.isStatisticsAssignment, true);
  assert.equal(derived.isGeometryAssignment, false); assert.equal(derived.isFractionAssignment, false); assert.equal(derived.isArithmeticAssignment, false);
  assert.equal(isFractionWorksheet(worksheet), false); assert.equal(studentFractionGuard(worksheet), false); assert.equal(isMathWorksheet(worksheet), false);
  assert.deepEqual(assignmentSnapshotToLesson(assignment).mathWorksheet, worksheet);
  const auto = gradeStatisticsWorksheet(worksheet, Object.fromEntries(worksheet.tasks.map(task => [task.id, answerFor(task)])));
  assert.equal(auto.percentAuto, 100); assert.deepEqual(readAutoGrade({ auto }), auto);
  assert.equal(mathEditorHref("pt", "saved", "statistics"), "/pt/producer/math/statistics?edit=saved");
});

test("drawing starts with a blank graph and labeled empty fields; feedback and key remain hidden", () => {
  const sheet = generateStatisticsWorksheet({ ...defaults, taskType: "draw_chart", taskCount: 2 }, "nb", true);
  const $ = load(renderToStaticMarkup(<View worksheet={sheet} />));
  assert.equal($(".statistics-data-mark, .statistics-data-line").length, 0);
  assert.equal($(".statistics-diagram desc").text(), "");
  assert.equal($("input").length, 8); assert.ok($("input").toArray().every(el => $(el).attr("aria-label") && $(el).attr("value") === ""));
  assert.equal($("button.statistics-plot-button").length, 8);
  assert.equal($(".length-key, .length-result").length, 0);
  const answers = Object.fromEntries(sheet.tasks.map(task => [task.id, answerFor(task)]));
  const teacher = load(renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={answers} readOnly showAutoCheck />));
  assert.equal(teacher("input[readonly]").length, 8); assert.equal(teacher(".length-correct").length, 2);
  assert.equal(teacher("button.statistics-plot-button").length, 0);
  assert.equal(teacher(".statistics-data-mark").length, 8);
});

test("line charts plot zero, preserve missing entries, use the axis scale and expose an accessible data equivalent", () => {
  const dataset = { ...data, frequencies: [0, 8, 3, 6] };
  assert.deepEqual(statisticsAxis(dataset), { maximum: 8, step: 2 });
  const $ = load(renderToStaticMarkup(<Diagram dataset={dataset} chart="line" language="en" />));
  assert.equal($(".statistics-data-mark").length, 4); assert.equal($(".statistics-data-line").length, 3);
  assert.equal($("circle").first().attr("cy"), "187");
  assert.ok($("desc").text().includes("0: 0; 1: 8; 2: 3; 3: 6"));
  const partial = load(renderToStaticMarkup(<Diagram dataset={dataset} chart="line" language="en" frequencies={[0, null, 3, 6]} student />));
  assert.equal(partial(".statistics-data-mark").length, 3); assert.equal(partial(".statistics-data-line").length, 1);
});

test("paper has two groups per page with blank grids and tables, and a separate optional answer key", () => {
  for (const taskType of ["draw_chart", "frequency_table"] as const) {
    const sheet = generateStatisticsWorksheet({ ...defaults, taskType, taskCount: 5 }, "en", true);
    const answers = Object.fromEntries(sheet.tasks.map(task => [task.id, answerFor(task)]));
    const $ = load(renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={answers} printMode />));
    assert.equal($(".length-page").length, Math.ceil(5 / STATISTICS_TASKS_PER_PAGE));
    assert.equal($(".statistics-task").length, 5); assert.equal($("input, button, .length-result").length, 0);
    assert.equal($(".statistics-task .statistics-data-mark").length, 0);
    assert.equal($(".length-key").length, 1); assert.equal($(".statistics-key-item").length, 5);
    assert.equal($(".statistics-blank-cell").length, taskType === "frequency_table" ? 20 : 0);
    assert.equal(load(renderToStaticMarkup(<View worksheet={{ ...sheet, showAnswerKey: false }} printMode />))(".length-key").length, 0);
  }
});

test("generation API localizes every task type and rejects malformed or unsupported requests", async () => {
  for (const language of ["nb", "en", "pt"]) for (const taskType of STATISTICS_MODES) {
    const response = await POST(new Request("http://localhost/api/generate-statistics-worksheet", { method: "POST", body: JSON.stringify({ settings: { ...defaults, taskType }, language, showAnswerKey: true }) }));
    assert.equal(response.status, 200);
    const { worksheet } = await response.json(); assert.ok(sanitizeStatisticsWorksheet(worksheet)); assert.equal(worksheet.title, getStatisticsCopy(language).title); assert.equal(worksheet.showAnswerKey, true);
  }
  for (const body of [null, [], {}, { settings: { ...defaults, taskCount: 1000 } }]) assert.equal((await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }))).status, 400);
  assert.equal((await POST(new Request("http://localhost", { method: "POST", body: "{" }))).status, 400);
});
