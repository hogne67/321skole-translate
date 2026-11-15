import assert from "node:assert/strict";
import test from "node:test";
import { evaluateReadingReview, reviewC2ReadingTest } from "./semanticReview";
import { readingTaskQualityError } from "./generationValidation";
import { LEVEL_SPECS, isReviewedReadingLevel } from "./generationGuidance";
import { validC2, c2Quotes as q, c2ReviewCases } from "./c2Review.fixtures";

function passingReview() {
  const evidence = [...validC2.tasks.mcq.map(task => task.evidence!), [q.trial], [q.trial], [q.meeting], [q.meeting]];
  const facts = ["Withheld praise targets the inference from less help to independence", "The improvement does not identify a sole cause or establish representativeness", "Paper originals required for appeal are being destroyed", "Avklart frames moving dissent as resolution without agreement", "Faithful reproduction and selection adequacy are different criteria", "Six-week duration", "March start", "Town hall venue", "Eighteen o'clock presentation"];
  const explanation = "The interpretation preserves the actual voice, object, scope and qualification of the text.";
  return {
    taskChecks: facts.map((assessedFact, i) => ({taskId: i < 5 ? `mcq_${i + 1}` : `true_false_${i - 4}`, assessedFact, keyIsCorrect: true, keyIsUnambiguous: true, distractorsPlausible: true, statementTruth: i < 5 ? "not_applicable" : validC2.tasks.trueFalse[i - 5].correctAnswer ? "true" : "false", explanation, evidence: evidence[i]})),
    repeatedFacts: [] as {taskIds: string[]; fact: string; explanation: string}[],
    argumentCheck: {taskId: "mcq_2", requiresArgumentUnderstanding: true, linksReasonToPosition: true, attributionCorrect: true, duplicatesOtherFact: false, requiresNuancedRelation: true, explanation, evidence: evidence[1]},
    attitudeCheck: {taskId: "mcq_1", requiresAttitudeUnderstanding: true, attitudeSupported: true, holderCorrect: true, certaintyPreserved: true, requiresNuance: true, explanation, evidence: evidence[0]},
    inferenceCheck: {taskId: "mcq_3", requiresInference: true, requiresBothPieces: true, conclusionExplicitlyStated: false, needsOutsideKnowledge: false, requiresIndirectUnderstanding: true, explanation, evidence: evidence[2]},
    vocabularyCheck: {taskId: "mcq_4", meaningFitsContext: true, requiresContext: true, dictionaryLookupOnly: false, explanation, evidence: evidence[3]},
    perspectiveCheck: {taskId: "mcq_5", comparesViewpoints: true, attributionCorrect: true, relationshipSupported: true, requiresBothViewpoints: true, explanation, evidence: evidence[4]},
    summaryNuanceCheck: {mainPositionPreserved: true, qualificationPreserved: true, attributionCorrect: true, explanation},
    scopeCheck: {appropriateC2: true, sufficientNuance: true, simpleInstructions: true, explanation},
    c1DepthCheck: {complexArgument: true, implicitAttitude: true, synthesisedInference: true, contextualNuance: true, underlyingPerspectives: true, summaryReasoningPreserved: true, explanation},
    c2DepthCheck: {subtleStance: true, layeredArgument: true, indirectMeaning: true, preciseConnotation: true, voiceSeparation: true, summaryPrecision: true, explanation},
    summaryOptions: validC2.tasks.bestSummary.optionEvidence!.map((evidence, i) => ({optionIndex: i, scope: i === 0 ? "accurate_whole_text" : "accurate_detail", explanation, evidence})),
  };
}

test("C2 preserves its word range and simple five-plus-four-plus-summary format", () => {
  const words = validC2.text.split(/\s+/).length;
  assert.ok(words >= LEVEL_SPECS.C2.minWords && words <= LEVEL_SPECS.C2.maxWords);
  assert.equal(isReviewedReadingLevel("C2"), true);
  assert.equal(validC2.tasks.mcq.length, 5);
  assert.equal(validC2.tasks.trueFalse.length, 4);
  assert.equal(readingTaskQualityError("C2", validC2.tasks, validC2.text), null);
  assert.deepEqual(evaluateReadingReview(validC2, passingReview(), "C2"), {accepted: true, issues: []});
});

