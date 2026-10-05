import assert from "node:assert/strict";
import test from "node:test";
import { gradeFractionWorksheet } from "@/app/[locale]/(app)/student/spaces/[spaceId]/assignments/[assignmentId]/fractionGrade";
import { readAnswerMap, readAutoGrade } from "@/lib/submissions/readers";
import { generateWorksheet, normalizeRequest } from "./generateWorksheet";

test("teacher reads the student's saved fraction assessment for all task types", () => {
  for (const topic of ["write_fraction", "choose_fraction", "part_of_whole"] as const) {
    const worksheet = generateWorksheet(normalizeRequest({ topic, taskCount: 6 }));
    const answers = Object.fromEntries(worksheet.tasks.slice(0, 5).map((task, index) => [
      task.id,
      task.type === "shade_fraction"
        ? { selectedParts: index === 4 ? [] : Array.from({ length: task.fraction.numerator }, (_, part) => part) }
        : index === 4 ? "0/1" : task.answer,
    ]));
    if (topic === "part_of_whole") {
      const wrongTask = worksheet.tasks[4];
      // A nonempty but incorrect selection is an answered task.
      answers[wrongTask.id] = {
        selectedParts: Array.from({ length: wrongTask.fraction.numerator === 1 ? 2 : 1 }, (_, part) => part),
      };
    }
    const saved = JSON.parse(JSON.stringify({
      answers,
      auto: gradeFractionWorksheet(worksheet, answers),
    }));
    const teacherAuto = readAutoGrade(saved);
    assert.ok(teacherAuto);
    assert.deepEqual(readAnswerMap(saved.answers), answers);
    assert.equal(teacherAuto.totalAuto, 6);
    assert.equal(teacherAuto.correctAuto, 4);
    assert.equal(teacherAuto.wrongAuto, 1);
    assert.equal(teacherAuto.unansweredAuto, 1);
    assert.equal(teacherAuto.percentAuto, 67);
    assert.equal(Object.keys(teacherAuto.byTask).length, 6);
  }
});

test("teacher summary preserves five correct answers out of six", () => {
  const worksheet = generateWorksheet(normalizeRequest({ topic: "write_fraction", taskCount: 6 }));
  const answers = Object.fromEntries(worksheet.tasks.map((task, index) => [task.id, index === 5 ? "0/1" : task.answer]));
  const auto = readAutoGrade({ auto: gradeFractionWorksheet(worksheet, answers) });
  assert.ok(auto);
  assert.equal(auto.correctAuto, 5);
  assert.equal(auto.wrongAuto, 1);
  assert.equal(auto.unansweredAuto, 0);
  assert.equal(auto.percentAuto, 83);
});

test("submissions without an assessment use the existing no-score fallback", () => {
  assert.equal(readAutoGrade({ answers: { "1": "1/2" } }), null);
});
