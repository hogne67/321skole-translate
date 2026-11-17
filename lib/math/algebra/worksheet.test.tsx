import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { formatAlgebraInput, formatAlgebraPolynomial, parseAlgebraExpression, sameAlgebraPolynomial } from "./expression";
import { ALGEBRA_LEVELS, DEFAULT_ALGEBRA_SETTINGS as defaults, algebraTaskAnswer, algebraTaskHint, algebraTaskPrompt, generateAlgebraWorksheet, gradeAlgebraTask, gradeAlgebraWorksheet, normalizeAlgebraSettings, readAlgebraAnswer, sanitizeAlgebraWorksheet, type AlgebraTask } from "./worksheet";
import { POST } from "@/app/api/generate-algebra-worksheet/route";
import { assignmentToLesson, hasSnapshotContent } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/helpers";
import { getAssignmentDerivedState } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/assignmentDerivedState";
import { assignmentSnapshotToLesson, hasAssignmentSnapshotContent, isFractionWorksheet, readAutoGrade } from "@/lib/submissions/readers";
import { isFractionWorksheet as studentFractionGuard } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/worksheetTypeGuards";
import { mathEditorHref } from "../editor";
const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/algebra/AlgebraWorksheetView").default as typeof import("@/components/generators/math/algebra/AlgebraWorksheetView").default;
const task = (expression: string, type: AlgebraTask["type"] = "mixed"): AlgebraTask => ({ id: "test", type, expression });
const normalized = (expression: string) => { const p = parseAlgebraExpression(expression); assert.ok(p, expression); return formatAlgebraPolynomial(p.polynomial); };