test("C2 requires independent text clues for attitude, argument, inference and comparison", () => {
  for (const index of [0, 1, 2, 4]) {
    const t = structuredClone(validC2); t.tasks.mcq[index].evidence = [q.trial, q.trial];
    assert.match(readingTaskQualityError("C2", t.tasks, t.text)!, /two distinct/);
  }
  const noEvidence = structuredClone(validC2); noEvidence.tasks.mcq[2].evidence = undefined;
  assert.match(readingTaskQualityError("C2", noEvidence.tasks, noEvidence.text)!, /actual supporting text evidence/);
  const missingRole = structuredClone(validC2); missingRole.tasks.mcq[4].skill = "find_information";
  assert.match(readingTaskQualityError("C2", missingRole.tasks, missingRole.text)!, /compare_perspectives/);
});

test("C2 requires four paragraphs, mixed keys and a summary supported across three paragraphs", () => {
  const t = structuredClone(validC2);
  assert.match(readingTaskQualityError("C2", t.tasks, t.text.replaceAll("\n\n", " "))!, /four coherent paragraphs/);
  t.tasks.trueFalse[1].correctAnswer = true;
  assert.match(readingTaskQualityError("C2", t.tasks, t.text)!, /2 true and 2 false/);
  t.tasks = structuredClone(validC2.tasks);
  t.tasks.bestSummary.optionEvidence![0] = [q.trial, q.conclusion];
  assert.match(readingTaskQualityError("C2", t.tasks, t.text)!, /three paragraphs/);
  t.tasks.bestSummary.optionEvidence![1] = ["Originalskjemaene blir oppbevart på papir."];
  assert.match(readingTaskQualityError("C2", t.tasks, t.text)!, /actual text evidence/);
});

test("C1 depth alone cannot approve C2; each C2 precision check is mandatory", () => {
  for (const flag of ["subtleStance", "layeredArgument", "indirectMeaning", "preciseConnotation", "voiceSeparation", "summaryPrecision"] as const) {
    const r = passingReview(); r.c2DepthCheck[flag] = false;
    const result = evaluateReadingReview(validC2, r, "C2");
    assert.equal(result.accepted, false, flag);
    assert.ok(result.issues.some(issue => issue.includes(flag)), flag);
  }
  assert.equal(evaluateReadingReview(validC2, {...passingReview(), c2DepthCheck: undefined}, "C2").accepted, false);
  assert.equal(evaluateReadingReview(validC2, {...passingReview(), c2DepthCheck: {explanation: "Not assessed"}}, "C2").accepted, false);
});

test("C2 retains C1 depth and rejects explicit answers, guesses and lost qualifications", () => {
  for (const flag of ["complexArgument", "implicitAttitude", "synthesisedInference", "contextualNuance", "underlyingPerspectives", "summaryReasoningPreserved"] as const) {
    const r = passingReview(); r.c1DepthCheck[flag] = false;
    assert.equal(evaluateReadingReview(validC2, r, "C2").accepted, false, flag);
  }
  const explicit = passingReview(); explicit.inferenceCheck.conclusionExplicitlyStated = true;
  assert.equal(evaluateReadingReview(validC2, explicit, "C2").accepted, false);
  const guess = passingReview(); guess.inferenceCheck.needsOutsideKnowledge = true;
  assert.equal(evaluateReadingReview(validC2, guess, "C2").accepted, false);
  const qualification = passingReview(); qualification.summaryNuanceCheck.qualificationPreserved = false;
  assert.equal(evaluateReadingReview(validC2, qualification, "C2").accepted, false);
});

test("C2 checks actual voices, contextual meaning and repeated assessed information", () => {
  const voice = passingReview(); voice.perspectiveCheck.attributionCorrect = false;
  assert.equal(evaluateReadingReview(validC2, voice, "C2").accepted, false);
  const dictionary = passingReview(); dictionary.vocabularyCheck.dictionaryLookupOnly = true;
  assert.equal(evaluateReadingReview(validC2, dictionary, "C2").accepted, false);
  const repeated = passingReview(); repeated.taskChecks[7].assessedFact = repeated.taskChecks[2].assessedFact;
  assert.equal(evaluateReadingReview(validC2, repeated, "C2").accepted, false);
  const oneClue = passingReview(); oneClue.attitudeCheck.evidence = [q.courtesy];
  assert.equal(evaluateReadingReview(validC2, oneClue, "C2").accepted, false);
});

