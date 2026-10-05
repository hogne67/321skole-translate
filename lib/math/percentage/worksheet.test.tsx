import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { DEFAULT_PERCENTAGE_SETTINGS, SIMPLE_PERCENTAGES, BASIC_PERCENTAGE_TASK_TYPES, generatePercentageWorksheet, getPercentageCopy, gradePercentageTask, gradePercentageWorksheet, normalizePercentageSettings, percentageFinalValue, percentageTasksPerPage, percentagePrompt, readPercentageAnswer, sanitizePercentageWorksheet, type PercentageTask } from "./worksheet";
import { getAssignmentDerivedState } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/assignmentDerivedState";
import { assignmentToLesson, hasSnapshotContent } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/helpers";
import { readAutoGrade as studentReadAuto } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/autoGrade";
import { assignmentSnapshotToLesson, hasAssignmentSnapshotContent, isFractionWorksheet, isMathWorksheet, readAutoGrade } from "@/lib/submissions/readers";
import { isFractionWorksheet as studentFractionGuard } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/worksheetTypeGuards";
import { POST } from "@/app/api/generate-percentage-worksheet/route";
const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/percentage/PercentageWorksheetView").default as typeof import("@/components/generators/math/percentage/PercentageWorksheetView").default;
const task: PercentageTask = { id: "example", type: "find_percentage", part: 24, whole: 80, percent: 30 };

