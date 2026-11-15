import assert from "node:assert/strict";
import test from "node:test";
import { readingTaskQualityError } from "./generationValidation";
import { evaluateReadingReview, reviewA2ReadingTest } from "./semanticReview";
import { revisedA2, revisedQuotes as q, tonjeRegression } from "./semanticReview.fixtures";

function passingReview() {
  return {
    taskChecks: [
      { taskId: "mcq_1", assessedFact: "Tonje finds her bag", keyIsCorrect: true, keyIsUnambiguous: true, distractorsPlausible: true, explanation: "The bag is explicitly named.", evidence: [q.bag] },
      { taskId: "mcq_2", assessedFact: "The shop's proximity explains walking", keyIsCorrect: true, keyIsUnambiguous: true, distractorsPlausible: true, explanation: "The explicit because-clause explains her means of travel.", evidence: [q.cause] },
      { taskId: "mcq_3", assessedFact: "Bread is the content of the separate bag served with salad", keyIsCorrect: true, keyIsUnambiguous: true, distractorsPlausible: true, explanation: "One sentence names the bag's contents and another says its contents are served with the meal.", evidence: [q.bagContents, q.meal] },
      { taskId: "true_false_1", assessedFact: "Tonje buys milk", keyIsCorrect: true, keyIsUnambiguous: true, distractorsPlausible: true, explanation: "Milk appears in the purchase list.", evidence: [q.purchases] },
      { taskId: "true_false_2", assessedFact: "The after-dinner plan is undecided", keyIsCorrect: true, keyIsUnambiguous: true, distractorsPlausible: true, explanation: "Maybe and the alternative activity contradict a definite decision.", evidence: [q.maybeFilm] },
    ],
    repeatedFacts: [] as { taskIds: string[]; fact: string; explanation: string }[],
    reasonCheck: { taskId: "mcq_2", causeExplicit: true, requiresCauseUnderstanding: true, duplicatesOtherFact: false, explanation: "The cause of walking is distinct from the other assessed information.", evidence: [q.cause] },
    connectionCheck: { taskId: "mcq_3", requiresBothPieces: true, singleSentenceSufficient: false, explanation: "The meal sentence does not name the bread; the earlier bag sentence is needed to resolve its reference.", evidence: [q.bagContents, q.meal] },
    summaryOptions: [
      { optionIndex: 0, scope: "accurate_whole_text", explanation: "Shopping and preparing the meal span the central situation.", evidence: [q.purchases, q.meal] },
      { optionIndex: 1, scope: "accurate_detail", explanation: "Getting ready is an accurate but narrow detail.", evidence: [q.bag] },
      { optionIndex: 2, scope: "accurate_detail", explanation: "Considering two later activities is accurate but peripheral.", evidence: [q.maybeFilm] },
    ],
  };
}

test("a complete independent review can accept distinct simple tasks and text-supported summaries", () => {
  assert.deepEqual(evaluateReadingReview(revisedA2, passingReview()), { accepted: true, issues: [] });
});

test("Tonje's regression passes quote/label validation but fails the independent content checks", () => {
  assert.equal(readingTaskQualityError("A2", tonjeRegression.tasks, tonjeRegression.text), null);
  const review = passingReview();
  review.taskChecks = review.taskChecks.map((check, i) => ({ ...check, evidence: [i === 2 || i === 4 ? tonjeRegression.tasks.mcq[2].evidence![1] : tonjeRegression.tasks.mcq[0].evidence![0]] }));
  review.repeatedFacts = [{ taskIds: ["mcq_1", "mcq_2", "true_false_1"], fact: "Tonje shops to buy food", explanation: "Three forms of the same information." }];
  review.reasonCheck.requiresCauseUnderstanding = false;
  review.reasonCheck.duplicatesOtherFact = true;
  review.reasonCheck.evidence = tonjeRegression.tasks.mcq[1].evidence!;
  review.connectionCheck.requiresBothPieces = false;
  review.connectionCheck.singleSentenceSufficient = true;
  review.connectionCheck.evidence = tonjeRegression.tasks.mcq[2].evidence!;
  review.summaryOptions[0].evidence = tonjeRegression.tasks.bestSummary.optionEvidence![0];
  review.summaryOptions[1] = { ...review.summaryOptions[1], scope: "unsupported", explanation: "Maybe watching a film does not establish a habit or liking films.", evidence: [q.maybeFilm] };
  review.summaryOptions[2] = { ...review.summaryOptions[2], scope: "unsupported", explanation: "Buying clothes is invented.", evidence: [q.purchases] };
  const result = evaluateReadingReview(tonjeRegression, review);
  assert.equal(result.accepted, false);
  for (const fragment of [/Repeated fact/, /Cause task/, /one sentence/, /Summary option 2/, /Summary option 3/]) assert.ok(result.issues.some(issue => fragment.test(issue)));
});

test("a why-question that merely repeats another tested fact is rejected", () => {
  const review = passingReview();
  review.reasonCheck.duplicatesOtherFact = true;
  const result = evaluateReadingReview(revisedA2, review);
  assert.equal(result.accepted, false);
  assert.ok(result.issues.some(issue => /Cause task/.test(issue)));
});

