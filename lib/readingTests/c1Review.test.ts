import assert from "node:assert/strict";
import test from "node:test";
import { evaluateReadingReview, reviewC1ReadingTest } from "./semanticReview";
import { readingTaskQualityError } from "./generationValidation";
import { LEVEL_SPECS } from "./generationGuidance";
import { validC1, c1Quotes as q, c1ReviewCases } from "./c1Review.fixtures";

function passingReview() {
  const evidence = [[q.staff, q.label], [q.increase, q.campaign, q.concession], [q.booking, q.offline], [q.tidy], [q.director, q.educator], [q.proposal], [q.proposal], [q.meeting], [q.meeting]];
  const facts = ["The promise of closeness leaves reduced visitor support unaddressed", "Competing explanations limit causal attribution while price can still matter", "App-only booking may exclude the intended offline audience", "Ryddig frames dissent as a footnote to apparent unanimity", "Reach and depth are different criteria for value", "Eight-week duration", "Free Thursdays", "Library venue", "Nineteen o'clock presentation"];
  const explanation = "The actual text supports this interpretation and preserves the qualification.";
  return {
    taskChecks: facts.map((assessedFact, i) => ({ taskId: i < 5 ? `mcq_${i + 1}` : `true_false_${i - 4}`, assessedFact, keyIsCorrect: true, keyIsUnambiguous: true, distractorsPlausible: true, statementTruth: i < 5 ? "not_applicable" : validC1.tasks.trueFalse[i - 5].correctAnswer ? "true" : "false", explanation, evidence: evidence[i] })),
    repeatedFacts: [] as { taskIds: string[]; fact: string; explanation: string }[],
    argumentCheck: { taskId: "mcq_2", requiresArgumentUnderstanding: true, linksReasonToPosition: true, attributionCorrect: true, duplicatesOtherFact: false, requiresNuancedRelation: true, explanation, evidence: evidence[1] },
    attitudeCheck: { taskId: "mcq_1", requiresAttitudeUnderstanding: true, attitudeSupported: true, holderCorrect: true, certaintyPreserved: true, requiresNuance: true, explanation, evidence: evidence[0] },
    inferenceCheck: { taskId: "mcq_3", requiresInference: true, requiresBothPieces: true, conclusionExplicitlyStated: false, needsOutsideKnowledge: false, requiresIndirectUnderstanding: true, explanation, evidence: evidence[2] },
    vocabularyCheck: { taskId: "mcq_4", meaningFitsContext: true, requiresContext: true, dictionaryLookupOnly: false, explanation, evidence: evidence[3] },
    perspectiveCheck: { taskId: "mcq_5", comparesViewpoints: true, attributionCorrect: true, relationshipSupported: true, requiresBothViewpoints: true, explanation, evidence: evidence[4] },
    summaryNuanceCheck: { mainPositionPreserved: true, qualificationPreserved: true, attributionCorrect: true, explanation },
    scopeCheck: { appropriateC1: true, sufficientNuance: true, simpleInstructions: true, explanation },
    c1DepthCheck: { complexArgument: true, implicitAttitude: true, synthesisedInference: true, contextualNuance: true, underlyingPerspectives: true, summaryReasoningPreserved: true, explanation },
    summaryOptions: validC1.tasks.bestSummary.optionEvidence!.map((evidence, i) => ({ optionIndex: i, scope: i === 0 ? "accurate_whole_text" : "accurate_detail", explanation, evidence })),
  };
}

test("C1 keeps its word range and simple five-plus-four-plus-summary format", () => {
  const words = validC1.text.split(/\s+/).length;
  assert.ok(words >= LEVEL_SPECS.C1.minWords && words <= LEVEL_SPECS.C1.maxWords);
  assert.equal(validC1.tasks.mcq.length, 5);
  assert.equal(validC1.tasks.trueFalse.length, 4);
  assert.equal(readingTaskQualityError("C1", validC1.tasks, validC1.text), null);
  assert.deepEqual(evaluateReadingReview(validC1, passingReview(), "C1"), { accepted: true, issues: [] });
});

test("C1 needs separate clues for argument, implicit attitude, inference and comparison", () => {
  for (const index of [0, 1, 2, 4]) {
    const t = structuredClone(validC1); t.tasks.mcq[index].evidence = [q.proposal, q.proposal];
    assert.match(readingTaskQualityError("C1", t.tasks, t.text)!, /two distinct/);
  }
  const noEvidence = structuredClone(validC1); noEvidence.tasks.mcq[0].evidence = undefined;
  assert.match(readingTaskQualityError("C1", noEvidence.tasks, noEvidence.text)!, /actual supporting text evidence/);
  const t = structuredClone(validC1); t.tasks.mcq[4].skill = "find_information";
  assert.match(readingTaskQualityError("C1", t.tasks, t.text)!, /compare_perspectives/);
});

