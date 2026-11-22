import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCreateLessonInput } from "../lessons/input";
import { getTextTypeLabel, normalizeTextTypeKey } from "../textTypes";
import { READING_PRACTICE_TASK_DEFAULTS, READING_PRACTICE_TEXT_TYPES } from "./readingPractice";
import { buildReadingPracticeTasksPrompt, checkReadingPracticeText, completeReadingPracticeTasks, readReadingPracticeTasks } from "./readingPracticeGeneration";
import { getReadingPracticeStage, readingPracticeSpokenText, splitReadingPracticeWordParts } from "./readingPracticeText";
import { activeLessonSentenceIndex, lessonSentenceStartTime, readLessonSentenceStarts, splitLessonSentences } from "../audio/lessonSentenceTiming";

test("one-syllable drafts preserve line breaks and allow common diphthongs", () => {
  const text = "Det er sol.\nJeg ser en båt.\nJeg ser ei øy.\nVi går i land.\nJeg får is.";
  assert.deepEqual(checkReadingPracticeText({ title: "Det er sol", text }, "one_syllable"), {
    title: "Det er sol", text, problems: [],
  });
  assert.match(checkReadingPracticeText({ title: "Sola", text }, "one_syllable").problems.join(" "), /Sola/);
});

test("the mixed stage requires both word lengths and rejects longer or syllable-split words", () => {
  const text = "Jeg ser en katt. Den er grå. Katten får mat. Den drikker vann. Den vil sove.";
  const check = (source: string) => checkReadingPracticeText({ title: "Katten får mat", text: source }, "one_and_two_syllables");
  assert.deepEqual(check(text).problems, []);
  assert.equal(check(text).text.split("\n").length, 5);
  assert.match(check(text.replace("drikker", "bestemmer")).problems.join(" "), /bestemmer/);
  assert.match(check(text.replace("drikker", "drik·ker")).problems.join(" "), /stavelsesdeling/);
  assert.match(check("Det er sol. Vi går. Jeg ser en båt. Så får jeg is. Is er godt.").problems.join(" "), /både/);
});

const catText = "Jeg ser en katt.\nDen er grå.\nDen har myk pels.\nKatt-en får mat.\nDen **drikk-er** vann.\nSå **ma-ler** den.\nDen vil **so-ve**.\nDen er trøtt.";
const modelTasks = {
  multipleChoice: [
    { q: "Hva får jeg?", options: ["is", "saft"], answerIndex: 0 },
    { q: "Hva ser jeg?", options: ["tog", "båt", "bil"], answerIndex: 1 },
  ],
  trueFalse: [
    { statement: "Jeg ser en båt.", answer: true },
    { statement: "Jeg får saft.", answer: false },
  ],
};

test("the default task pack has two multiple choice, two true/false, and one picture question", () => {
  assert.deepEqual(READING_PRACTICE_TASK_DEFAULTS, { mcq: 2, trueFalse: 2, facts: 0, reflection: 1 });
  const tasks = readReadingPracticeTasks(JSON.stringify({ tasks: modelTasks }), READING_PRACTICE_TASK_DEFAULTS);
  assert.deepEqual(tasks, { ...modelTasks, writeFacts: [], reflectionQuestions: ["Hva ser du?"] });

  for (const invalid of [
    { ...modelTasks, trueFalse: modelTasks.trueFalse.slice(1) },
    { ...modelTasks, trueFalse: modelTasks.trueFalse.map(item => ({ ...item, answer: false })) },
    { ...modelTasks, multipleChoice: modelTasks.multipleChoice.map(item => ({ ...item, answerIndex: 3 })) },
  ]) {
    assert.equal(readReadingPracticeTasks(JSON.stringify({ tasks: invalid }), READING_PRACTICE_TASK_DEFAULTS), null);
  }
});

