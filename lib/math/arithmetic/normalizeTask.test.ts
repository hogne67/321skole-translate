import assert from "node:assert/strict";
import test from "node:test";
import { normalizeArithmeticTask } from "./normalizeTask";
import { sanitizeArithmeticWorksheet } from "./sanitize";
import type { ArithmeticTask, ArithmeticWorksheet } from "./types";
import {
  assignmentToLesson,
  hasSnapshotContent,
} from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/helpers";
import { getAssignmentDerivedState } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/assignmentDerivedState";
import { gradeArithmeticWorksheet } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/arithmeticGrade";

const task: ArithmeticTask = {
  id: "task-1",
  operation: "addition",
  left: 6,
  right: 41,
  answer: 41,
  expression: "6 + \u25a1 = 47",
  prompt: "6 + \u25a1 = 47",
};

const worksheet: ArithmeticWorksheet = {
  title: "Addition",
  instructions: "Find the missing number.",
  language: "nb",
  level: "grade_3_4",
  operation: "addition",
  difficulty: "easy",
  layout: "grid",
  showAnswerKey: false,
  taskCount: 1,
  numberRange: { min: 0, max: 50 },
  tasks: [task],
};

test("recovers either missing operand for all four operations", () => {
  for (const symbol of ["+", "-", "\u00d7", "\u00f7"]) {
    assert.equal(
      normalizeArithmeticTask({ ...task, prompt: `\u25a1 ${symbol} 4 = 12` }).unknownPosition,
      "left"
    );
    assert.equal(
      normalizeArithmeticTask({ ...task, prompt: `12 ${symbol} \u25a1 = 4` }).unknownPosition,
      "right"
    );
  }
  assert.equal(task.unknownPosition, undefined);
});

test("keeps explicit metadata and ordinary tasks unchanged", () => {
  const explicit: ArithmeticTask = { ...task, unknownPosition: "right" };
  assert.equal(normalizeArithmeticTask(explicit), explicit);
  for (const prompt of ["6 + 41 =", "\u25a1 + \u25a1 = 47", "6 + 41 = \u25a1"]) {
    const ordinary = { ...task, prompt };
    assert.equal(normalizeArithmeticTask(ordinary), ordinary);
  }
});

test("sanitizing an older worksheet restores metadata without changing its answer", () => {
  const restored = sanitizeArithmeticWorksheet(worksheet);
  assert.ok(restored);
  assert.equal(restored.tasks[0].unknownPosition, "right");
  assert.equal(restored.tasks[0].answer, 41);
  assert.equal(JSON.stringify(restored).includes("undefined"), false);
});

test("an arithmetic-only Spaces snapshot reaches the student and still grades by task id", () => {
  const assignment = { arithmeticWorksheet: worksheet };
  assert.equal(hasSnapshotContent(assignment), true);
  const lesson = assignmentToLesson(assignment);
  const derived = getAssignmentDerivedState(lesson, assignment);
  assert.equal(derived.arithmeticWorksheet, worksheet);
  assert.equal(derived.isArithmeticAssignment, true);
  const grade = gradeArithmeticWorksheet(worksheet, { "task-1": "41" });
  assert.equal(grade.correctAuto, 1);
  assert.equal(grade.unansweredAuto, 0);
});