test("percentage tasks have exact integer parts, simple percentages and an even percentage distribution", () => {
  for (let i = 0; i < 5; i++) {
    const sheet = generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, taskCount: 99 });
    const counts = SIMPLE_PERCENTAGES.map(p => sheet.tasks.filter(t => t.percent === p).length);
    assert.ok(counts.every(n => n === 9));
    for (const t of sheet.tasks) {
      assert.ok(Number.isInteger(t.part) && t.part > 0 && t.part < t.whole);
      assert.ok(t.whole >= 20 && t.whole <= 200);
      assert.equal(t.part * 100, t.whole * t.percent);
    }
    assert.deepEqual(sanitizePercentageWorksheet(sheet), sheet);
    assert.equal(new Set(sheet.tasks.map(t => t.id)).size, 99);
  }
});
test("small ranges and repeated tasks remain valid; impossible ranges are rejected", () => {
  const sheet = generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, minimum: 4, maximum: 4, taskCount: 100 });
  assert.ok(sheet.tasks.every(t => t.whole === 4 && [25, 50, 75].includes(t.percent)));
  assert.throws(() => generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, minimum: 1, maximum: 1 }), /INVALID_COMBINATIONS/);
  for (const patch of [{ minimum: 0 }, { maximum: 10001 }, { minimum: 201 }, { maximum: 20.5 }, { taskCount: 0 }, { taskCount: 101 }, { taskCount: 1.5 }, { showSupport: "true" }]) assert.throws(() => normalizePercentageSettings({ ...DEFAULT_PERCENTAGE_SETTINGS, ...patch }), /INVALID_/);
});
test("sanitization ignores forged keys and rejects invalid or duplicate tasks", () => {
  const sheet = generatePercentageWorksheet(DEFAULT_PERCENTAGE_SETTINGS);
  const forged = { ...sheet, title: "forged", instructions: "forged", tasks: sheet.tasks.map(t => ({ ...t, percent: 99 })) };
  assert.deepEqual(sanitizePercentageWorksheet(forged), sheet);
  for (const patch of [{ part: 0 }, { whole: 0 }, { part: .5 }, { whole: 10001 }, { type: "fraction" }, { id: sheet.tasks[1].id }]) assert.equal(sanitizePercentageWorksheet({ ...sheet, tasks: [{ ...sheet.tasks[0], ...patch }, ...sheet.tasks.slice(1)] }), null);
  assert.equal(sanitizePercentageWorksheet({ ...sheet, tasks: [] }), null);
});
test("setup and result earn independent half credit, and equivalent fractions earn full setup credit", () => {
  for (const answer of [{ numerator: "24", denominator: "80", percent: "30" }, { numerator: "3", denominator: "10", percent: "30" }, { numerator: "2,4", denominator: "8.0", percent: "30,0" }]) assert.equal(gradePercentageTask(task, answer).points, 1);
  const setupOnly = gradePercentageTask(task, { numerator: "24", denominator: "80", percent: "300" });
  assert.ok(setupOnly.setupCorrect); assert.equal(setupOnly.answerCorrect, false); assert.equal(setupOnly.points, .5);
  const resultOnly = gradePercentageTask(task, { numerator: "80", denominator: "24", percent: "30" });
  assert.equal(resultOnly.setupCorrect, false); assert.ok(resultOnly.answerCorrect); assert.equal(resultOnly.points, .5);
  assert.equal(gradePercentageTask(task, { numerator: "24", denominator: "0", percent: "30" }).points, .5);
  assert.equal(gradePercentageTask(task, { percent: "30" }).points, .5);
  assert.equal(gradePercentageTask(task, { numerator: "24%", denominator: "80%", percent: "30" }).setupCorrect, false);
  for (const answer of [undefined, null, {}, { numerator: " ", denominator: "", percent: "" }]) assert.equal(gradePercentageTask(task, answer).isAnswered, false);
  assert.equal(gradePercentageTask(task, { numerator: "3", denominator: "10", percent: "30" }).directSetup, false);
  assert.equal(gradePercentageTask(task, { numerator: "24", denominator: "80", percent: "30" }).directSetup, true);
});
test("weighted scores and partial grades survive student and teacher grade readers", () => {
  const sheet = generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, taskCount: 4 });
  const [a,b,c] = sheet.tasks;
  const grade = gradePercentageWorksheet(sheet, { [a.id]: { numerator: a.part, denominator: a.whole, percent: a.percent }, [b.id]: { percent: b.percent }, [c.id]: { percent: -1 } });
  assert.equal(grade.correctAuto, 1); assert.equal(grade.partialAuto, 1); assert.equal(grade.wrongAuto, 1); assert.equal(grade.unansweredAuto, 1); assert.equal(grade.percentAuto, 38);
  assert.equal(studentReadAuto({ auto: grade })?.partialAuto, 1);
  assert.equal(readAutoGrade({ auto: grade })?.partialAuto, 1);
});
test("percentage snapshots use the same worksheet in student and teacher and never become visual fractions", () => {
  const worksheet = generatePercentageWorksheet(DEFAULT_PERCENTAGE_SETTINGS, "nb", true);
  const assignment = { mathWorksheet: worksheet, mathType: "percentage", contentType: "percentage_worksheet" };
  assert.ok(hasSnapshotContent(assignment)); assert.ok(hasAssignmentSnapshotContent(assignment));
  const state = getAssignmentDerivedState(assignmentToLesson(assignment), assignment);
  assert.deepEqual(state.percentageWorksheet, worksheet); assert.ok(state.isPercentageAssignment);
  assert.equal(state.isGeometryAssignment, false); assert.equal(state.isFractionAssignment, false); assert.equal(state.isLengthAssignment, false); assert.equal(state.isComparisonAssignment, false);
  assert.equal(isMathWorksheet(worksheet), false); assert.equal(isFractionWorksheet(worksheet), false); assert.equal(studentFractionGuard(worksheet), false);
  assert.deepEqual(assignmentSnapshotToLesson(assignment).mathWorksheet, worksheet);
});
test("student gets four labeled inputs per task, no early grading or saved key; teacher sees separate feedback", () => {
  const worksheet = { ...generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, taskCount: 1 }, "nb", true), tasks: [task] };
  const $ = load(renderToStaticMarkup(<View worksheet={worksheet} />));
  assert.equal($("input").length, 4); assert.ok($("input").toArray().every(e => $(e).attr("aria-label")));
  assert.equal($(".length-key,.percentage-feedback").length, 0); assert.ok($("input").toArray().every(e => $(e).attr("value") === ""));
  const teacher = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={{ example: { numerator: "24", denominator: "80", percent: "300" } }} readOnly showAutoCheck />));
  assert.equal(teacher("input[readonly]").length, 4); assert.equal(teacher(".length-correct").length, 1); assert.equal(teacher(".length-wrong").length, 1); assert.ok(teacher(".percentage-feedback").text().includes("Prosenttall: Feil. Svar: 30"));
  assert.equal(teacher("input").eq(1).attr("value"), "100");
});
test("two-column worksheets paginate 12 tasks per page and put the key on its own page", () => {
  for (const showSupport of [true, false]) {
    const worksheet = generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, showSupport, taskCount: 25 }, "nb", true);
    const $ = load(renderToStaticMarkup(<View worksheet={worksheet} printMode />));
    assert.equal($(".length-page").length, 3); assert.equal($("input").length, 0); assert.equal($(".percentage-blank").length, 100); assert.equal($(".percentage-working").length, 25); assert.equal($(".length-key p").length, 25); assert.equal($(".percentage-support").length, showSupport ? 75 : 0);
  }
});
test("localized copy and API validation", async () => {
  for (const language of ["nb", "en", "pt"]) {
    const response = await POST(new Request("http://localhost/api/generate-percentage-worksheet", { method: "POST", body: JSON.stringify({ settings: DEFAULT_PERCENTAGE_SETTINGS, language }) }));
    assert.equal(response.status, 200);
    const sheet = (await response.json()).worksheet;
    assert.equal(sheet.title, getPercentageCopy(language).worksheetTitle); assert.ok(sanitizePercentageWorksheet(sheet));
    assert.ok(percentagePrompt(task, language).includes("24"));
  }
  assert.equal((await POST(new Request("http://localhost/api/generate-percentage-worksheet", { method: "POST", body: "{" }))).status, 400);
  assert.equal((await POST(new Request("http://localhost/api/generate-percentage-worksheet", { method: "POST", body: JSON.stringify({ settings: { ...DEFAULT_PERCENTAGE_SETTINGS, minimum: 1, maximum: 1 } }) }))).status, 400);
});

