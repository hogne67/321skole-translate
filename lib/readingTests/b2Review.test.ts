import assert from "node:assert/strict";
import test from "node:test";
import { evaluateReadingReview, reviewB2ReadingTest } from "./semanticReview";
import { readingTaskQualityError } from "./generationValidation";
import { validB2, b2Quotes as q, b2ReviewCases } from "./b2Review.fixtures";

function passingReview() {
  const facts = ["Qualified support for a trial", "The example challenges a measure of success", "Increased demand could worsen capacity", "Frikort means an excuse to leave service unchanged", "Jonas and Mira share a goal but differ on means", "Six-week duration", "Twenty-minute frequency", "Traffic counted before and during", "Open results meeting"];
  const evidence = [[q.attitude, q.measurement], [q.example, q.contrast], [q.capacity, q.budget], [q.expression], [q.jonas, q.jonasReason, q.mira], [q.proposal], [q.frequency], [q.measurement], [q.meeting]];
  const explanation = "The answer preserves the actual meaning and qualifications in the text.";
  return {
    taskChecks: facts.map((assessedFact, i) => ({ taskId: i < 5 ? `mcq_${i + 1}` : `true_false_${i - 4}`, assessedFact, keyIsCorrect: true, keyIsUnambiguous: true, distractorsPlausible: true, statementTruth: i < 5 ? "not_applicable" : validB2.tasks.trueFalse[i - 5].correctAnswer ? "true" : "false", explanation, evidence: evidence[i] })),
    repeatedFacts: [] as { taskIds: string[]; fact: string; explanation: string }[],
    argumentCheck: { taskId: "mcq_2", requiresArgumentUnderstanding: true, linksReasonToPosition: true, attributionCorrect: true, duplicatesOtherFact: false, requiresNuancedRelation: true, explanation, evidence: [q.example, q.contrast] },
    attitudeCheck: { taskId: "mcq_1", requiresAttitudeUnderstanding: true, attitudeSupported: true, holderCorrect: true, certaintyPreserved: true, requiresNuance: true, explanation, evidence: [q.attitude, q.measurement] },
    inferenceCheck: { taskId: "mcq_3", requiresInference: true, requiresBothPieces: true, conclusionExplicitlyStated: false, needsOutsideKnowledge: false, requiresIndirectUnderstanding: true, explanation, evidence: [q.capacity, q.budget] },
    vocabularyCheck: { taskId: "mcq_4", meaningFitsContext: true, requiresContext: true, dictionaryLookupOnly: false, explanation, evidence: [q.expression] },
    perspectiveCheck: { taskId: "mcq_5", comparesViewpoints: true, attributionCorrect: true, relationshipSupported: true, requiresBothViewpoints: true, explanation, evidence: [q.jonas, q.jonasReason, q.mira] },
    summaryNuanceCheck: { mainPositionPreserved: true, qualificationPreserved: true, attributionCorrect: true, explanation },
    scopeCheck: { appropriateB2: true, sufficientNuance: true, simpleInstructions: true, explanation },
    summaryOptions: validB2.tasks.bestSummary.optionEvidence!.map((evidence, i) => ({ optionIndex: i, scope: i === 0 ? "accurate_whole_text" : "accurate_detail", explanation, evidence })),
  };
}

test("B2 accepts five distinct reading targets, four statements and a qualified summary", () => {
  assert.ok(validB2.text.split(/\s+/).length >= 220 && validB2.text.split(/\s+/).length <= 320);
  assert.equal(readingTaskQualityError("B2", validB2.tasks, validB2.text), null);
  assert.deepEqual(evaluateReadingReview(validB2, passingReview(), "B2"), { accepted: true, issues: [] });
});

