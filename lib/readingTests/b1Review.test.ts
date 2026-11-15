import assert from "node:assert/strict";
import test from "node:test";
import { evaluateReadingReview, reviewB1ReadingTest } from "./semanticReview";
import { readingTaskQualityError } from "./generationValidation";
import { validB1, b1Quotes as q, b1ReviewCases } from "./b1Review.fixtures";

function passingReview() {
  const facts = ["A visitor can bring a book", "Amir's reason is access after work", "Lina wants a trial before permanent opening", "Lina arrives after the author event starts", "Only Thursdays are covered", "The room is free after seventeen", "Admission is free"];
  const evidence = [[q.books], [q.argument], [q.attitude], [q.meeting, q.work, q.travel], [q.days], [q.room], [q.free]];
  return {
    taskChecks: facts.map((assessedFact, i) => ({ taskId: i < 4 ? `mcq_${i + 1}` : `true_false_${i - 3}`, assessedFact, keyIsCorrect: true, keyIsUnambiguous: true, distractorsPlausible: true, explanation: "The answer is supported by the supplied text.", evidence: evidence[i] })),
    repeatedFacts: [] as { taskIds: string[]; fact: string; explanation: string }[],
    argumentCheck: { taskId: "mcq_2", requiresArgumentUnderstanding: true, linksReasonToPosition: true, attributionCorrect: true, duplicatesOtherFact: false, explanation: "Amir supports opening because it allows access after work.", evidence: [q.argument] },
    attitudeCheck: { taskId: "mcq_3", requiresAttitudeUnderstanding: true, attitudeSupported: true, holderCorrect: true, certaintyPreserved: true, explanation: "Lina supports a trial, not an immediate permanent change.", evidence: [q.attitude] },
    inferenceCheck: { taskId: "mcq_4", requiresInference: true, requiresBothPieces: true, conclusionExplicitlyStated: false, needsOutsideKnowledge: false, explanation: "Her work ends at eighteen and travel takes thirty minutes, while the event starts at eighteen.", evidence: [q.work, q.travel, q.meeting] },
    scopeCheck: { appropriateB1: true, simpleInstructions: true, explanation: "The topic, opinions and practical consequence are straightforward and clearly signalled." },
    summaryOptions: validB1.tasks.bestSummary.optionEvidence!.map((evidence, i) => ({ optionIndex: i, scope: i === 0 ? "accurate_whole_text" : "accurate_detail", explanation: "This option is accurate with the stated scope.", evidence })),
  };
}

test("B1 accepts four distinct reading targets and three simple true/false tasks", () => {
  assert.equal(validB1.text.split(/\s+/).length <= 220, true);
  assert.equal(validB1.text.split(/\s+/).length >= 150, true);
  assert.equal(readingTaskQualityError("B1", validB1.tasks, validB1.text), null);
  assert.deepEqual(evaluateReadingReview(validB1, passingReview(), "B1"), { accepted: true, issues: [] });
});

test("B1 requires argument, attitude and inference coverage with actual evidence", () => {
  const t = structuredClone(validB1);
  t.tasks.mcq[1].skill = "find_information";
  assert.match(readingTaskQualityError("B1", t.tasks, t.text)!, /understand_argument/);
  t.tasks.mcq[1].skill = "understand_argument";
  t.tasks.mcq[3].evidence = [q.travel];
  assert.match(readingTaskQualityError("B1", t.tasks, t.text)!, /two distinct/);
});

test("B1 rejects wrong paragraph structure, unmixed statements and unsupported summaries", () => {
  const t = structuredClone(validB1);
  assert.match(readingTaskQualityError("B1", t.tasks, t.text.replaceAll("\n\n", " "))!, /three coherent paragraphs/);
  t.tasks.trueFalse.forEach(task => { task.correctAnswer = true; });
  assert.match(readingTaskQualityError("B1", t.tasks, t.text)!, /both true and false/);
  t.tasks.trueFalse = structuredClone(validB1.tasks.trueFalse);
  t.tasks.bestSummary.optionEvidence![2] = ["Lina er sikker på at alle støtter planen."];
  assert.match(readingTaskQualityError("B1", t.tasks, t.text)!, /actual text evidence/);
});