test("find part generation uses exact integer answers and preserves type, title and instructions", () => {
  for (const language of ["nb", "en", "pt"]) {
    const sheet = generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, taskType: "find_part", taskCount: 99 }, language);
    assert.ok(sheet.tasks.every(t => t.type === "find_part" && Number.isInteger(t.part) && t.part * 100 === t.percent * t.whole));
    assert.equal(sheet.title, getPercentageCopy(language).partTitle);
    assert.equal(sheet.instructions, getPercentageCopy(language).partInstructions);
    assert.deepEqual(sanitizePercentageWorksheet(sheet), sheet);
    const answers = Object.fromEntries(sheet.tasks.map(t => [t.id, { numerator: t.percent, multiplier: t.whole, denominator: 100, result: t.part }]));
    assert.equal(gradePercentageWorksheet(sheet, answers).percentAuto, 100);
  }
});
test("legacy percentage worksheets and saved answers retain their meaning", () => {
  const sheet = generatePercentageWorksheet(DEFAULT_PERCENTAGE_SETTINGS);
  const legacySettings = { ...sheet.settings };
  delete legacySettings.taskType;
  const legacy = { ...sheet, settings: legacySettings };
  assert.deepEqual(sanitizePercentageWorksheet(legacy), sheet);
  assert.equal(gradePercentageTask(task, { numerator: "24", denominator: "80", percent: "30" }).points, 1);
  assert.equal(gradePercentageTask(task, { result: "999" }).isAnswered, false);
  for (const value of ["unknown", "find_everything", "", null, 1]) assert.throws(() => normalizePercentageSettings({ ...DEFAULT_PERCENTAGE_SETTINGS, taskType: value }), /INVALID_TYPE/);
});
test("find part accepts commuted factors and equivalent setups without accepting wrong operations", () => {
  const partTask: PercentageTask = { id: "part", type: "find_part", part: 20, whole: 80, percent: 25 };
  const answer = { numerator: "25", multiplier: "80", denominator: "100", result: "20" };
  const correct = gradePercentageTask(partTask, answer);
  assert.equal(correct.points, 1); assert.ok(correct.directSetup);
  const commuted = gradePercentageTask(partTask, { ...answer, numerator: "80", multiplier: "25" });
  assert.equal(commuted.points, 1); assert.ok(commuted.directSetup);
  const reduced = gradePercentageTask(partTask, { ...answer, numerator: "1", denominator: "4" });
  assert.equal(reduced.points, 1); assert.equal(reduced.directSetup, false);
  assert.equal(gradePercentageTask(partTask, { ...answer, numerator: "0,25", denominator: "1" }).points, 1);
  for (const patch of [{ denominator: "0" }, { denominator: "25", numerator: "100" }, { numerator: "25%" }, { multiplier: "" }, { numerator: "105", multiplier: "1" }]) {
    const grade = gradePercentageTask(partTask, { ...answer, ...patch });
    assert.equal(grade.setupCorrect, false); assert.equal(grade.points, .5);
  }
  assert.equal(gradePercentageTask(partTask, { ...answer, result: "2000" }).points, .5);
  assert.equal(gradePercentageTask(partTask, { result: "20" }).points, .5);
  assert.equal(gradePercentageTask(partTask, { percent: "20" }).isAnswered, false);
  assert.deepEqual(correct.correctAnswer, { numerator: "25", multiplier: "80", denominator: "100", result: "20" });
});
test("find part snapshots, grading and four editable slots reach both views without revealing answers early", () => {
  const worksheet = generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, taskType: "find_part", taskCount: 4 }, "nb", true);
  const assignment = { mathWorksheet: worksheet, mathType: "percentage", contentType: "percentage_worksheet" };
  const state = getAssignmentDerivedState(assignmentToLesson(assignment), assignment);
  assert.deepEqual(state.percentageWorksheet, worksheet);
  assert.deepEqual(assignmentSnapshotToLesson(assignment).mathWorksheet, worksheet);
  const student = load(renderToStaticMarkup(<View worksheet={worksheet} />));
  assert.equal(student("input").length, 16); assert.equal(student(".percentage-product").length, 4);
  assert.equal(student(".length-key,.percentage-feedback").length, 0);
  assert.ok(student("input").toArray().every(el => student(el).attr("value") === "" && student(el).attr("aria-label")));
  const first = worksheet.tasks[0], second = worksheet.tasks[1];
  const answers = { [first.id]: { numerator: String(first.percent), multiplier: String(first.whole), denominator: "100", result: "99999" }, [second.id]: { result: String(second.part) } };
  const grade = gradePercentageWorksheet(worksheet, answers);
  assert.equal(grade.partialAuto, 2); assert.equal(grade.percentAuto, 25); assert.equal(grade.unansweredAuto, 2);
  assert.equal(studentReadAuto({ auto: grade })?.partialAuto, 2); assert.equal(readAutoGrade({ auto: grade })?.partialAuto, 2);
  const teacher = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} readOnly showAutoCheck />));
  assert.equal(teacher("input[readonly]").length, 16); assert.equal(teacher(".length-correct").length, 2); assert.equal(teacher(".length-wrong").length, 2);
});
test("find part prints four blank slots, optional support and the correct equation on the answer key", () => {
  for (const showSupport of [true, false]) {
    const worksheet = generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, taskType: "find_part", showSupport, taskCount: 25 }, "nb", true);
    const $ = load(renderToStaticMarkup(<View worksheet={worksheet} printMode />));
    assert.equal($(".length-page").length, 3); assert.equal($(".percentage-blank").length, 100);
    assert.equal($(".percentage-support").length, showSupport ? 75 : 0);
    const first = worksheet.tasks[0];
    assert.ok($(".length-key p").first().text().includes(`${first.percent} × ${first.whole}100 = ${first.part}`));
  }
});
test("API handles both types and rejects mismatched task types in saved data", async () => {
  const response = await POST(new Request("http://localhost/api/generate-percentage-worksheet", { method: "POST", body: JSON.stringify({ settings: { ...DEFAULT_PERCENTAGE_SETTINGS, taskType: "find_part" } }) }));
  assert.equal(response.status, 200);
  const sheet = (await response.json()).worksheet;
  assert.ok(sanitizePercentageWorksheet(sheet)); assert.ok(percentagePrompt(sheet.tasks[0], "nb").includes(" % av "));
  assert.equal(sanitizePercentageWorksheet({ ...sheet, settings: { ...sheet.settings, taskType: "find_percentage" } }), null);
  assert.equal(sanitizePercentageWorksheet({ ...sheet, tasks: [{ ...sheet.tasks[0], type: "find_percentage" }, ...sheet.tasks.slice(1)] }), null);
});

