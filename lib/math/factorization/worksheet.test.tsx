import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { DEFAULT_FACTORIZATION_SETTINGS as defaults, FACTORIZATION_MAXIMUMS, FACTORIZATION_MODES, FACTORIZATION_TASK_TYPES, canonicalFactorTree, factorPairs, factorTreeLayout, factorTreePaths, factorizationTaskAnswer, factorizationTaskPrompt, formatPrimeFactors, generateFactorizationWorksheet, gradeFactorizationTask, gradeFactorizationWorksheet, isPrime, normalizeFactorizationSettings, parseFactorProduct, parseFactorizationInteger, primeFactors, readFactorizationAnswer, removeFactorTreeBranch, sanitizeFactorizationWorksheet, splitFactorTree, type FactorizationAnswer, type FactorizationTask } from "./worksheet";
import { POST } from "@/app/api/generate-factorization-worksheet/route";
import { getAssignmentDerivedState } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/assignmentDerivedState";
import { assignmentToLesson, hasSnapshotContent } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/helpers";
import { assignmentSnapshotToLesson, hasAssignmentSnapshotContent, isFractionWorksheet, isMathWorksheet, readAutoGrade } from "@/lib/submissions/readers";
import { isFractionWorksheet as studentFractionGuard } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/worksheetTypeGuards";
import { mathEditorHref } from "../editor";

const require = createRequire(import.meta.url);
require.extensions[".css"] = () => {};
const View = require("../../../components/generators/math/factorization/FactorizationWorksheetView").default as typeof import("@/components/generators/math/factorization/FactorizationWorksheetView").default;
const answerFor = (task: FactorizationTask, settings = defaults): FactorizationAnswer => ({ value: factorizationTaskAnswer(task, settings), pairs: factorPairs(task.number).map(([left, right]) => ({ left: String(left), right: String(right) })), nodes: canonicalFactorTree(task.number) });
const task = (type: FactorizationTask["type"], number = 72, givenFactor: number | null = null): FactorizationTask => ({ id: "test", type, number, givenFactor });