for (const level of ALGEBRA_LEVELS) test(`${level}: ranges, signs, support and languages round-trip and grade exactly`, () => {
  for (const maxCoefficient of [2, 6, 12]) for (const allowNegative of [false, true]) for (const showSupport of [false, true]) for (const includeSquares of [false, true]) for (const includeParentheses of [false, true]) for (const language of ["nb", "en", "pt"]) {
    const settings = { ...defaults, level, maxCoefficient, allowNegative, showSupport, includeSquares, includeParentheses, taskCount: 13 }, sheet = generateAlgebraWorksheet(settings, language, true);
    assert.deepEqual(sanitizeAlgebraWorksheet(JSON.parse(JSON.stringify(sheet))), sheet); assert.deepEqual(sheet.settings, settings);
    assert.equal(new Set(sheet.tasks.map(t => t.id)).size, 13);
    for (const t of sheet.tasks) {
      assert.equal(t.type, level); const parsed = parseAlgebraExpression(t.expression)!; assert.ok(parsed); assert.ok(parsed.degree <= 2);
      if (!allowNegative) assert.doesNotMatch(t.expression, /[−-]/);
      assert.ok(parsed.numbers.every(n => n <= maxCoefficient));
      assert.equal(gradeAlgebraTask(t, { value: algebraTaskAnswer(t) }).points, 1);
      assert.doesNotMatch(algebraTaskPrompt(t, language) + algebraTaskHint(t, language), /undefined|NaN|\{/);
    }
    const answers = Object.fromEntries(sheet.tasks.map(t => [t.id, { value: algebraTaskAnswer(t) }])); assert.equal(gradeAlgebraWorksheet(sheet, answers).percentAuto, 100);
  }
});

test("exact collection distinguishes sums from products even where numerical substitution could coincide", () => {
  const pairs = [["a+b", "a + b"], ["2a+a+b*b+4", "b² + 4 + 3a"], ["2*a*3*b", "6ba"], ["a*a+b*b", "b^2+a^2"], ["3a-2b+a+b", "4a-b"], ["a-a+b-b", "0"], ["-a-a", "-2a"], ["2(a+b)", "2a+2b"], ["(a+b)^2", "a²+2ab+b²"], ["(-2a)*(-3b)", "6ab"], ["2*(3a)", "6a"], ["(2a)*3", "6a"]];
  for (const [left, right] of pairs) assert.equal(normalized(left), normalized(right), left);
  assert.equal(sameAlgebraPolynomial(parseAlgebraExpression("a+b")!.polynomial, parseAlgebraExpression("ab")!.polynomial), false);
  assert.notEqual(normalized("b*b"), normalized("2b"));
  assert.notEqual(normalized("a²+b²"), normalized("2ab"));
});

test("fully simplified form allows reordered terms, explicit coefficient multiplication and harmless grouping", () => {
  for (const expression of ["3a+b²+4", "4+b^2+a*3", "b²+3*a+4", "6ba", "-a+b", "(3a)+b²+4", "0", "-1", "a²b²", "2(a)"]) assert.equal(parseAlgebraExpression(expression)?.isSimplified, true, expression);
});

test("unfinished form detects duplicate terms, numerical products, repeated letters, identities and expansion", () => {
  for (const expression of ["2a+a+b²+4", "3a+b*b+4", "3a+b²+2+2", "a-a", "a+0", "0a", "1a", "a^1", "2*3*a", "2a*3b", "2*(3a)", "(2a)*3", "a*(-b)", "(-a)*(-b)", "-(a+b)", "2(a+b)", "(a+b)^2", "2^3a"]) assert.equal(parseAlgebraExpression(expression)?.isSimplified, false, expression);
});

test("parser accepts safe notation and rejects unsupported or unbounded input without evaluation", () => {
  for (const expression of ["2a + 3b", "a×a", "a·a", "a*a", "−2a–b", "a²", "b^2", "2(ab)"]) assert.ok(parseAlgebraExpression(expression), expression);
  for (const expression of ["", " ", "a+b=ab", "x+x", "A+B", "a/b", "1.5a", "1,5a", "2 3a", "a2", "a**2", "a^0", "0^0", "a^-1", "a^7", "a^99", "a^2^2", "(a+b", "a+b)", "a+", "*a", "a/*b", "a;alert(1)", "constructor", "<script>", "Infinity", "a".repeat(241), "(".repeat(12) + "a" + ")".repeat(12), "(a+b)^6*(a+b)^6", "999999*999999"]) assert.equal(parseAlgebraExpression(expression), null, expression);
});

test("display formatting never calculates or combines the student's expression", () => {
  assert.equal(formatAlgebraInput("2a+a+b*b+4"), "2a+a+b·b+4");
  assert.equal(formatAlgebraInput("3a+b^2+4"), "3a+b²+4");
  assert.equal(formatAlgebraInput("a^20"), "a^20");
});

test("complete equivalent expressions earn full credit regardless of term or factor order", () => {
  const t = task("2a + a + b · b + 4");
  for (const answer of ["3a+b²+4", "4+b^2+3*a", "b²+4+a*3", { value: "3a+b²+4" }]) assert.equal(gradeAlgebraTask(t, answer).points, 1);
  assert.equal(gradeAlgebraTask(task("2 · a · 3 · b", "products"), "6ba").points, 1);
  assert.equal(gradeAlgebraTask(task("a + b", "collect"), "b+a").points, 1);
});

test("equivalent unfinished answers earn half credit with a specific reason", () => {
  const t = task("2a + a + b · b + 4");
  for (const answer of ["2a+a+b²+4", "3a+b*b+4", "3a+b²+2+2", t.expression]) {
    const grade = gradeAlgebraTask(t, answer); assert.equal(grade.points, .5); assert.equal(grade.reason, "unfinished"); assert.equal(grade.isCorrect, false); assert.equal(grade.isPartial, true);
  }
  assert.equal(gradeAlgebraTask(task("a-a", "collect"), "a-a").points, .5);
  assert.equal(gradeAlgebraTask(task("a-a", "collect"), "0").points, 1);
});

test("wrong answers receive only bounded credit for correct collected coefficients", () => {
  const t = task("2a+a+b*b+4");
  assert.equal(gradeAlgebraTask(t, "3a+b²+5").points, 1 / 3);
  assert.equal(gradeAlgebraTask(t, "3a").points, 1 / 6);
  assert.equal(gradeAlgebraTask(t, "3a+b²+4+ab").points, .375);
  for (const [expression, answer] of [["a+b", "ab"], ["b*b", "2b"], ["a²+b²", "2ab"], ["a-a", "a"]]) assert.equal(gradeAlgebraTask(task(expression), answer).points, 0);
});

test("negative terms, implicit minus one and complete cancellation are exact", () => {
  for (const [expression, answer] of [["2a-a", "a"], ["a-2a", "-a"], ["-2a-a+b-b", "−3a"], ["-2*a*3*b", "-6ab"], ["-a*a", "-a²"], ["2a-2a+3b-3b", "0"]]) assert.equal(gradeAlgebraTask(task(expression), answer).points, 1);
});

test("normalization and grading distinguish unanswered, invalid, wrong and partial answers", () => {
  assert.deepEqual(readAlgebraAnswer(null), { value: "" }); assert.equal(readAlgebraAnswer({ value: "a".repeat(500) }).value.length, 240);
  for (const answer of [undefined, null, "", { value: " " }]) assert.equal(gradeAlgebraTask(task("a+a"), answer).isAnswered, false);
  for (const answer of ["a=2a", "a/b", { value: 2 }, { value: "a".repeat(241) }]) { const g = gradeAlgebraTask(task("a+a"), answer); assert.equal(g.isAnswered, true); assert.equal(g.points, 0); assert.equal(g.reason, "invalid"); }
  const sheet = generateAlgebraWorksheet({ ...defaults, taskCount: 4 });
  const answers = { [sheet.tasks[0].id]: algebraTaskAnswer(sheet.tasks[0]), [sheet.tasks[1].id]: sheet.tasks[1].expression, [sheet.tasks[2].id]: "wrong" };
  const result = gradeAlgebraWorksheet(sheet, answers); assert.equal(result.correctAuto, 1); assert.equal(result.partialAuto, 1); assert.equal(result.wrongAuto, 1); assert.equal(result.unansweredAuto, 1); assert.equal(result.percentAuto, 38);
});

test("settings reject bad ranges, levels and non-boolean choices", () => {
  for (const invalid of [null, [], {}, { ...defaults, level: "bad" }, { ...defaults, maxCoefficient: 1 }, { ...defaults, maxCoefficient: 13 }, { ...defaults, maxCoefficient: 2.5 }, { ...defaults, taskCount: 0 }, { ...defaults, taskCount: 61 }, { ...defaults, taskCount: Infinity }, { ...defaults, allowNegative: 1 }, { ...defaults, showSupport: "yes" }]) assert.throws(() => normalizeAlgebraSettings(invalid), /INVALID_SETTINGS/);
});

test("task sanitization rebuilds copy and rejects forged levels, expressions, signs and IDs", () => {
  const sheet = generateAlgebraWorksheet({ ...defaults, taskCount: 2, includeSquares: false, includeParentheses: false });
  const forged = sanitizeAlgebraWorksheet({ ...sheet, title: "forged", instructions: "forged", tasks: sheet.tasks.map(t => ({ ...t, answer: "wrong" })) }); assert.deepEqual(forged, sheet);
  for (const changes of [{ id: "<script>" }, { type: "mixed" }, { expression: "a+x" }, { expression: "a-a" }, { expression: "13a+a" }, { expression: "a²+a²" }, { expression: "2(a+b)" }, { expression: "2*3*a+a" }]) assert.equal(sanitizeAlgebraWorksheet({ ...sheet, tasks: [{ ...sheet.tasks[0], ...changes }, sheet.tasks[1]] }), null);
  for (const changes of [{ kind: "fraction" }, { version: 2 }, { tasks: [] }, { tasks: [sheet.tasks[0], sheet.tasks[0]] }]) assert.equal(sanitizeAlgebraWorksheet({ ...sheet, ...changes }), null);
  for (const level of ["products", "mixed"] as const) { const s = generateAlgebraWorksheet({ ...defaults, level, taskCount: 1 }); assert.equal(sanitizeAlgebraWorksheet({ ...s, tasks: [{ ...s.tasks[0], expression: "a+b" }] }), null); }
});

test("all levels terminate at the smallest range and include instructive unlike-term and zero cases", () => {
  for (const level of ALGEBRA_LEVELS) for (const allowNegative of [false, true]) {
    const sheet = generateAlgebraWorksheet({ ...defaults, level, allowNegative, maxCoefficient: 2, taskCount: 60 }, "nb", true, () => 0);
    assert.equal(sheet.tasks.length, 60); assert.ok(sanitizeAlgebraWorksheet(sheet));
    if (level === "collect") { assert.ok(sheet.tasks.some(t => parseAlgebraExpression(t.expression)?.isSimplified)); if (allowNegative) assert.ok(sheet.tasks.some(t => algebraTaskAnswer(t) === "0")); }
  }
});

test("Space snapshots and saved settings select algebra instead of fraction or geometry", () => {
  const sheet = generateAlgebraWorksheet({ ...defaults, level: "mixed", allowNegative: true, maxCoefficient: 12, taskCount: 8, showSupport: true }, "pt", true);
  const assignment = { mathWorksheet: sheet, mathType: "algebra", contentType: "algebra_worksheet" };
  assert.equal(hasSnapshotContent(assignment), true); assert.equal(hasAssignmentSnapshotContent(assignment), true);
  const lesson = assignmentToLesson(assignment), derived = getAssignmentDerivedState(lesson, assignment);
  assert.deepEqual(derived.algebraWorksheet, sheet); assert.equal(derived.isAlgebraAssignment, true); assert.equal(derived.isGeometryAssignment, false); assert.equal(derived.isFractionAssignment, false); assert.equal(derived.isArithmeticAssignment, false);
  assert.deepEqual(assignmentSnapshotToLesson(assignment).mathWorksheet, sheet); assert.equal(isFractionWorksheet(sheet), false); assert.equal(studentFractionGuard(sheet), false);
  const auto = gradeAlgebraWorksheet(sheet, Object.fromEntries(sheet.tasks.map(t => [t.id, algebraTaskAnswer(t)]))); assert.deepEqual(readAutoGrade({ auto }), auto);
  assert.equal(mathEditorHref("pt", "saved/1", "algebra"), "/pt/producer/math/algebra?edit=saved%2F1");
});

test("student fields and symbol buttons are named and no key or feedback leaks before checking", () => {
  const sheet = generateAlgebraWorksheet({ ...defaults, level: "mixed", taskCount: 3 }, "nb", true);
  const $ = load(renderToStaticMarkup(<View worksheet={sheet} />)); assert.equal($("input[aria-label]").length, 3); assert.equal($("button[aria-label]").length, 24); assert.equal($(".length-key").length, 0); assert.equal($(".length-result").length, 0); assert.equal(new Set($("input").map((_, el) => $(el).attr("id")).get()).size, 3);
  const answers = Object.fromEntries(sheet.tasks.map(t => [t.id, { value: algebraTaskAnswer(t) }])); const checked = load(renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={answers} readOnly showAutoCheck />));
  assert.equal(checked("input[readonly]").length, 3); assert.equal(checked("button").length, 0); assert.equal(checked(".length-correct").length, 3); assert.match(checked(".length-summary").text(), /100%/);
});