test("find whole generates exact integers in the teacher's whole range and has localized prompts", () => {
  for (const language of ["nb", "en", "pt"]) {
    const sheet = generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, taskType: "find_whole", minimum: 80, maximum: 120, taskCount: 36 }, language);
    assert.ok(sheet.tasks.every(t => t.type === "find_whole" && Number.isInteger(t.whole) && Number.isInteger(t.part) && t.whole >= 80 && t.whole <= 120 && t.part * 100 === t.whole * t.percent));
    assert.equal(sheet.title, getPercentageCopy(language).wholeTitle); assert.equal(sheet.instructions, getPercentageCopy(language).wholeInstructions);
    assert.deepEqual(sanitizePercentageWorksheet(sheet), sheet);
    const example = { id: "whole", type: "find_whole" as const, part: 20, percent: 25, whole: 80 };
    const prompt = percentagePrompt(example, language);
    assert.ok(prompt.includes("20") && prompt.includes("25") && !prompt.includes("80"));
  }
});
test("whole setup reverses the percentage calculation, allowing commuted and simplified factors", () => {
  const whole: PercentageTask = { id: "whole", type: "find_whole", part: 20, percent: 25, whole: 80 };
  const answer = { numerator: "20", multiplier: "100", denominator: "25", result: "80" };
  const correct = gradePercentageTask(whole, answer);
  assert.equal(correct.points, 1); assert.ok(correct.directSetup);
  assert.deepEqual(correct.correctAnswer, answer);
  const commuted = gradePercentageTask(whole, { ...answer, numerator: "100", multiplier: "20" });
  assert.equal(commuted.points, 1); assert.ok(commuted.directSetup);
  const reduced = gradePercentageTask(whole, { ...answer, multiplier: "4", denominator: "1" });
  assert.equal(reduced.points, 1); assert.equal(reduced.directSetup, false);
  assert.equal(gradePercentageTask(whole, { ...answer, multiplier: "1", denominator: "0,25", result: "80.0" }).points, 1);
  for (const patch of [{ denominator: "0" }, { denominator: "100", multiplier: "25" }, { numerator: "20%" }, { multiplier: "" }, { denominator: "" }]) {
    const grade = gradePercentageTask(whole, { ...answer, ...patch });
    assert.equal(grade.setupCorrect, false); assert.equal(grade.points, .5);
  }
  assert.equal(gradePercentageTask(whole, { ...answer, result: "8" }).points, .5);
  assert.equal(gradePercentageTask(whole, { result: "80" }).points, .5);
  assert.equal(gradePercentageTask(whole, { percent: "80" }).isAnswered, false);
});
test("mixed worksheets balance all three types for small, odd and large task counts", () => {
  for (const taskCount of [1, 2, 3, 5, 12, 37, 100]) {
    const sheet = generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, taskType: "mixed", taskCount });
    const counts = BASIC_PERCENTAGE_TASK_TYPES.map(type => sheet.tasks.filter(t => t.type === type).length);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
    assert.equal(new Set(sheet.tasks.map(t => t.id)).size, taskCount);
    assert.deepEqual(sanitizePercentageWorksheet(sheet), sheet);
    const answers = Object.fromEntries(sheet.tasks.map(t => [t.id, t.type === "find_percentage" ? { numerator: t.part, denominator: t.whole, percent: t.percent } : t.type === "find_part" ? { numerator: t.percent, multiplier: t.whole, denominator: 100, result: t.part } : { numerator: t.part, multiplier: 100, denominator: t.percent, result: t.whole }]));
    assert.equal(gradePercentageWorksheet(sheet, answers).percentAuto, 100);
  }
  const firstTypes = new Set<string>();
  for (let seed = 1; seed <= 40; seed++) {
    let state = seed;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    firstTypes.add(generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, taskType: "mixed", taskCount: 1 }, "nb", false, random).tasks[0].type);
  }
  assert.equal(firstTypes.size, 3);
});
test("mixed mode accepts real task types only and does not weaken single-type validation", () => {
  const sheet = generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, taskType: "mixed" });
  for (const type of ["mixed", "discount", "increase", "find_everything", undefined]) assert.equal(sanitizePercentageWorksheet({ ...sheet, tasks: [{ ...sheet.tasks[0], type }, ...sheet.tasks.slice(1)] }), null);
  assert.equal(sanitizePercentageWorksheet({ ...sheet, settings: { ...sheet.settings, taskType: "find_whole" } }), null);
  const whole = generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, taskType: "find_whole" });
  assert.equal(sanitizePercentageWorksheet({ ...whole, tasks: [{ ...whole.tasks[0], type: "find_part" }, ...whole.tasks.slice(1)] }), null);
});
test("whole and mixed snapshots retain task types and separate feedback in both views", () => {
  for (const taskType of ["find_whole", "mixed"] as const) {
    const worksheet = generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, taskType }, "nb", true);
    const assignment = { mathWorksheet: worksheet, mathType: "percentage", contentType: "percentage_worksheet" };
    const state = getAssignmentDerivedState(assignmentToLesson(assignment), assignment);
    assert.deepEqual(state.percentageWorksheet, worksheet); assert.ok(state.isPercentageAssignment);
    assert.deepEqual(assignmentSnapshotToLesson(assignment).mathWorksheet, worksheet);
    assert.equal(isFractionWorksheet(worksheet), false); assert.equal(studentFractionGuard(worksheet), false);
    const student = load(renderToStaticMarkup(<View worksheet={worksheet} />));
    assert.equal(student("input").length, 48);
    assert.equal(student(".length-key,.percentage-feedback").length, 0);
    const answers = Object.fromEntries(worksheet.tasks.map(t => [t.id, t.type === "find_percentage" ? { percent: t.percent } : { result: t.type === "find_whole" ? t.whole : t.part }]));
    const grade = gradePercentageWorksheet(worksheet, answers);
    assert.equal(grade.partialAuto, 12); assert.equal(grade.percentAuto, 50);
    assert.equal(studentReadAuto({ auto: grade })?.partialAuto, 12); assert.equal(readAutoGrade({ auto: grade })?.partialAuto, 12);
    const teacher = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} readOnly showAutoCheck />));
    assert.equal(teacher("input[readonly]").length, 48);
    assert.equal(teacher(".length-correct").length, 12); assert.equal(teacher(".length-wrong").length, 12);
  }
});
test("whole questions do not reveal the hidden whole and use the right support labels", () => {
  const worksheet = { ...generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, taskType: "find_whole", taskCount: 1 }, "nb", true), tasks: [{ id: "whole", type: "find_whole" as const, part: 20, percent: 25, whole: 80 }] };
  const student = load(renderToStaticMarkup(<View worksheet={worksheet} />));
  assert.equal(student(".percentage-support").text(), "DelHundreProsenttall");
  assert.equal(student(".percentage-task").text().includes("80"), false);
  assert.equal(student(".percentage-task").attr("data-task-type"), "find_whole");
  const paper = load(renderToStaticMarkup(<View worksheet={worksheet} printMode />));
  assert.ok(paper(".length-key p").text().includes("20 × 10025 = 80"));
});
test("whole and mixed paper worksheets keep twelve-task chunks and optional labels", () => {
  for (const taskType of ["find_whole", "mixed"] as const) for (const showSupport of [true, false]) {
    const worksheet = generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, taskType, showSupport, taskCount: 25 }, "nb", true);
    const $ = load(renderToStaticMarkup(<View worksheet={worksheet} printMode />));
    assert.equal($(".length-page").length, 3); assert.equal($(".percentage-blank").length, 100);
    assert.equal($(".percentage-support").length, showSupport ? 75 : 0);
    assert.equal($(".length-key p").length, 25);
  }
});
test("API creates whole and mixed worksheets in each supported language", async () => {
  for (const taskType of ["find_whole", "mixed"] as const) for (const language of ["nb", "en", "pt"]) {
    const response = await POST(new Request("http://localhost/api/generate-percentage-worksheet", { method: "POST", body: JSON.stringify({ settings: { ...DEFAULT_PERCENTAGE_SETTINGS, taskType }, language }) }));
    assert.equal(response.status, 200);
    const sheet = (await response.json()).worksheet;
    assert.ok(sanitizePercentageWorksheet(sheet));
    assert.equal(sheet.title, taskType === "mixed" ? getPercentageCopy(language).mixedTitle : getPercentageCopy(language).wholeTitle);
  }
});