for (const taskType of FACTORIZATION_MODES) test(`${taskType}: every range, support option and answer-key format generates exact, restorable and gradable tasks`, () => {
  for (const maximum of FACTORIZATION_MAXIMUMS) for (const showSupport of [false, true]) for (const showPowers of [false, true]) {
    const sheet = generateFactorizationWorksheet({ ...defaults, taskType, maximum, showSupport, showPowers, taskCount: 13 }, "pt", true);
    assert.deepEqual(sanitizeFactorizationWorksheet(JSON.parse(JSON.stringify(sheet))), sheet);
    assert.equal(new Set(sheet.tasks.map(t => t.id)).size, 13);
    for (const t of sheet.tasks) {
      assert.ok(t.number >= 2 && t.number <= maximum);
      if (t.type !== "factor_pairs") assert.equal(isPrime(t.number), false);
      if (t.type === "missing_factor") assert.ok(t.givenFactor! > 1 && t.givenFactor! < t.number && t.number % t.givenFactor! === 0);
      for (const language of ["nb", "en", "pt"]) assert.doesNotMatch(factorizationTaskPrompt(t, language), /undefined|NaN|\{/);
      assert.equal(gradeFactorizationTask(t, answerFor(t, sheet.settings), sheet.settings).points, 1);
    }
    assert.equal(gradeFactorizationWorksheet(sheet, Object.fromEntries(sheet.tasks.map(t => [t.id, answerFor(t, sheet.settings)]))).percentAuto, 100);
    if (taskType === "mixed") { const counts = FACTORIZATION_TASK_TYPES.map(type => sheet.tasks.filter(t => t.type === type).length); assert.ok(Math.max(...counts) - Math.min(...counts) <= 1); }
    else assert.ok(sheet.tasks.every(t => t.type === taskType));
  }
});

test("factor pairs and prime products are exact for every supported number, with square pairs counted once", () => {
  for (let n = 2; n <= 1000; n++) {
    const pairs = factorPairs(n), primes = primeFactors(n);
    assert.ok(pairs.every(([a, b]) => a <= b && a * b === n));
    assert.deepEqual(new Set(pairs.flat()), new Set(Array.from({ length: n }, (_, i) => i + 1).filter(d => n % d === 0)));
    assert.equal(primes.reduce((a, b) => a * b, 1), n); assert.ok(primes.every(isPrime));
    assert.equal(isPrime(n), pairs.length === 1);
    if (!isPrime(n)) assert.equal(gradeFactorizationTask(task("factor_tree", n), { nodes: canonicalFactorTree(n) }).points, 1);
  }
  assert.deepEqual(factorPairs(36), [[1, 36], [2, 18], [3, 12], [4, 9], [6, 6]]);
  assert.deepEqual(factorPairs(1), [[1, 1]]); assert.deepEqual(primeFactors(1), []); assert.equal(isPrime(1), false);
  for (const n of [0, -1, 1.5, Infinity, NaN, 1001]) { assert.deepEqual(factorPairs(n), []); assert.deepEqual(primeFactors(n), []); assert.equal(isPrime(n), false); }
});

test("generation uses finite pools without replacement and remains bounded for constant random sources", () => {
  for (const random of [() => 0, () => .4, () => .99999]) for (const taskType of FACTORIZATION_MODES) {
    const sheet = generateFactorizationWorksheet({ ...defaults, taskType, maximum: 20, taskCount: 60 }, "en", false, random);
    assert.equal(sheet.tasks.length, 60); assert.ok(sanitizeFactorizationWorksheet(sheet));
    if (taskType === "factor_pairs") assert.equal(new Set(sheet.tasks.slice(0, 19).map(t => t.number)).size, 19);
  }
});

test("product input accepts plain products, reordering, Unicode powers and keyboard powers, with bounded parsing", () => {
  assert.deepEqual(parseFactorProduct("3² × 2^3"), [3, 3, 2, 2, 2]);
  for (const value of ["2*2*2*3*3", "3x2x3x2x2", "3X3X2X2X2", "2·2·2·3·3", " 2^3 × 3^2 "]) assert.equal(gradeFactorizationTask(task("prime_factors"), { value }).points, 1);
  assert.deepEqual(parseFactorProduct("11²"), [11, 11]);
  for (const value of ["", "1×2", "0×2", "-2×3", "2.0×3", "2,0×3", "2^0", "2^-1", "2^10", "2^999999999", "2^(3)", "2e3", "2+2", "(2*3)", "2/3", "2×", "alert(1)", "2".repeat(241), Array(33).fill("2").join("*")]) assert.equal(parseFactorProduct(value), null);
  assert.equal(formatPrimeFactors(72), "2 × 2 × 2 × 3 × 3"); assert.equal(formatPrimeFactors(72, true), "2³ × 3²");
  assert.equal(formatPrimeFactors(512, true), "2⁹");
});

test("prime-factor grading requires correct multiplicities and penalises extra or composite factors", () => {
  const t = task("prime_factors");
  assert.equal(gradeFactorizationTask(t, { value: "72" }).points, 0);
  assert.equal(gradeFactorizationTask(t, { value: "8 × 9" }).points, 0);
  assert.equal(gradeFactorizationTask(t, { value: "2^3 × 9" }).points, 3 / 5);
  assert.equal(gradeFactorizationTask(t, { value: "2^4 × 3^2" }).points, 5 / 6);
  assert.equal(gradeFactorizationTask(t, { value: "2^3 × 3^2 × 1" }).points, 0);
  assert.equal(gradeFactorizationTask(t, { value: "2 × 3" }).isPartial, true);
  for (const value of [undefined, null, {}, { value: " " }]) assert.equal(gradeFactorizationTask(t, value).isAnswered, false);
  assert.equal(gradeFactorizationTask(t, { value: "bad" }).isAnswered, true);
});

test("all positive factor pairs include one and accept reversed rows and factors, but not duplicates", () => {
  const t = task("factor_pairs", 24), correct = answerFor(t);
  assert.equal(gradeFactorizationTask(t, { pairs: correct.pairs.toReversed().map(p => ({ left: p.right, right: p.left })) }).points, 1);
  assert.equal(gradeFactorizationTask(t, { pairs: [correct.pairs[0]] }).points, .25);
  assert.equal(gradeFactorizationTask(t, { pairs: [...correct.pairs, { left: "6", right: "4" }] }).points, .8);
  assert.equal(gradeFactorizationTask(t, { pairs: [...correct.pairs, { left: "", right: "" }] }).points, 1);
  assert.equal(gradeFactorizationTask(t, { pairs: [...correct.pairs.slice(1), { left: "-1", right: "-24" }] }).points, .75);
  assert.equal(gradeFactorizationTask(t, { pairs: [...correct.pairs, { left: 1, right: 24 }] }).points, 0);
  assert.equal(gradeFactorizationTask(t, { pairs: Array(33).fill(correct.pairs[0]) }).points, 0);
  assert.equal(gradeFactorizationTask(t, { pairs: [{ left: " ", right: "" }] }).isAnswered, false);
});

test("missing factors are positive exact whole numbers and blanks are not zero", () => {
  const t = task("missing_factor", 72, 8);
  for (const value of ["9", " 9 ", "009"]) assert.equal(gradeFactorizationTask(t, { value }).points, 1);
  for (const value of ["", "0", "-9", "9.0", "9,0", "9junk", "72/8", "9e0", "1001", "9".repeat(13)]) assert.equal(gradeFactorizationTask(t, { value }).points, 0);
  assert.equal(parseFactorizationInteger("0"), null); assert.equal(gradeFactorizationTask(t, { value: "0" }).isAnswered, true);
});

const alternativeTree = { r0: "8", r1: "9", r00: "2", r01: "4", r010: "2", r011: "2", r10: "3", r11: "3" };
test("different valid factor-tree shapes and branch orders all earn full credit", () => {
  const t = task("factor_tree");
  const trees = [alternativeTree, { r0: "6", r1: "12", r00: "2", r01: "3", r10: "3", r11: "4", r110: "2", r111: "2" }, canonicalFactorTree(72)];
  for (const nodes of trees) {
    assert.equal(gradeFactorizationTask(t, { nodes }).points, 1);
    const reversed = Object.fromEntries(Object.entries(nodes).map(([key, value]) => ["r" + key.slice(1).replace(/[01]/g, digit => digit === "0" ? "1" : "0"), value]));
    assert.equal(gradeFactorizationTask(t, { nodes: reversed }).points, 1);
  }
});

test("tree credit follows correct paths from the fixed root and requires prime leaves, never ones", () => {
  const t = task("factor_tree");
  const partial = gradeFactorizationTask(t, { nodes: { r0: "2", r1: "36" } });
  assert.equal(partial.points, 2 / 9); assert.equal(partial.isPartial, true);
  assert.equal(gradeFactorizationTask(t, { nodes: { r0: "8", r1: "8" } }).points, 0);
  assert.equal(gradeFactorizationTask(t, { nodes: { r0: "1", r1: "72" } }).points, 0);
  assert.equal(gradeFactorizationTask(task("factor_tree", 12), { nodes: { r0: "3", r1: "4", r10: "2", r11: "3" } }).points, 2 / 5);
  assert.equal(gradeFactorizationTask(t, { nodes: { ...alternativeTree, r: "72" } }).points, 0);
  assert.equal(gradeFactorizationTask(t, { nodes: { ...alternativeTree, r111111: "2" } }).points, 0);
  assert.equal(gradeFactorizationTask(t, { nodes: { r0: "", r1: "" } }).isAnswered, false);
  const forged = JSON.parse('{"__proto__":"2","r0":"8","r1":"9"}');
  assert.equal(gradeFactorizationTask(t, { nodes: forged }).points, 0);
  assert.equal(Object.hasOwn(readFactorizationAnswer({ nodes: forged }).nodes, "__proto__"), false);
});

test("students can extend and remove branches up to the deepest valid chain, without orphan nodes", () => {
  let nodes: Record<string, string> = { r0: "2", r1: "256" }, path = "r1", remaining = 256;
  while (remaining > 2) { nodes = splitFactorTree(nodes, path); nodes[path + "0"] = "2"; nodes[path + "1"] = String(remaining / 2); path += "1"; remaining /= 2; }
  assert.equal(path.length, 9); assert.equal(gradeFactorizationTask(task("factor_tree", 512), { nodes }).points, 1);
  assert.equal(splitFactorTree(nodes, path), nodes);
  assert.equal(splitFactorTree(nodes, "r000000"), nodes);
  const removed = removeFactorTreeBranch(nodes, "r1"); assert.deepEqual(removed, { r0: "2", r1: "256" });
  assert.equal(gradeFactorizationTask(task("factor_tree", 512), { nodes: removed }).isPartial, true);
  const saturated = Object.fromEntries(Array.from({ length: 24 }, (_, i) => ["r" + i.toString(2).padStart(5, "0"), "2"]));
  assert.equal(splitFactorTree(saturated, Object.keys(saturated)[0]), saturated);
});

test("tree layout stays within bounds and connects each child to a higher parent for every composite", () => {
  for (let n = 4; n <= 1000; n++) if (!isPrime(n)) {
    const nodes = canonicalFactorTree(n), layout = factorTreeLayout(nodes), byPath = new Map(layout.points.map(p => [p.path, p]));
    assert.equal(layout.points.length, 2 * primeFactors(n).length - 1);
    assert.equal(new Set(layout.points.map(p => p.path)).size, layout.points.length);
    for (const p of layout.points) {
      assert.ok(p.x >= 20 && p.x <= layout.width - 20 && p.y >= 20 && p.y <= layout.height - 20);
      if (p.path !== "r") assert.ok(byPath.get(p.path.slice(0, -1))!.y < p.y);
    }
    assert.equal(factorTreePaths(nodes).length, layout.points.length);
  }
});

test("sanitisation rebuilds titles and answers and rejects forged factors, duplicate IDs and impossible modes", () => {
  for (const patch of [{ taskType: "algebra" }, { maximum: 21 }, { maximum: "100" }, { taskCount: 0 }, { taskCount: 61 }, { taskCount: 1.5 }, { showSupport: "yes" }, { showPowers: "yes" }]) assert.throws(() => normalizeFactorizationSettings({ ...defaults, ...patch }), /INVALID_/);
  const sheet = generateFactorizationWorksheet({ ...defaults, taskType: "missing_factor", taskCount: 2 });
  assert.deepEqual(sanitizeFactorizationWorksheet({ ...sheet, title: "fake", instructions: "fake", tasks: sheet.tasks.map(t => ({ ...t, answer: "fake", nodes: { r0: "fake" } })) }), sheet);
  for (const patch of [{ id: "bad/id" }, { id: sheet.tasks[1].id }, { number: 1 }, { number: 101 }, { number: 7 }, { number: "12" }, { number: 12.5 }, { type: "factor_tree" }, { givenFactor: 1 }, { givenFactor: sheet.tasks[0].number }, { givenFactor: "2" }, { givenFactor: .5 }]) assert.equal(sanitizeFactorizationWorksheet({ ...sheet, tasks: [{ ...sheet.tasks[0], ...patch }, sheet.tasks[1]] }), null);
  assert.equal(sanitizeFactorizationWorksheet({ ...sheet, tasks: [] }), null); assert.equal(sanitizeFactorizationWorksheet({ ...sheet, version: 2 }), null);
});

test("Space snapshots and reopening preserve the exact tasks, tree answers, range and display options", () => {
  const worksheet = generateFactorizationWorksheet({ ...defaults, maximum: 1000, showSupport: true, showPowers: true, taskCount: 8 }, "pt", true);
  const assignment = { mathWorksheet: worksheet, mathType: "factorization", contentType: "factorization_worksheet" };
  assert.ok(hasSnapshotContent(assignment)); assert.ok(hasAssignmentSnapshotContent(assignment));
  const derived = getAssignmentDerivedState(assignmentToLesson(assignment), assignment);
  assert.deepEqual(derived.factorizationWorksheet, worksheet); assert.equal(derived.isFactorizationAssignment, true);
  assert.equal(derived.isGeometryAssignment, false); assert.equal(derived.isFractionAssignment, false); assert.equal(derived.isArithmeticAssignment, false);
  assert.equal(isFractionWorksheet(worksheet), false); assert.equal(studentFractionGuard(worksheet), false); assert.equal(isMathWorksheet(worksheet), false);
  assert.deepEqual(assignmentSnapshotToLesson(assignment).mathWorksheet, worksheet);
  const auto = gradeFactorizationWorksheet(worksheet, Object.fromEntries(worksheet.tasks.map(t => [t.id, answerFor(t, worksheet.settings)])));
  assert.equal(auto.percentAuto, 100); assert.deepEqual(readAutoGrade({ auto }), auto);
  assert.equal(mathEditorHref("pt", "saved/1", "factorization"), "/pt/producer/math/factorization?edit=saved%2F1");
});

test("student controls are named and blank, and no key, prime marking or feedback appears before checking", () => {
  for (const taskType of FACTORIZATION_TASK_TYPES) {
    const sheet = generateFactorizationWorksheet({ ...defaults, taskType, taskCount: 1 }, "nb", true), t = sheet.tasks[0];
    const $ = load(renderToStaticMarkup(<View worksheet={sheet} />));
    assert.ok($("input").length > 0); assert.ok($("input").toArray().every(el => $(el).attr("aria-label") && $(el).attr("value") === ""));
    assert.equal($(".length-key, .length-result, .factor-tree-prime").length, 0);
    if (taskType === "factor_tree") { assert.equal($(".factor-tree-field").length, 2); assert.equal($(".factor-tree-field button[disabled]").length, 2); }
    const teacher = load(renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={{ [t.id]: answerFor(t) }} readOnly showAutoCheck />));
    assert.equal(teacher("input:not([readonly])").length, 0); assert.equal(teacher(".length-correct").length, 1); assert.equal(teacher("button").length, 0);
  }
});

