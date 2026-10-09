import assert from "node:assert/strict";
import { test } from "node:test";
import { coursePublicLink } from "./publicLink";
import { normalizeCourse, createEmptyCoursePlan } from "./types";
import { buildCoursePublishChecklist } from "./publishChecklist";

test("a published course without a slug cannot be shared", () => {
  assert.equal(coursePublicLink({ status: "published", slug: "" }, "nb", "https://321school.com"), "");
});

test("unpublishing removes sharing even if the old slug is retained", () => {
  assert.equal(coursePublicLink({ status: "draft", slug: "old-course" }, "nb", "https://321school.com"), "");
  assert.equal(coursePublicLink({ status: "completed", slug: "old-course" }, "nb", "https://321school.com"), "");
});

test("sharing uses the current origin and language rather than a saved localhost link", () => {
  const course = normalizeCourse("course", { status: "active", slug: "webinar", publicUrl: "http://localhost:3000/nb/courses/webinar" });
  assert.equal(coursePublicLink(course, "en", "https://321school.com"), "https://321school.com/en/courses/webinar");
});

test("the incomplete published course must finish its session content before publishing", () => {
  const course = normalizeCourse("course", {
    status: "published", title: "Intro", description: "Introduction", learningGoals: "Learn",
    targetAudience: "Teachers", language: "nb", priceText: "Gratis",
    coursePlan: createEmptyCoursePlan(1),
  });
  const checklist = buildCoursePublishChecklist(course);
  assert.equal(checklist.canPublish, false);
  assert.deepEqual(checklist.items.filter((item) => !item.passed && item.severity === "critical").map((item) => item.id), ["sessionReady"]);
  course.coursePlan[0].title = "Getting started";
  course.coursePlan[0].description = "An introduction with questions";
  assert.equal(buildCoursePublishChecklist(course).canPublish, true);
});