test("unfinished answers get explanatory feedback only after explicit checking", () => {
  const sheet = generateAlgebraWorksheet({ ...defaults, level: "mixed", taskCount: 1 });
  const $ = load(renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={{ [sheet.tasks[0].id]: { value: sheet.tasks[0].expression } }} readOnly showAutoCheck />));
  assert.match($(".length-result").text(), /riktig verdi.*ikke ferdig forenklet/);
});

test("paper keeps two columns with blank spaces and a separate optional key", () => {
  assert.equal(defaults.taskCount, 20);
  for (const showSupport of [false, true]) {
    const sheet = generateAlgebraWorksheet({ ...defaults, level: "mixed", taskCount: 17, showSupport }, "pt", true), perPage = showSupport ? 12 : 16;
    const $ = load(renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={Object.fromEntries(sheet.tasks.map(t => [t.id, algebraTaskAnswer(t)]))} printMode />));
    assert.equal($(".length-page").length, Math.ceil(17 / perPage)); assert.equal($(".length-page").first().find(".algebra-task").length, perPage); assert.equal($("input, button, output").length, 0); assert.equal($(".algebra-answer-space").length, 17); assert.equal($(".length-identity").length, 1); assert.equal($(".length-key > div").length, 17);
    assert.deepEqual($(".length-number").map((_, el) => $(el).text()).get(), Array.from({ length: 17 }, (_, i) => String(i + 1)));
    const noKey = load(renderToStaticMarkup(<View worksheet={{ ...sheet, showAnswerKey: false }} printMode />)); assert.equal(noKey(".length-key").length, 0);
  }
});