test("percentage setup uses both editable factors above the bar and a unitless answer", () => {
  const answer = { numerator: "24", multiplier: "100", denominator: "80", percent: "30" };
  assert.equal(gradePercentageTask(task, answer).points, 1);
  assert.deepEqual(gradePercentageTask(task, answer).correctAnswer, answer);
  assert.ok(gradePercentageTask(task, { ...answer, numerator: "100", multiplier: "24" }).directSetup);
  assert.equal(gradePercentageTask(task, { ...answer, numerator: "3", denominator: "10" }).points, 1);
  assert.equal(gradePercentageTask(task, { ...answer, multiplier: "10", denominator: "8" }).points, 1);
  for (const multiplier of ["", "1", "100%", "0"]) assert.equal(gradePercentageTask(task, { ...answer, multiplier }).points, .5);
  assert.equal(gradePercentageTask(task, { ...answer, percent: "30%" }).points, .5);
  const worksheet = { ...generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, taskCount: 1 }), tasks: [task] };
  const $ = load(renderToStaticMarkup(<View worksheet={worksheet} />));
  assert.equal($(".percentage-support").text(), "DelHundreHelhet");
  assert.equal($(".percentage-equation").text().includes("%"), false);
  assert.equal($(".percentage-product input").length, 2);
  assert.equal($("input").last().attr("aria-label"), "Oppgave 1: Prosenttall");
});

