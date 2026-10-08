import assert from "node:assert/strict";
import { test } from "node:test";
import { createEmptyCoursePlan, normalizeCourse } from "./types";
import { buildCoursePublishChecklist } from "./publishChecklist";

test("a saved webinar keeps its format and free participation without a level", () => {
  const course = normalizeCourse("webinar", {
    courseType: "webinar", pricingMode: "free", priceText: "Gratis", level: "",
    title: "Webinar", description: "Live presentation", learningGoals: "Understand the topic",
    targetAudience: "Teachers", language: "Norsk", maxParticipants: 20,
    coursePlan: createEmptyCoursePlan(1).map((session) => ({ ...session, title: "Presentation", description: "Questions and discussion" })),
  });
  assert.equal(course.courseType, "webinar");
  assert.equal(course.pricingMode, "free");
  assert.equal(course.level, "");
  assert.equal(course.priceText, "Gratis");
  assert.equal(buildCoursePublishChecklist(course).canPublish, true);
});

test("existing courses keep their level and price", () => {
  const course = normalizeCourse("old", { level: "A2", priceText: "500 kr" });
  assert.equal(course.courseType, "course");
  assert.equal(course.level, "A2");
  assert.equal(course.priceText, "500 kr");
});

test("omitting a level does not bypass other publication requirements", () => {
  assert.equal(buildCoursePublishChecklist(normalizeCourse("empty", { level: "" })).canPublish, false);
});