test("generation API rejects invalid JSON and settings", async () => {
  for (const body of ["{", "null", "[]", "{}", JSON.stringify({ settings: { ...defaults, maxCoefficient: 99 } })]) assert.equal((await POST(new Request("http://localhost/api/generate-algebra-worksheet", { method: "POST", body }))).status, 400);
});

test("generation API supports every level, language and sign choice", async () => {
  for (const level of ALGEBRA_LEVELS) for (const language of ["nb", "en", "pt"]) for (const allowNegative of [false, true]) {
    const settings = { ...defaults, level, allowNegative, showSupport: true };
    const response = await POST(new Request("http://localhost/api/generate-algebra-worksheet", { method: "POST", body: JSON.stringify({ settings, language, showAnswerKey: true }) })); assert.equal(response.status, 200);
    const data = await response.json(); assert.deepEqual(data.worksheet.settings, settings); assert.equal(data.worksheet.language, language); assert.equal(data.worksheet.showAnswerKey, true); assert.ok(sanitizeAlgebraWorksheet(data.worksheet));
  }
});

test("square and parentheses choices appear in every level and persist in snapshots", () => {
  for (const level of ALGEBRA_LEVELS) for (const includeSquares of [false, true]) for (const includeParentheses of [false, true]) {
    const settings = { ...defaults, level, includeSquares, includeParentheses, taskCount: 12 };
    const sheet = generateAlgebraWorksheet(settings);
    assert.deepEqual(sanitizeAlgebraWorksheet(JSON.parse(JSON.stringify(sheet)))?.settings, settings);
    assert.equal(sheet.tasks.some(t => t.expression.includes("²")), includeSquares);
    assert.equal(sheet.tasks.some(t => t.expression.includes("(")), includeParentheses);
    assert.ok(sheet.tasks.every(t => gradeAlgebraTask(t, algebraTaskAnswer(t)).isCorrect));
  }
});