test("a fact lookup labelled as an argument and an incorrectly attributed reason fail", () => {
  for (const flag of ["requiresArgumentUnderstanding", "linksReasonToPosition", "attributionCorrect"] as const) {
    const review = passingReview(); review.argumentCheck[flag] = false;
    assert.ok(evaluateReadingReview(validB1, review, "B1").issues.some(issue => /B1 argument/.test(issue)));
  }
});

test("attitude checks preserve the person, conditions and degree of certainty", () => {
  for (const flag of ["requiresAttitudeUnderstanding", "attitudeSupported", "holderCorrect", "certaintyPreserved"] as const) {
    const review = passingReview(); review.attitudeCheck[flag] = false;
    assert.ok(evaluateReadingReview(validB1, review, "B1").issues.some(issue => /B1 attitude/.test(issue)));
  }
});

test("inference checks reject direct retrieval, missing clues and outside assumptions", () => {
  for (const flag of ["requiresInference", "requiresBothPieces", "conclusionExplicitlyStated", "needsOutsideKnowledge"] as const) {
    const review = passingReview(); review.inferenceCheck[flag] = !review.inferenceCheck[flag];
    assert.ok(evaluateReadingReview(validB1, review, "B1").issues.some(issue => /B1 inference/.test(issue)));
  }
  const review = passingReview(); review.inferenceCheck.evidence = [q.travel, q.travel];
  assert.equal(evaluateReadingReview(validB1, review, "B1").accepted, false);
});

test("B1 also checks repeated facts, summary accuracy and simple instructions", () => {
  const repeated = passingReview();
  repeated.repeatedFacts = [{ taskIds: ["mcq_2", "true_false_1"], fact: "Same argument", explanation: "One task restates the answer to another." }];
  assert.equal(evaluateReadingReview(validB1, repeated, "B1").accepted, false);
  const summary = passingReview(); summary.summaryOptions[2].scope = "unsupported";
  assert.equal(evaluateReadingReview(validB1, summary, "B1").accepted, false);
  for (const flag of ["appropriateB1", "simpleInstructions"] as const) {
    const review = passingReview(); review.scopeCheck[flag] = false;
    assert.equal(evaluateReadingReview(validB1, review, "B1").accepted, false);
  }
});

test("all seven tasks and all B1 target checks must be present exactly once", () => {
  const review = passingReview(); review.taskChecks.pop();
  assert.equal(evaluateReadingReview(validB1, review, "B1").accepted, false);
  assert.equal(evaluateReadingReview(validB1, { ...passingReview(), attitudeCheck: null }, "B1").accepted, false);
  assert.equal(evaluateReadingReview(validB1, { ...passingReview(), inferenceCheck: { ...passingReview().inferenceCheck, taskId: "mcq_5" } }, "B1").accepted, false);
});

test("B1 uses seven task IDs and its own review schema without exposing generated skill labels", async () => {
  const result = await reviewB1ReadingTest(validB1, "model", async request => {
    const input = request.input as { role: string; content: string }[];
    const data = JSON.parse(input[1].content);
    assert.equal(data.tasks.length, 7);
    assert.equal(data.tasks[3].taskId, "mcq_4");
    assert.equal(data.tasks[6].taskId, "true_false_3");
    assert.equal(data.tasks[1].skill, undefined);
    assert.equal(data.tasks[1].evidence, undefined);
    assert.match(input[0].content, /B1/);
    const review = passingReview();
    const useIds = (check: { evidence: string[] }) => {
      check.evidence = check.evidence.map(quote => data.sentences.find((sentence: { text: string }) => sentence.text === quote)?.id ?? "missing");
    };
    review.taskChecks.forEach(useIds); review.summaryOptions.forEach(useIds);
    [review.argumentCheck, review.attitudeCheck, review.inferenceCheck].forEach(useIds);
    return { output_text: JSON.stringify(review), status: "completed" };
  });
  assert.equal(result.accepted, true);
});

test("the live regression fixtures preserve structural validity while isolating meaning errors", () => {
  for (const item of b1ReviewCases()) assert.equal(readingTaskQualityError("B1", item.candidate.tasks, item.candidate.text), null, item.name);
});