test("old percentage answers migrate fixed hundred without filling new blank answers", () => {
  const legacy = { numerator: "3", denominator: "10", percent: "30" };
  const migrated = readPercentageAnswer(legacy);
  assert.equal(migrated.multiplier, "100");
  assert.equal(gradePercentageTask(task, migrated).points, 1);
  assert.deepEqual(readPercentageAnswer(migrated), migrated);
  assert.equal(readPercentageAnswer(undefined).multiplier, "");
  const edited = { ...readPercentageAnswer(undefined), numerator: "24", denominator: "80", percent: "30" };
  assert.equal(gradePercentageTask(task, edited).setupCorrect, false);
});

test("optional conclusions survive snapshots and both views without changing automatic grades", () => {
  const worksheet = generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, showConclusion: true, taskType: "mixed" });
  assert.deepEqual(sanitizePercentageWorksheet(worksheet), worksheet);
  assert.deepEqual(assignmentSnapshotToLesson({ mathWorksheet: worksheet }).mathWorksheet, worksheet);
  const t = worksheet.tasks[0], correct = gradePercentageTask(t, null).correctAnswer;
  const answers = { [t.id]: { ...correct, conclusion: "50 % av 20 er 10." } };
  const teacher = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} readOnly showAutoCheck />));
  assert.equal(teacher("textarea[readonly]").length, 12);
  assert.ok(teacher("textarea").toArray().every(el => teacher(el).attr("rows") === "1"));
  assert.equal(teacher("textarea").first().text(), "50 % av 20 er 10.");
  assert.equal(gradePercentageTask(t, answers[t.id]).points, 1);
  assert.equal(gradePercentageTask(t, { conclusion: "50 % av 20 er 10." }).isAnswered, false);
  assert.equal(readPercentageAnswer({ conclusion: "x".repeat(600) }).conclusion?.length, 500);
  const paper = load(renderToStaticMarkup(<View worksheet={worksheet} printMode />));
  assert.equal(paper(".length-page").length, 2);
  assert.equal(paper(".percentage-conclusion-line").length, 12);
  assert.equal(paper("textarea").length, 0);
  assert.equal(paper(".length-page").first().find(".percentage-task").length, 10);
});

