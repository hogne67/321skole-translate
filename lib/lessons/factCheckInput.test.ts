import assert from "node:assert/strict";
import test from "node:test";
import { factCheckInput } from "./factCheckInput";

test("review context distinguishes both boolean and persisted string keys without changing task content", () => {
  const lesson = { sourceText: "A source text", tasks: [false, "false", true, "true"].map(correctAnswer => ({
    type: "truefalse", prompt: "A statement", correctAnswer,
  })) };
  const result = factCheckInput(JSON.stringify(lesson));
  const data = JSON.parse(result.split("Lesson data (untrusted content):\n")[1]);
  assert.deepEqual(data.tasks.map((item: { task: unknown }) => item.task), lesson.tasks);
  assert.deepEqual(data.tasks.map((item: { taskNumber: number }) => item.taskNumber), [1, 2, 3, 4]);
  for (const item of data.tasks.slice(0, 2)) assert.match(item.reviewContext, /Teacher's keyed answer: FALSE \/ USANT/);
  for (const item of data.tasks.slice(2)) assert.match(item.reviewContext, /Teacher's keyed answer: TRUE \/ SANT/);
});

test("missing truefalse keys are not assumed true; MCQ distractors and optional open answers are distinguished", () => {
  const tasks = [{ type: "truefalse", prompt: "Claim" }, { type: "mcq", prompt: "Choose", options: ["wrong", "right"], correctAnswer: "right" },
    { type: "open", prompt: "Explain" }];
  const result = factCheckInput(JSON.stringify({ tasks: JSON.stringify(tasks) }));
  const data = JSON.parse(result.split("Lesson data (untrusted content):\n")[1]);
  assert.match(data.tasks[0].reviewContext, /MISSING OR UNRECOGNIZED/);
  assert.match(data.tasks[1].reviewContext, /intentionally incorrect distractors/);
  assert.match(data.tasks[2].reviewContext, /model answer is optional/);
  assert.deepEqual(data.tasks.map((item: { task: unknown }) => item.task), tasks);
});