test("old saved worksheets keep their original tasks and default new options to false", () => {
  const sheet = generateAlgebraWorksheet({ ...defaults, level: "mixed", taskCount: 8, includeSquares: false, includeParentheses: false });
  const { includeSquares: _squares, includeParentheses: _parentheses, ...legacySettings } = sheet.settings;
  assert.equal(_squares, false); assert.equal(_parentheses, false);
  const restored = sanitizeAlgebraWorksheet({ ...sheet, settings: legacySettings });
  assert.deepEqual(restored, sheet);
  for (const value of [null, 1, "yes"]) {
    assert.throws(() => normalizeAlgebraSettings({ ...defaults, includeSquares: value }), /INVALID_SETTINGS/);
    assert.throws(() => normalizeAlgebraSettings({ ...defaults, includeParentheses: value }), /INVALID_SETTINGS/);
  }
});

test("parentheses require distribution and correct signs before full credit", () => {
  for (const [expression, answer] of [["2(a+b)+3a+b", "5a+3b"], ["2(a²+b)+3a²+b", "5a²+3b"], ["3a-(a+2b)", "2a-2b"], ["3a-(b+2)", "3a-b-2"], ["-2(a²-b)+a²", "-a²+2b"], ["2a²-(a²+b²)+b²", "a²"], ["2*(3*b²)", "6b²"]]) {
    assert.equal(gradeAlgebraTask(task(expression), answer).points, 1, expression);
    assert.equal(gradeAlgebraTask(task(expression), expression).points, .5, expression);
  }
  assert.equal(gradeAlgebraTask(task("3a-(a+2b)"), "2a+2b").points, .25);
  assert.equal(gradeAlgebraTask(task("2(a²+b)+3a²+b"), "5a+3b").isCorrect, false);
});

test("source validation enforces square and parentheses options and degree limits", () => {
  const sheet = generateAlgebraWorksheet({ ...defaults, level: "mixed", taskCount: 1 });
  assert.equal(sanitizeAlgebraWorksheet({ ...sheet, settings: { ...sheet.settings, includeParentheses: false } }), null);
  assert.equal(sanitizeAlgebraWorksheet({ ...sheet, settings: { ...sheet.settings, includeSquares: false } }), null);
  for (const expression of ["2(a³+b)+a³", "2(a²b+b)+a²b", "2(a²+b²)*a+a", "2(a^2+b)+a^2", "2(a²+b)+99a²"]) assert.equal(sanitizeAlgebraWorksheet({ ...sheet, tasks: [{ ...sheet.tasks[0], expression }] }), null);
});