test("conclusion control is optional for old worksheets and strictly validated", () => {
  const oldSettings = { ...DEFAULT_PERCENTAGE_SETTINGS };
  delete oldSettings.showConclusion;
  assert.equal(normalizePercentageSettings(oldSettings).showConclusion, false);
  for (const showConclusion of ["true", 1, null]) assert.throws(() => normalizePercentageSettings({ ...DEFAULT_PERCENTAGE_SETTINGS, showConclusion }), /INVALID_CONCLUSION/);
  for (const language of ["nb", "en", "pt"]) {
    const sheet = generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, showConclusion: true }, language);
    assert.ok(sheet.instructions.endsWith(getPercentageCopy(language).conclusionInstructions));
    assert.deepEqual(sanitizePercentageWorksheet(sheet), sheet);
  }
});

test("discounts and increases preserve the original price range and generate exact integer changes", () => {
  for (const taskType of ["discount", "increase"] as const) for (const language of ["nb", "en", "pt"]) {
    const sheet = generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, taskType, minimum: 100, maximum: 10000, taskCount: 99 }, language);
    assert.deepEqual(sanitizePercentageWorksheet(sheet), sheet);
    assert.equal(sheet.title, taskType === "discount" ? getPercentageCopy(language).discountTitle : getPercentageCopy(language).increaseTitle);
    for (const t of sheet.tasks) {
      assert.equal(t.type, taskType); assert.ok(t.whole >= 100 && t.whole <= 10000);
      assert.equal(t.part * 100, t.whole * t.percent);
      const final = percentageFinalValue(t);
      assert.ok(Number.isInteger(final) && final > 0);
      assert.equal(final, taskType === "discount" ? t.whole - t.part : t.whole + t.part);
      assert.equal(gradePercentageTask(t, gradePercentageTask(t, null).correctAnswer).points, 1);
    }
    for (const percent of SIMPLE_PERCENTAGES) assert.equal(sheet.tasks.filter(t => t.percent === percent).length, 9);
  }
});

test("both price-change steps earn independent quarter credit without altering basic grading", () => {
  for (const type of ["discount", "increase"] as const) {
    const t: PercentageTask = { id: type, type, whole: 200, percent: 25, part: 50 };
    const correct = { numerator: "25", multiplier: "200", denominator: "100", result: "50", change: "50", finalValue: type === "discount" ? "150" : "250" };
    for (let mask = 0; mask < 16; mask++) {
      const answer = { ...correct, numerator: mask & 1 ? "25" : "0", result: mask & 2 ? "50" : "", change: mask & 4 ? "50" : "", finalValue: mask & 8 ? correct.finalValue : "" };
      const g = gradePercentageTask(t, answer);
      const points = [1, 2, 4, 8].filter(bit => mask & bit).length / 4;
      assert.equal(g.points, points);
      assert.equal(g.isPartial, points > 0 && points < 1);
      assert.equal(g.setupCorrect, (mask & 5) === 5);
      assert.equal(g.answerCorrect, (mask & 10) === 10);
    }
    assert.deepEqual(gradePercentageTask(t, correct).correctAnswer, correct);
    assert.ok(gradePercentageTask(t, { ...correct, numerator: "200", multiplier: "25" }).directSetup);
    assert.equal(gradePercentageTask(t, { ...correct, numerator: "1", denominator: "4", result: "50,0" }).points, 1);
    for (const patch of [{ denominator: "0" }, { multiplier: "" }, { numerator: "25%" }]) assert.equal(gradePercentageTask(t, { ...correct, ...patch }).points, .75);
    assert.equal(gradePercentageTask(t, { ...correct, finalValue: "200 kr" }).points, .75);
    assert.equal(gradePercentageTask(t, { ...correct, finalValue: type === "discount" ? "250" : "150" }).points, .75);
    assert.equal(gradePercentageTask(t, { finalValue: correct.finalValue }).points, .25);
    for (const answer of [null, {}, { percent: "25" }, { conclusion: "Svar med tekst" }]) assert.equal(gradePercentageTask(t, answer).isAnswered, false);
  }
  assert.equal(gradePercentageTask(task, { numerator: "24", multiplier: "100", denominator: "80" }).points, .5);
  assert.equal(gradePercentageTask(task, { change: "50", finalValue: "150" }).isAnswered, false);
});

