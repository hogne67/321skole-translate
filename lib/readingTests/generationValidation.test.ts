import { validB2 } from "./b2Review.fixtures";
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeReadingEvidence, readingTaskQualityError } from "./generationValidation";

function tasks() {
  return {
    mcq: [{ prompt: "Why did she leave?", options: ["Work", "School", "Home"], correctAnswer: "Work" }],
    trueFalse: [{ prompt: "She left on Monday.", correctAnswer: true }, { prompt: "She took the bus.", correctAnswer: false }],
    bestSummary: { prompt: "What is the text mainly about?", options: ["A visit", "A trip", "A meal"], correctAnswer: "A trip" },
  };
}

function a2Test() {
  const reason = "Sara og familien tar bussen fordi besteforeldrene bor langt unna.";
  const firstConnection = "Før besøket kjøper Sara et brød som hun tar med.";
  const secondConnection = "Til lunsj spiser alle det Sara har tatt med, sammen med ost.";
  const text = `${reason} ${firstConnection} Sara gleder seg til besøket og vil høre om bestefars nye hage.\n\n${secondConnection} Etter maten går de en tur, og bestefar viser fram plantene sine. Familien tar bussen hjem på ettermiddagen.`;
  return {
    text,
    reason, firstConnection, secondConnection,
    tasks: {
      mcq: [
        { prompt: "Hvordan reiser familien?", options: ["Med buss", "Med bil", "Med tog"], correctAnswer: "Med buss", skill: "find_information", evidence: [reason] },
        { prompt: "Hvorfor tar familien bussen?", options: ["Det regner", "Det er langt å reise", "Bilen er ødelagt"], correctAnswer: "Det er langt å reise", skill: "understand_reason", evidence: [reason] },
        { prompt: "Hva bruker familien brødet til?", options: ["Mat på bussen", "Middag hjemme", "Lunsj hos besteforeldrene"], correctAnswer: "Lunsj hos besteforeldrene", skill: "connect_information", evidence: [firstConnection, secondConnection] },
      ],
      trueFalse: [{ prompt: "Bestefar har en hage.", correctAnswer: true }, { prompt: "Familien sover hos besteforeldrene.", correctAnswer: false }],
      bestSummary: {
        prompt: "Hvilket sammendrag passer best til hele teksten?",
        options: ["Sara kjøper brød før hun reiser.", "Familien besøker besteforeldrene og spiser sammen.", "Familien spiser ost til lunsj."],
        correctAnswer: "Familien besøker besteforeldrene og spiser sammen.",
        optionEvidence: [[firstConnection], [reason, secondConnection], [secondConnection]],
      },
    },
  };
}

test("ambiguous duplicate choices are rejected for questions and summaries", () => {
  const mcq = tasks();
  mcq.mcq[0].options = ["School", " school ", "Home"];
  assert.match(readingTaskQualityError("A2", mcq)!, /distinct/);
  const summary = tasks();
  summary.bestSummary.options = ["A trip", "A   trip", "A meal"];
  assert.match(readingTaskQualityError("A2", summary)!, /distinct/);
});

test("repeated questions are rejected even if case or whitespace differs", () => {
  const t = tasks();
  t.bestSummary.prompt = " WHY  DID SHE LEAVE? ";
  assert.match(readingTaskQualityError("A2", t)!, /distinct question/);
});

test("A2 and B2 true-false answers must be balanced", () => {
  const t = tasks();
  const a2 = a2Test();
  assert.equal(readingTaskQualityError("A2", a2.tasks, a2.text), null);
  t.trueFalse[1].correctAnswer = true;
  assert.match(readingTaskQualityError("A2", t)!, /1 true and 1 false/);
  const b2 = structuredClone(validB2);
  assert.equal(readingTaskQualityError("B2", b2.tasks, b2.text), null);
  b2.tasks.trueFalse[1].correctAnswer = true;
  assert.match(readingTaskQualityError("B2", b2.tasks, b2.text)!, /2 true and 2 false/);
});

test("A1 can retain its single true-false question", () => {
  const t = tasks();
  t.trueFalse = [t.trueFalse[0]];
  assert.equal(readingTaskQualityError("A1", t), null);
});

test("A2 requires two paragraphs, not a single block", () => {
  const t = a2Test();
  assert.match(readingTaskQualityError("A2", t.tasks, t.text.replace("\n\n", " "))!, /two coherent paragraphs/);
  assert.equal(readingTaskQualityError("A2", t.tasks, t.text.replace("\n\n", "\r\n\r\n")), null);
});

test("A2 rejects three fact lookups even when the answer keys and task counts are valid", () => {
  const t = a2Test();
  t.tasks.mcq.forEach(task => { task.skill = "find_information"; });
  assert.match(readingTaskQualityError("A2", t.tasks, t.text)!, /understand_reason.*connect_information/);
});

test("A2 cannot claim skill coverage without supporting quotes from the actual text", () => {
  const t = a2Test();
  t.tasks.mcq[1].evidence = ["Familien tar bussen fordi det regner."];
  assert.match(readingTaskQualityError("A2", t.tasks, t.text)!, /understand_reason.*exact supporting quotes/);
  t.tasks.mcq[1].evidence = [];
  assert.match(readingTaskQualityError("A2", t.tasks, t.text)!, /supporting quotes/);
  t.tasks.mcq[1].evidence = ["Sara"];
  assert.match(readingTaskQualityError("A2", t.tasks, t.text)!, /supporting quotes/);
});

test("A2 connection questions need two distinct parts, not repeated or overlapping quotes", () => {
  const t = a2Test();
  t.tasks.mcq[2].evidence = [t.firstConnection, t.firstConnection];
  assert.match(readingTaskQualityError("A2", t.tasks, t.text)!, /non-overlapping/);
  t.tasks.mcq[2].evidence = [t.firstConnection, "kjøper Sara et brød som hun tar med."];
  assert.match(readingTaskQualityError("A2", t.tasks, t.text)!, /non-overlapping/);
  t.tasks.mcq[2].evidence = [t.firstConnection, t.secondConnection];
  assert.equal(readingTaskQualityError("A2", t.tasks, t.text), null);
});

test("A2 summary distractors must supply text evidence and the correct summary must span both paragraphs", () => {
  const t = a2Test();
  t.tasks.bestSummary.optionEvidence[0] = ["Sara spiller fotball alene i parken."];
  assert.match(readingTaskQualityError("A2", t.tasks, t.text)!, /Each A2 summary option/);
  t.tasks.bestSummary.optionEvidence[0] = [t.firstConnection];
  t.tasks.bestSummary.optionEvidence[1] = [t.reason, t.firstConnection];
  assert.match(readingTaskQualityError("A2", t.tasks, t.text)!, /both paragraphs/);
});

test("quoted evidence survives normalisation and ignores malformed metadata", () => {
  assert.deepEqual(normalizeReadingEvidence([null, 42, " ", "  Sara tar bussen.  "]), ["Sara tar bussen."]);
  assert.deepEqual(normalizeReadingEvidence("Sara tar bussen."), []);
  const t = a2Test();
  t.tasks.mcq[0].evidence = [t.reason.replaceAll(" ", "\n")];
  assert.equal(readingTaskQualityError("A2", t.tasks, t.text), null);
});