test("paper groups two tasks per page with blank factor pairs and drawing space, plus an optional worked tree key", () => {
  for (const taskType of FACTORIZATION_MODES) {
    const sheet = generateFactorizationWorksheet({ ...defaults, taskType, showSupport: true, showPowers: true, taskCount: 5 }, "en", true);
    const $ = load(renderToStaticMarkup(<View worksheet={sheet} answersByTaskId={Object.fromEntries(sheet.tasks.map(t => [t.id, answerFor(t)]))} printMode />));
    assert.equal($(".length-page").length, 3); assert.equal($(".factorization-task").length, 5); assert.equal($("input, button, .length-result").length, 0);
    assert.equal($(".length-key").length, 1); assert.equal($(".factorization-key-item").length, 5);
    assert.equal($(".factor-tree-paper-space").length, sheet.tasks.filter(t => t.type === "factor_tree").length);
    assert.equal($(".factorization-task .factor-tree-prime").length, 0);
    assert.equal(load(renderToStaticMarkup(<View worksheet={{ ...sheet, showAnswerKey: false }} printMode />))(".length-key").length, 0);
  }
});

test("generation API accepts all modes, ranges and languages and rejects malformed settings", async () => {
  for (const language of ["nb", "en", "pt"]) for (const taskType of FACTORIZATION_MODES) for (const maximum of FACTORIZATION_MAXIMUMS) {
    const response = await POST(new Request("http://localhost/api/generate-factorization-worksheet", { method: "POST", body: JSON.stringify({ settings: { ...defaults, taskType, maximum, showPowers: true }, language, showAnswerKey: true }) }));
    assert.equal(response.status, 200); const { worksheet } = await response.json(); assert.ok(sanitizeFactorizationWorksheet(worksheet)); assert.equal(worksheet.language, language); assert.equal(worksheet.showAnswerKey, true);
  }
  for (const body of ["{", "[]", "null", "{}", JSON.stringify({ settings: { ...defaults, taskCount: 100000 } })]) assert.equal((await POST(new Request("http://localhost/api/generate-factorization-worksheet", { method: "POST", body }))).status, 400);
});