test("mixed mode never generates or accepts price changes", () => {
  for (let i = 0; i < 20; i++) {
    const sheet = generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, taskType: "mixed", taskCount: 100 });
    assert.ok(sheet.tasks.every(t => (BASIC_PERCENTAGE_TASK_TYPES as readonly string[]).includes(t.type)));
  }
  for (const taskType of ["discount", "increase"] as const) {
    const sheet = generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, taskType });
    assert.equal(sanitizePercentageWorksheet({ ...sheet, settings: { ...sheet.settings, taskType: "mixed" } }), null);
    assert.equal(sanitizePercentageWorksheet({ ...sheet, tasks: [{ ...sheet.tasks[0], type: "find_part" }, ...sheet.tasks.slice(1)] }), null);
  }
});

test("price-change snapshots, six fields and quarter-credit summaries reach both views", () => {
  for (const taskType of ["discount", "increase"] as const) {
    const worksheet = generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, taskType, showConclusion: true, taskCount: 4 }, "nb", true);
    const assignment = { mathWorksheet: worksheet, mathType: "percentage", contentType: "percentage_worksheet" };
    assert.deepEqual(getAssignmentDerivedState(assignmentToLesson(assignment), assignment).percentageWorksheet, worksheet);
    assert.deepEqual(assignmentSnapshotToLesson(assignment).mathWorksheet, worksheet);
    const student = load(renderToStaticMarkup(<View worksheet={worksheet} />));
    assert.equal(student("input").length, 24); assert.equal(student("textarea").length, 4);
    assert.equal(student(".percentage-change-equation").length, 4);
    assert.equal(student(".length-key,.percentage-feedback").length, 0);
    assert.ok(student("input").toArray().every(el => student(el).attr("value") === "" && student(el).attr("aria-label")));
    const [a, b, c] = worksheet.tasks;
    const answers = { [a.id]: gradePercentageTask(a, null).correctAnswer, [b.id]: { ...gradePercentageTask(b, null).correctAnswer, finalValue: "0" }, [c.id]: { finalValue: String(percentageFinalValue(c)) } };
    const grade = gradePercentageWorksheet(worksheet, answers);
    assert.equal(grade.correctAuto, 1); assert.equal(grade.partialAuto, 2); assert.equal(grade.unansweredAuto, 1); assert.equal(grade.percentAuto, 50);
    assert.equal(studentReadAuto({ auto: grade })?.partialAuto, 2); assert.equal(readAutoGrade({ auto: grade })?.partialAuto, 2);
    const teacher = load(renderToStaticMarkup(<View worksheet={worksheet} answersByTaskId={answers} readOnly showAutoCheck />));
    assert.equal(teacher("input[readonly]").length, 24);
    assert.equal(teacher(".length-correct").length, 8);
    assert.equal(teacher(".length-wrong").length, 4);
  }
});

test("price-change paper chunks leave room for both steps and show a two-step key", () => {
  for (const taskType of ["discount", "increase"] as const) for (const showConclusion of [true, false]) {
    const worksheet = generatePercentageWorksheet({ ...DEFAULT_PERCENTAGE_SETTINGS, taskType, showConclusion, taskCount: 25 }, "nb", true);
    const perPage = percentageTasksPerPage(worksheet.settings);
    assert.equal(perPage, showConclusion ? 8 : 10);
    const $ = load(renderToStaticMarkup(<View worksheet={worksheet} printMode />));
    assert.equal($(".length-page").length, Math.ceil(25 / perPage));
    assert.equal($(".length-page").first().find(".percentage-task").length, perPage);
    assert.equal($(".percentage-blank").length, 150);
    assert.equal($(".percentage-key-task").length, 25); assert.equal($(".percentage-key-new-price").length, 25);
    assert.equal($(".percentage-conclusion-line").length, showConclusion ? 25 : 0);
    const first = worksheet.tasks[0];
    assert.equal($(".percentage-key-new-price").first().text(), `${first.whole} ${taskType === "discount" ? "−" : "+"} ${first.part} = ${percentageFinalValue(first)}`);
  }
  assert.equal(percentageTasksPerPage({ taskType: "mixed", showConclusion: true }), 10);
  assert.equal(percentageTasksPerPage({ taskType: "find_percentage" }), 12);
});

test("API supports separate discount and increase modes in all worksheet languages", async () => {
  for (const taskType of ["discount", "increase"] as const) for (const language of ["nb", "en", "pt"]) {
    const response = await POST(new Request("http://localhost/api/generate-percentage-worksheet", { method: "POST", body: JSON.stringify({ settings: { ...DEFAULT_PERCENTAGE_SETTINGS, taskType }, language }) }));
    assert.equal(response.status, 200);
    const sheet = (await response.json()).worksheet;
    assert.ok(sanitizePercentageWorksheet(sheet));
    assert.ok(sheet.tasks.every((t: PercentageTask) => t.type === taskType && percentagePrompt(t, language).includes(String(t.whole))));
  }
});