test("task selection supports zero counts, one true/false item, and additional open questions", () => {
  const counts = { mcq: 0, trueFalse: 1, facts: 2, reflection: 3 };
  const trueFalse = [modelTasks.trueFalse[0]];
  const reflectionQuestions = ["Hva drikker katten?", "Hvorfor vil den sove?"];
  const tasks = readReadingPracticeTasks(JSON.stringify({ tasks: { trueFalse, reflectionQuestions } }), counts);
  assert.deepEqual(tasks, {
    multipleChoice: [], trueFalse, writeFacts: ["Skriv 2 faktasetninger fra teksten."],
    reflectionQuestions: ["Hva ser du?", ...reflectionQuestions],
  });
  assert.equal(readReadingPracticeTasks(JSON.stringify({ tasks: { trueFalse } }), counts), null);

  const none = { mcq: 0, trueFalse: 0, facts: 0, reflection: 0 };
  assert.deepEqual(completeReadingPracticeTasks(none), {
    multipleChoice: [], trueFalse: [], writeFacts: [], reflectionQuestions: [],
  });
  assert.deepEqual(completeReadingPracticeTasks({ ...none, facts: 1, reflection: 1 }), {
    multipleChoice: [], trueFalse: [], writeFacts: ["Skriv 1 faktasetning fra teksten."], reflectionQuestions: ["Hva ser du?"],
  });
});

test("the mixed-stage draft preserves pasted divisions and the task prompt uses normal spelling", () => {
  const textType = READING_PRACTICE_TEXT_TYPES.one_and_two_syllables;
  const result = normalizeCreateLessonInput({ title: "Katten", sourceText: catText, level: "A1_START", language: "nb", textType });
  assert.equal(result.sourceText, catText);
  assert.equal(result.textType, textType);
  assert.equal(normalizeTextTypeKey(result.texttype), textType);
  assert.equal(getTextTypeLabel(textType, "nb"), "Lesetrening – Én og to stavelser");
  const prompt = buildReadingPracticeTasksPrompt(catText, READING_PRACTICE_TASK_DEFAULTS);
  assert.ok(prompt.includes(JSON.stringify(catText)));
  assert.match(prompt, /Skriv disse ordene på vanlig måte/);
});

test("Katten shows divided words and the spoken text has whole words through the final line", () => {
  const divisions = splitReadingPracticeWordParts(catText).filter(part => part.divided);
  assert.deepEqual(divisions.map(part => part.display), ["Katt-en", "drikk-er", "ma-ler", "so-ve"]);
  const spoken = readingPracticeSpokenText(catText);
  const sentences = splitLessonSentences(spoken);
  assert.equal(sentences.length, 8);
  assert.deepEqual(sentences.slice(3), ["Katten får mat.", "Den drikker vann.", "Så maler den.", "Den vil sove.", "Den er trøtt."]);
  assert.equal(readingPracticeSpokenText("Vi tar T-bane. Jeg leser e-post. Jeg får **i-sen**."), "Vi tar T-bane. Jeg leser e-post. Jeg får isen.");
  assert.equal(getReadingPracticeStage(READING_PRACTICE_TEXT_TYPES.one_and_two_syllables, null), "one_and_two_syllables");
  assert.equal(getReadingPracticeStage(READING_PRACTICE_TEXT_TYPES.one_and_two_syllables, "en"), null);
});

test("all eight reading sentences are highlighted and seekable at their actual audio boundaries", () => {
  const timings = Array.from({ length: 8 }, (_, index) => ({ startRatio: index / 8 }));
  const starts = [0, 0.9, 2, 3.4, 4, 5.3, 7, 8.5];
  assert.deepEqual(readLessonSentenceStarts(starts), starts);
  assert.equal(readLessonSentenceStarts([0, 7, 6]), undefined);
  assert.equal(readLessonSentenceStarts([0, Infinity]), undefined);
  for (const [index, start] of starts.entries()) {
    assert.equal(lessonSentenceStartTime(timings, index, 10, starts), start);
    assert.equal(activeLessonSentenceIndex(timings, start, 10, starts), index);
  }
  assert.equal(activeLessonSentenceIndex(timings, 8.49, 10, starts), 6);
  assert.equal(activeLessonSentenceIndex(timings, 10, 10, starts), 7);
  assert.equal(lessonSentenceStartTime(timings, 7, 10), 8.75);
  assert.equal(lessonSentenceStartTime(timings, 7, 10, [0, 8]), 8.75);
});
