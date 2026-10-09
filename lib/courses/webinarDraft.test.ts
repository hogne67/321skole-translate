import assert from "node:assert/strict";
import { test } from "node:test";
import { webinarDraftSession } from "./webinarDraft";
import { normalizeCourse } from "./types";
import { buildCoursePublishChecklist } from "./publishChecklist";

test("a manual webinar saves its invitation as a single scheduled session", () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = "Europe/Oslo";
  try {
    const session = webinarDraftSession({ title: " Intro ", description: " Practical examples ", localStartsAt: "2026-10-15T15:00", durationMinutes: 45 });
    const course = normalizeCourse("webinar", { title: session.title, description: session.description, courseType: "webinar", pricingMode: "free", priceText: "Gratis", level: "", numberOfSessions: 1, coursePlan: [session] });
    assert.equal(course.coursePlan.length, 1);
    assert.equal(course.coursePlan[0].startsAt, "2026-10-15T13:00:00.000Z");
    assert.equal(course.coursePlan[0].durationMinutes, 45);
    assert.equal(course.coursePlan[0].title, "Intro");
    assert.equal(course.coursePlan[0].description, "Practical examples");
    assert.equal(course.level, "");
    assert.equal(course.coursePlan[0].meetingUrl, "");
    assert.equal(course.coursePlan[0].status, "planned");
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test("an undated draft can be saved before filling publication details", () => {
  const session = webinarDraftSession({ title: "Webinar", description: "", localStartsAt: "", durationMinutes: 60 });
  assert.equal(session.startsAt, "");
  const course = normalizeCourse("draft", { title: "Webinar", language: "Norsk", level: "", coursePlan: [session] });
  const checklist = buildCoursePublishChecklist(course);
  assert.equal(checklist.canPublish, false);
  assert.ok(checklist.items.some((item) => item.id === "learningGoals" && !item.passed));
  assert.ok(checklist.items.some((item) => item.id === "targetAudience" && !item.passed));
});

test("an invalid date cannot silently lose the chosen webinar time", () => {
  assert.throws(() => webinarDraftSession({ title: "Webinar", description: "", localStartsAt: "invalid", durationMinutes: 60 }), /gyldig dato/);
});