test("C2 rejects more than one defensible reading even when the keyed answer is supported", () => {
  const r = passingReview(); r.taskChecks[3].keyIsUnambiguous = false;
  const result = evaluateReadingReview(validC2, r, "C2");
  assert.equal(result.accepted, false);
  assert.ok(result.issues.some(issue => issue.includes("mcq_4")));
});

test("C2 fails closed on wrong scope, complicated instructions, missing tasks and false keys", () => {
  const missing = passingReview(); missing.taskChecks.pop();
  assert.equal(evaluateReadingReview(validC2, missing, "C2").accepted, false);
  for (const flag of ["appropriateC2", "sufficientNuance", "simpleInstructions"] as const) {
    const r = passingReview(); r.scopeCheck[flag] = false;
    assert.equal(evaluateReadingReview(validC2, r, "C2").accepted, false);
  }
  const r = passingReview(); r.taskChecks[6].statementTruth = "true";
  assert.equal(evaluateReadingReview(validC2, r, "C2").accepted, false);
  assert.equal(evaluateReadingReview(validC2, {...passingReview(), scopeCheck: {appropriateC1: true, sufficientNuance: true, simpleInstructions: true, explanation: "C1 only"}}, "C2").accepted, false);
});

test("C2 uses its own schema, source IDs and target requirements without revealing statement keys", async () => {
  for (const precisionPass of [true, false]) {
  const result = await reviewC2ReadingTest(validC2, "gpt-5", async request => {
    const input = request.input as {role: string; content: string}[];
    const data = JSON.parse(input[1].content);
    if (request.text?.format?.type === "json_schema" && request.text.format.name === "c2_task_precision_review") {
      assert.equal(data.tasks.length, 3);
      assert.equal(data.requiredTargets, undefined);
      return {output_text: JSON.stringify({checks: validC2.tasks.mcq.flatMap((task, i) => [0, 2, 3].includes(i) ? [{
        taskId: `mcq_${i + 1}`, question: task.prompt, explanation: "This question requires the contextual relation, not direct lookup.",
        evidence: task.evidence!.map(quote => data.sentences.find((sentence: {text: string}) => sentence.text === quote)?.id ?? "missing"),
        oneSentenceSufficient: i === 3 || (!precisionPass && i === 0), dictionaryMeaningSufficient: false, explicitOpinionSufficient: !precisionPass && i === 0,
      }] : [])}), status: "completed"};
    }
    assert.equal(data.tasks.length, 9);
    assert.equal(data.tasks[8].correctAnswer, undefined);
    assert.equal(data.tasks[0].evidence, undefined);
    assert.equal(data.requiredTargets.perspectiveCheck, "mcq_5");
    assert.match(input[0].content, /subtleStance/);
    assert.match(input[0].content, /scope|causal/);
    const format = request.text?.format;
    assert.ok(format?.type === "json_schema");
    assert.equal(format.name, "c2_reading_content_review");
    assert.ok((format.schema.properties as Record<string, unknown>).c1DepthCheck);
    assert.ok((format.schema.properties as Record<string, unknown>).c2DepthCheck);
    const r = passingReview();
    const useIds = (check: {evidence: string[]}) => {
      check.evidence = check.evidence.map(quote => data.sentences.find((sentence: {text: string}) => sentence.text === quote)?.id ?? "missing");
    };
    r.taskChecks.forEach(useIds); r.summaryOptions.forEach(useIds);
    [r.argumentCheck, r.attitudeCheck, r.inferenceCheck, r.vocabularyCheck, r.perspectiveCheck].forEach(useIds);
    return {output_text: JSON.stringify(r), status: "completed"};
  });
  assert.equal(result.accepted, precisionPass);
  }
});

test("C2 live fixtures isolate overinterpretation and precision errors with valid metadata", () => {
  for (const item of c2ReviewCases()) assert.equal(readingTaskQualityError("C2", item.candidate.tasks, item.candidate.text), null, item.name);
});
