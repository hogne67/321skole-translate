import assert from "node:assert/strict";
import test from "node:test";
import { resolveC2GenerationSource } from "./c2GenerationSource";
import { validC2 } from "./c2Review.fixtures";
import { readingTaskQualityError, type GeneratedReadingTasks } from "./generationValidation";

function encodedFixture() {
  const segmenter = new Intl.Segmenter(undefined, {granularity: "sentence"});
  const sourceParagraphs = validC2.text.split("\n\n").map(paragraph => [...segmenter.segment(paragraph)].map(item => item.segment.trim()));
  const source = new Map<string, string>();
  sourceParagraphs.forEach((sentences, p) => sentences.forEach((sentence, i) => source.set(sentence, `p${p + 1}s${i + 1}`)));
  const tasks = structuredClone(validC2.tasks);
  for (const task of tasks.mcq) task.evidence = task.evidence!.map(quote => source.get(quote)!);
  tasks.bestSummary.optionEvidence = tasks.bestSummary.optionEvidence!.map(evidence => evidence.map(quote => source.get(quote)!));
  return {title: "Prøve", sourceParagraphs, tasks};
}

test("C2 source references resolve to exact text while the public task shape remains intact", () => {
  const input = encodedFixture();
  const result = resolveC2GenerationSource(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.text, validC2.text);
  assert.deepEqual(result.value.tasks, validC2.tasks);
  assert.equal(result.value.sourceParagraphs, undefined);
  assert.equal(readingTaskQualityError("C2", result.value.tasks as GeneratedReadingTasks, result.value.text as string), null);
  assert.equal(input.tasks.mcq[0].evidence![0], "p4s1");
});

test("the sentence source is authoritative if a redundant freehand text field disagrees", () => {
  const result = resolveC2GenerationSource({...encodedFixture(), text: "This is not the actual source."});
  assert.equal(result.ok && result.value.text, validC2.text);
});

test("existing plain-text output still uses the original exact-quote checks", () => {
  const result = resolveC2GenerationSource(validC2);
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.value === validC2);
});

test("unknown, missing or paraphrased source references cannot masquerade as evidence", () => {
  for (const evidence of [["p9s1"], [], ["An approximate quotation..."], ["p1s99"]]) {
    const input = encodedFixture(); input.tasks.mcq[0].evidence = evidence;
    const result = resolveC2GenerationSource(input);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /evidence|reference/);
  }
});

test("malformed paragraphs and summary references fail before semantic review", () => {
  for (const sourceParagraphs of [[], [["A sentence"]], [["A"], [], ["B"], ["C"]], [["First\nSecond"], ["B"], ["C"], ["D"]]]) {
    assert.equal(resolveC2GenerationSource({...encodedFixture(), sourceParagraphs}).ok, false);
  }
  const input = encodedFixture(); input.tasks.bestSummary.optionEvidence = [["p1s1"]];
  assert.equal(resolveC2GenerationSource(input).ok, false);
});

test("duplicate references remain duplicate clues and fail the established quality checks", () => {
  const input = encodedFixture(); input.tasks.mcq[2].evidence = ["p1s2", "p1s2"];
  const result = resolveC2GenerationSource(input);
  assert.ok(result.ok);
  assert.match(readingTaskQualityError("C2", result.value.tasks as GeneratedReadingTasks, result.value.text as string)!, /two distinct/);
});
