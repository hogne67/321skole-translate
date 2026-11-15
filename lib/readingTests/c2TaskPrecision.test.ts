import assert from "node:assert/strict";
import test from "node:test";
import { evaluateC2TaskPrecision, reviewC2TaskPrecision } from "./c2TaskPrecision";
import { validC2 } from "./c2Review.fixtures";

const segmenter = new Intl.Segmenter(undefined, {granularity: "sentence"});
const sentences = validC2.text.split("\n\n").flatMap((paragraph, i) => [...segmenter.segment(paragraph)].map(item => ({paragraph: i + 1, text: item.segment.trim()}))).map((sentence, i) => ({...sentence, id: `s${i + 1}`}));
function passingReview() {
  return {checks: validC2.tasks.mcq.flatMap((task, i) => [0, 2, 3].includes(i) ? [{
    taskId: `mcq_${i + 1}`, question: task.prompt, explanation: "The actual question needs these text clues to select the key.",
    evidence: task.evidence!.map(quote => sentences.find(sentence => sentence.text === quote)!.id),
    oneSentenceSufficient: i === 3, dictionaryMeaningSufficient: false, explicitOpinionSufficient: false,
  }] : [])};
}

test("the C2 precision audit accepts contextual operations with actual minimal source clues", () => {
  assert.deepEqual(evaluateC2TaskPrecision(validC2, sentences, passingReview()), {accepted: true, issues: []});
});

test("a stated opinion cannot pass as implied stance even with two decorative citations", () => {
  const r = passingReview(); r.checks[0].explicitOpinionSufficient = true;
  const result = evaluateC2TaskPrecision(validC2, sentences, r);
  assert.equal(result.accepted, false);
  assert.ok(result.issues.some(issue => issue.includes("mcq_1")));
});

test("a word-choice nuance can depend on one clear contextual sentence", () => {
  const r = passingReview(); r.checks[2].oneSentenceSufficient = true;
  assert.equal(evaluateC2TaskPrecision(validC2, sentences, r).accepted, true);
});

test("a dictionary meaning fails even when a task is labelled contextual", () => {
  const r = passingReview(); r.checks[2].dictionaryMeaningSufficient = true;
  assert.equal(evaluateC2TaskPrecision(validC2, sentences, r).accepted, false);
});

test("synthesis requires two independently needed clues, not a one-sentence answer", () => {
  const r = passingReview(); r.checks[1].oneSentenceSufficient = true;
  assert.equal(evaluateC2TaskPrecision(validC2, sentences, r).accepted, false);
  r.checks[1].oneSentenceSufficient = false; r.checks[1].evidence = [r.checks[1].evidence[0]];
  assert.equal(evaluateC2TaskPrecision(validC2, sentences, r).accepted, false);
});

test("precision reports fail closed on missing tasks, invented questions or fake citations", () => {
  const missing = passingReview(); missing.checks.pop();
  assert.equal(evaluateC2TaskPrecision(validC2, sentences, missing).accepted, false);
  const duplicate = passingReview(); duplicate.checks[2].taskId = "mcq_1";
  assert.equal(evaluateC2TaskPrecision(validC2, sentences, duplicate).accepted, false);
  const invented = passingReview(); invented.checks[0].question = "A different question";
  assert.equal(evaluateC2TaskPrecision(validC2, sentences, invented).accepted, false);
  const fake = passingReview(); fake.checks[0].evidence = ["s999"];
  assert.equal(evaluateC2TaskPrecision(validC2, sentences, fake).accepted, false);
});

test("the precision request hides the assigned skills, generator evidence and other review", async () => {
  const result = await reviewC2TaskPrecision(validC2, sentences, "gpt-5", async request => {
    const input = request.input as {role: string; content: string}[];
    const data = JSON.parse(input[1].content);
    assert.equal(data.tasks.length, 3);
    assert.equal(data.tasks[0].skill, undefined);
    assert.equal(data.tasks[0].evidence, undefined);
    assert.equal(data.requiredTargets, undefined);
    assert.equal(data.bestSummary, undefined);
    assert.equal(request.store, false);
    return {output_text: JSON.stringify(passingReview()), status: "completed"};
  });
  assert.equal(result.accepted, true);
});

test("incomplete and malformed precision responses cannot approve a C2 test", async () => {
  for (const response of [{output_text: JSON.stringify(passingReview()), status: "incomplete"}, {output_text: "invalid", status: "completed"}]) {
    const result = await reviewC2TaskPrecision(validC2, sentences, "gpt-5", async () => response);
    assert.equal(result.accepted, false);
  }
});