test("B2 requires five target roles, four paragraphs and genuine evidence", () => {
  const t = structuredClone(validB2);
  t.tasks.mcq[4].skill = "find_information";
  assert.match(readingTaskQualityError("B2", t.tasks, t.text)!, /compare_perspectives/);
  t.tasks = structuredClone(validB2.tasks);
  assert.match(readingTaskQualityError("B2", t.tasks, t.text.replaceAll("\n\n", " "))!, /four coherent paragraphs/);
  for (const index of [2, 4]) {
    t.tasks = structuredClone(validB2.tasks);
    t.tasks.mcq[index].evidence = [q.budget, q.budget];
    assert.match(readingTaskQualityError("B2", t.tasks, t.text)!, /two distinct/);
  }
  t.tasks = structuredClone(validB2.tasks);
  t.tasks.bestSummary.optionEvidence![0] = [q.example, q.contrast];
  assert.match(readingTaskQualityError("B2", t.tasks, t.text)!, /two paragraphs/);
  t.tasks.bestSummary.optionEvidence![2] = ["Mira vil at alle busser skal være gratis hele året."];
  assert.match(readingTaskQualityError("B2", t.tasks, t.text)!, /actual text evidence/);
  t.tasks = structuredClone(validB2.tasks);
  t.tasks.mcq[2].evidence = undefined;
  t.tasks.mcq[4].evidence = ["Dette er en oppdiktet setning."];
  const issues = readingTaskQualityError("B2", t.tasks, t.text)!;
  assert.match(issues, /draw_inference/);
  assert.match(issues, /compare_perspectives/);
  assert.match(issues, /oppdiktet setning/);
});

test("B2 rejects lookup disguised as nuanced argument, attitude or indirect information", () => {
  for (const flag of ["requiresArgumentUnderstanding", "linksReasonToPosition", "attributionCorrect", "requiresNuancedRelation"] as const) {
    const r = passingReview(); r.argumentCheck[flag] = false;
    assert.equal(evaluateReadingReview(validB2, r, "B2").accepted, false, flag);
  }
  for (const flag of ["requiresAttitudeUnderstanding", "attitudeSupported", "holderCorrect", "certaintyPreserved", "requiresNuance"] as const) {
    const r = passingReview(); r.attitudeCheck[flag] = false;
    assert.equal(evaluateReadingReview(validB2, r, "B2").accepted, false, flag);
  }
  for (const flag of ["requiresInference", "requiresBothPieces", "conclusionExplicitlyStated", "needsOutsideKnowledge", "requiresIndirectUnderstanding"] as const) {
    const r = passingReview(); r.inferenceCheck[flag] = !r.inferenceCheck[flag];
    assert.equal(evaluateReadingReview(validB2, r, "B2").accepted, false, flag);
  }
});

test("B2 checks contextual meaning and compares both perspectives with correct attribution", () => {
  for (const flag of ["meaningFitsContext", "requiresContext", "dictionaryLookupOnly"] as const) {
    const r = passingReview(); r.vocabularyCheck[flag] = !r.vocabularyCheck[flag];
    assert.equal(evaluateReadingReview(validB2, r, "B2").accepted, false, flag);
  }
  for (const flag of ["comparesViewpoints", "attributionCorrect", "relationshipSupported", "requiresBothViewpoints"] as const) {
    const r = passingReview(); r.perspectiveCheck[flag] = false;
    assert.equal(evaluateReadingReview(validB2, r, "B2").accepted, false, flag);
  }
  const r = passingReview(); r.perspectiveCheck.evidence = [q.mira];
  assert.equal(evaluateReadingReview(validB2, r, "B2").accepted, false);
});

test("B2 summaries retain the position, qualification and speaker; instructions remain simple", () => {
  for (const flag of ["mainPositionPreserved", "qualificationPreserved", "attributionCorrect"] as const) {
    const r = passingReview(); r.summaryNuanceCheck[flag] = false;
    assert.equal(evaluateReadingReview(validB2, r, "B2").accepted, false, flag);
  }
  for (const flag of ["appropriateB2", "sufficientNuance", "simpleInstructions"] as const) {
    const r = passingReview(); r.scopeCheck[flag] = false;
    assert.equal(evaluateReadingReview(validB2, r, "B2").accepted, false, flag);
  }
  const summary = passingReview(); summary.summaryOptions[2].scope = "unsupported";
  assert.equal(evaluateReadingReview(validB2, summary, "B2").accepted, false);
  const repeated = passingReview(); repeated.taskChecks[8].assessedFact = repeated.taskChecks[1].assessedFact;
  assert.equal(evaluateReadingReview(validB2, repeated, "B2").accepted, false);
});

