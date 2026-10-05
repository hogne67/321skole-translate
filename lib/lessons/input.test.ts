import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCreateLessonInput } from "./input";
import { normalizeLessonTasks } from "./tasks";
import { LessonError } from "./validation";

const input = { title: "  Lesson  ", sourceText: "  A text.  " };
const rejects = (value: unknown) => assert.throws(() => normalizeCreateLessonInput(value),
  (error: unknown) => error instanceof LessonError && error.status === 400);

test("minimal draft retains defaults and trims text", () => {
  const result = normalizeCreateLessonInput(input);
  assert.equal(result.title, "Lesson");
  assert.equal(result.sourceText, "A text.");
  assert.equal(result.level, "A2");
  assert.equal(result.language, "nb");
  assert.deepEqual(result.tasks, []);
  assert.equal(result.aiQuality.factChecked, false);
});

test("existing editor metadata, custom text types and beginner-reading fields survive", () => {
  const result = normalizeCreateLessonInput({ ...input, level: "a1_start", language: "pt-br",
    textType: ' "Custom type" ', prompt: "Topic", highFrequencyWord: "word",
    highFrequencyReadingSentences: "Reading", highFrequencyExplanation: "Explanation" });
  assert.equal(result.level, "A1_START");
  assert.equal(result.language, "pt-BR");
  assert.equal(result.textType, "Custom type");
  assert.equal(result.texttype, result.textType);
  assert.equal(result.topic, "Topic");
  assert.equal(result.highFrequencyExplanation, "Explanation");
});

test("types, limits, enumerations and unrecognized fields are rejected", () => {
  for (const value of [null, [], { ...input, title: {} }, { ...input, sourceText: " " },
    { ...input, level: "D1" }, { ...input, language: "xx" }, { ...input, tasks: "[]" },
    { ...input, title: "x".repeat(501) }, { ...input, sourceText: "x".repeat(200001) },
    { ...input, ownerId: "other" }, { ...input, status: "published" }, { ...input, id: "existing" },
    { ...input, aiQuality: { checkedAt: "now" } }, { ...input, aiQuality: { factChecked: "true" } }]) rejects(value);
});

test("fact-check requirement is enforced without changing the existing metadata contract", () => {
  rejects({ ...input, aiQuality: { factCheckRequired: true, factChecked: false } });
  const result = normalizeCreateLessonInput({ ...input,
    aiQuality: { factCheckRequired: true, factChecked: true, generatedWith: "factcheck" } });
  assert.equal(result.aiQuality.generatedWith, "factcheck");
});

test("tasks get canonical order, IDs, trimmed options and string true/false answers", () => {
  const result = normalizeLessonTasks([
    { id: "a", order: 9, type: "truefalse", prompt: " Question ", correctAnswer: false },
    { id: "b", order: 3, type: "mcq", prompt: "Choose", options: [" A ", "B"], correctAnswer: " A " },
    { type: "open", prompt: "Explain", answerSpace: "long" },
  ]);
  assert.deepEqual(result[0], { id: "a", order: 1, type: "truefalse", prompt: "Question", correctAnswer: "false" });
  assert.deepEqual(result[1].options, ["A", "B"]);
  assert.equal(result[1].correctAnswer, "A");
  assert.equal(result[2].order, 3);
  assert.ok(result[2].id);
  assert.equal("correctAnswer" in result[2], false);
});

test("invalid tasks cannot cross the server boundary", () => {
  const open = { id: "a", type: "open", prompt: "Question" };
  const invalid = [null, [null], [{ ...open, prompt: " " }], [open, open],
    [{ ...open, type: "unknown" }], [{ ...open, order: 0 }], [{ ...open, options: [] }],
    [{ ...open, ownerId: "other" }], [{ ...open, answerSpace: "huge" }],
    [{ ...open, type: "truefalse", correctAnswer: "yes" }],
    [{ ...open, type: "mcq", options: ["A", "A"], correctAnswer: "A" }],
    [{ ...open, type: "mcq", options: ["A", "B"], correctAnswer: "C" }]];
  for (const tasks of invalid) rejects({ ...input, tasks });
});

test("total encoded size is bounded even when individual fields are valid", () => {
  const tasks = Array.from({ length: 100 }, (_, index) => ({ id: `${index}`, type: "open", prompt: "x".repeat(8000) }));
  rejects({ ...input, tasks });
});