test("C1 enforces four paragraphs, balanced statements and broad summary support", () => {
  const t = structuredClone(validC1);
  assert.match(readingTaskQualityError("C1", t.tasks, t.text.replaceAll("\n\n", " "))!, /four coherent paragraphs/);
  t.tasks.trueFalse[1].correctAnswer = true;
  assert.match(readingTaskQualityError("C1", t.tasks, t.text)!, /2 true and 2 false/);
  t.tasks = structuredClone(validC1.tasks);
  t.tasks.bestSummary.optionEvidence![0] = [q.proposal, q.conclusion];
  assert.match(readingTaskQualityError("C1", t.tasks, t.text)!, /three paragraphs/);
  t.tasks.bestSummary.optionEvidence![1] = ["Museet er åpent gratis hver eneste dag."];
  assert.match(readingTaskQualityError("C1", t.tasks, t.text)!, /actual text evidence/);
});

test("each C1 depth requirement fails independently even when the B2-level checks pass", () => {
  for (const flag of ["complexArgument", "implicitAttitude", "synthesisedInference", "contextualNuance", "underlyingPerspectives", "summaryReasoningPreserved"] as const) {
    const r = passingReview(); r.c1DepthCheck[flag] = false;
    const result = evaluateReadingReview(validC1, r, "C1");
    assert.equal(result.accepted, false, flag);
    assert.ok(result.issues.some(issue => issue.includes(flag)), flag);
  }
});

test("C1 requires actual two-part support for implicit attitude and complex argument", () => {
  for (const name of ["attitudeCheck", "argumentCheck"] as const) {
    const r = passingReview(); r[name].evidence = [q.label];
    assert.equal(evaluateReadingReview(validC1, r, "C1").accepted, false);
  }
  const r = passingReview(); r.inferenceCheck.conclusionExplicitlyStated = true;
  assert.equal(evaluateReadingReview(validC1, r, "C1").accepted, false);
});

test("C1 preserves speaker, qualification, contextual connotation and underlying criteria", () => {
  const attitude = passingReview(); attitude.attitudeCheck.holderCorrect = false;
  assert.equal(evaluateReadingReview(validC1, attitude, "C1").accepted, false);
  const vocabulary = passingReview(); vocabulary.vocabularyCheck.dictionaryLookupOnly = true;
  assert.equal(evaluateReadingReview(validC1, vocabulary, "C1").accepted, false);
  const perspective = passingReview(); perspective.perspectiveCheck.attributionCorrect = false;
  assert.equal(evaluateReadingReview(validC1, perspective, "C1").accepted, false);
  const summary = passingReview(); summary.summaryNuanceCheck.qualificationPreserved = false;
  assert.equal(evaluateReadingReview(validC1, summary, "C1").accepted, false);
  const repeat = passingReview(); repeat.taskChecks[7].assessedFact = repeat.taskChecks[1].assessedFact;
  assert.equal(evaluateReadingReview(validC1, repeat, "C1").accepted, false);
});

test("C1 fails closed on missing depth flags, incomplete reviews and harder instructions", () => {
  assert.equal(evaluateReadingReview(validC1, { ...passingReview(), c1DepthCheck: null }, "C1").accepted, false);
  assert.equal(evaluateReadingReview(validC1, { ...passingReview(), c1DepthCheck: { explanation: "Incomplete" } }, "C1").accepted, false);
  const missing = passingReview(); missing.taskChecks.pop();
  assert.equal(evaluateReadingReview(validC1, missing, "C1").accepted, false);
  for (const flag of ["appropriateC1", "simpleInstructions", "sufficientNuance"] as const) {
    const r = passingReview(); r.scopeCheck[flag] = false;
    assert.equal(evaluateReadingReview(validC1, r, "C1").accepted, false);
  }
  const wrongTruth = passingReview(); wrongTruth.taskChecks[6].statementTruth = "true";
  assert.equal(evaluateReadingReview(validC1, wrongTruth, "C1").accepted, false);
});

test("C1 uses its own schema and depth instructions, exact source IDs and hidden statement keys", async () => {
  const result = await reviewC1ReadingTest(validC1, "gpt-5-mini", async request => {
    const input = request.input as { role: string; content: string }[];
    const data = JSON.parse(input[1].content);
    assert.equal(data.tasks.length, 9);
    assert.equal(data.tasks[8].correctAnswer, undefined);
    assert.equal(data.tasks[0].evidence, undefined);
    assert.equal(data.requiredTargets.attitudeCheck, "mcq_1");
    assert.match(input[0].content, /implicitAttitude/);
    const format = request.text?.format;
    assert.ok(format?.type === "json_schema");
    assert.equal(format.name, "c1_reading_content_review");
    assert.ok((format.schema.properties as Record<string, unknown>).c1DepthCheck);
    const r = passingReview();
    const useIds = (check: {evidence: string[]}) => {
      check.evidence = check.evidence.map(quote => data.sentences.find((sentence: {text: string}) => sentence.text === quote)?.id ?? "missing");
    };
    r.taskChecks.forEach(useIds); r.summaryOptions.forEach(useIds);
    [r.argumentCheck, r.attitudeCheck, r.inferenceCheck, r.vocabularyCheck, r.perspectiveCheck].forEach(useIds);
    return { output_text: JSON.stringify(r), status: "completed" };
  });
  assert.equal(result.accepted, true);
});

test("C1 live cases isolate semantic defects despite valid metadata and real quotations", () => {
  for (const item of c1ReviewCases()) assert.equal(readingTaskQualityError("C1", item.candidate.tasks, item.candidate.text), null, item.name);
});