test("B2 fails closed on incomplete reports, duplicate IDs and wrong target assignments", () => {
  for (const field of ["vocabularyCheck", "perspectiveCheck", "summaryNuanceCheck", "argumentCheck", "scopeCheck"] as const) {
    assert.equal(evaluateReadingReview(validB2, { ...passingReview(), [field]: null }, "B2").accepted, false, field);
  }
  const missing = passingReview(); missing.taskChecks.pop();
  assert.equal(evaluateReadingReview(validB2, missing, "B2").accepted, false);
  const duplicate = passingReview(); duplicate.taskChecks[8].taskId = "true_false_3";
  assert.equal(evaluateReadingReview(validB2, duplicate, "B2").accepted, false);
  const roles = passingReview(); roles.perspectiveCheck.taskId = "mcq_4";
  assert.equal(evaluateReadingReview(validB2, roles, "B2").accepted, false);
});

test("B2 compares independently predicted statement truth with the hidden answer keys", () => {
  const r = passingReview();
  r.taskChecks[6].keyIsCorrect = false;
  r.taskChecks[6].keyIsUnambiguous = false;
  assert.equal(evaluateReadingReview(validB2, r, "B2").accepted, true);
  r.taskChecks[6].statementTruth = "true";
  assert.equal(evaluateReadingReview(validB2, r, "B2").accepted, false);
  r.taskChecks[6].statementTruth = "not_stated";
  assert.equal(evaluateReadingReview(validB2, r, "B2").accepted, false);
  const wrongKey = structuredClone(validB2);
  wrongKey.tasks.trueFalse[2].correctAnswer = true;
  assert.equal(evaluateReadingReview(wrongKey, passingReview(), "B2").accepted, false);
  const missing = passingReview();
  assert.equal(evaluateReadingReview(validB2, { ...missing, taskChecks: missing.taskChecks.map(check => ({ ...check, statementTruth: undefined })) }, "B2").accepted, false);
});

test("B2 audits the required targets in nine actual tasks without claimed evidence", async () => {
  const result = await reviewB2ReadingTest(validB2, "gpt-5-mini", async request => {
    assert.equal(request.max_output_tokens, 8000);
    assert.deepEqual(request.reasoning, { effort: "low" });
    const input = request.input as { role: string; content: string }[];
    const data = JSON.parse(input[1].content);
    assert.equal(data.tasks.length, 9);
    assert.equal(data.tasks[4].taskId, "mcq_5");
    assert.equal(data.tasks[8].taskId, "true_false_4");
    assert.equal(data.tasks[8].correctAnswer, undefined);
    assert.equal(data.tasks[0].skill, undefined);
    assert.equal(data.tasks[0].evidence, undefined);
    assert.deepEqual(data.requiredTargets, { argumentCheck: "mcq_2", attitudeCheck: "mcq_1", inferenceCheck: "mcq_3", vocabularyCheck: "mcq_4", perspectiveCheck: "mcq_5" });
    assert.match(input[0].content, /B2/);
    const r = passingReview();
    const useIds = (check: { evidence: string[] }) => {
      check.evidence = check.evidence.map(quote => data.sentences.find((sentence: { text: string }) => sentence.text === quote)?.id ?? "missing");
    };
    r.taskChecks.forEach(useIds); r.summaryOptions.forEach(useIds);
    [r.argumentCheck, r.attitudeCheck, r.inferenceCheck, r.vocabularyCheck, r.perspectiveCheck].forEach(useIds);
    return { output_text: JSON.stringify(r), status: "completed" };
  });
  assert.equal(result.accepted, true);
});

test("B2 live fixtures isolate semantic errors that structural checks cannot detect", () => {
  assert.equal(b2ReviewCases().length, 8);
  for (const item of b2ReviewCases()) assert.equal(readingTaskQualityError("B2", item.candidate.tasks, item.candidate.text), null, item.name);
});