test("the cause answer cannot also be recycled as the factual lookup", () => {
  const review = passingReview();
  review.taskChecks[0].evidence = [q.cause];
  assert.ok(evaluateReadingReview(revisedA2, review).issues.some(issue => /reuse the same single sentence/.test(issue)));
});

test("two real quotes do not rescue a connection task answered by one sentence", () => {
  const review = passingReview();
  review.connectionCheck.singleSentenceSufficient = true;
  assert.equal(evaluateReadingReview(revisedA2, review).accepted, false);
});

test("the reviewer must classify actual skills rather than echo the generator's claims", () => {
  const review = passingReview();
  review.connectionCheck.taskId = "mcq_1";
  assert.ok(evaluateReadingReview(revisedA2, review).issues.some(issue => /Connection task/.test(issue)));
});

test("repeated canonical facts are rejected even if the duplicate group was omitted", () => {
  const review = passingReview();
  review.taskChecks[3].assessedFact = review.taskChecks[0].assessedFact;
  assert.ok(evaluateReadingReview(revisedA2, review).issues.some(issue => /Repeated fact/.test(issue)));
});

test("every summary must be supported and only the keyed one may cover the whole text", () => {
  for (const change of ["unsupported", "too_broad", "invented_evidence"] as const) {
    const review = passingReview();
    if (change === "unsupported") review.summaryOptions[2].scope = "unsupported";
    if (change === "too_broad") review.summaryOptions[1].scope = "accurate_whole_text";
    if (change === "invented_evidence") review.summaryOptions[1].evidence = ["Tonje kjøper klær til hele familien."];
    assert.equal(evaluateReadingReview(revisedA2, review).accepted, false, change);
  }
});

test("missing, duplicate or malformed checks cannot approve a test", () => {
  for (const mutate of [
    (review: ReturnType<typeof passingReview>) => { review.taskChecks.pop(); },
    (review: ReturnType<typeof passingReview>) => { review.taskChecks[4] = review.taskChecks[0]; },
    (review: ReturnType<typeof passingReview>) => { review.summaryOptions.pop(); },
    (review: ReturnType<typeof passingReview>) => { review.summaryOptions[2] = review.summaryOptions[1]; },
    (review: ReturnType<typeof passingReview>) => { review.connectionCheck.explanation = ""; },
  ]) {
    const review = passingReview(); mutate(review);
    assert.equal(evaluateReadingReview(revisedA2, review).accepted, false);
  }
  for (const value of [null, { accepted: true }, { ...passingReview(), repeatedFacts: null }]) assert.equal(evaluateReadingReview(revisedA2, value).accepted, false);
});

test("the independent request omits generated labels/evidence and requires structured output", async () => {
  let calls = 0;
  const result = await reviewA2ReadingTest(revisedA2, "configured-model", async request => {
    calls += 1;
    const input = request.input as { role: string; content: string }[];
    const data = JSON.parse(input[1].content);
    assert.equal(data.tasks.length, 5);
    assert.equal(data.tasks[0].skill, undefined);
    assert.equal(data.tasks[0].evidence, undefined);
    assert.equal(data.bestSummary.optionEvidence, undefined);
    assert.ok(data.sentences.every((sentence: { id: string; text: string }) => /^s\d+$/.test(sentence.id) && revisedA2.text.includes(sentence.text)));
    assert.equal(request.store, false);
    assert.equal(request.text?.format?.type, "json_schema");
    const review = passingReview();
    const useIds = (check: { evidence: string[] }) => {
      check.evidence = check.evidence.map(quote => data.sentences.find((sentence: { text: string }) => sentence.text === quote)?.id ?? "missing");
    };
    review.taskChecks.forEach(useIds);
    review.summaryOptions.forEach(useIds);
    useIds(review.reasonCheck);
    useIds(review.connectionCheck);
    return { output_text: JSON.stringify(review), status: "completed" };
  });
  assert.equal(calls, 1);
  assert.equal(result.accepted, true);
});

test("unknown sentence IDs cannot be used as independent text evidence", async () => {
  const review = passingReview();
  review.taskChecks[0].evidence = ["s99999"];
  const result = await reviewA2ReadingTest(revisedA2, "model", async () => ({ output_text: JSON.stringify(review) }));
  assert.equal(result.accepted, false);
});

test("reasoning reviewers receive supported reasoning settings without temperature", async () => {
  await reviewA2ReadingTest(revisedA2, "gpt-5-mini", async request => {
    assert.deepEqual(request.reasoning, { effort: "medium" });
    assert.equal(request.temperature, undefined);
    assert.equal(request.max_output_tokens, 9000);
    return { output_text: "{}" };
  });
});

test("refused, truncated or invalid review output never silently passes", async () => {
  for (const response of [{ output_text: "not JSON" }, { output_text: JSON.stringify(passingReview()), status: "incomplete" }, { output_text: '{"accepted":true}' }]) {
    assert.equal((await reviewA2ReadingTest(revisedA2, "model", async () => response)).accepted, false);
  }
  await assert.rejects(reviewA2ReadingTest(revisedA2, "model", async () => { throw Error("review service unavailable"); }), /unavailable/);
});
