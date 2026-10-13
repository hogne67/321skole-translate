import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase/firestore";
import { createPodcastWorkshopFeedback, readPodcastWorkshopFeedback } from "../podcastWorkshop";
import { summarizeSubmissionStatuses } from "../dashboardSubmissionStats";
import { getSubmissionStatus, podcastFeedbackUpdate } from "./status";

function feedback(status: "approved" | "needs_work" | "", at = 2000) {
  const value = createPodcastWorkshopFeedback();
  value.rooms.final = { text: "Flott podcast!", status };
  value.updatedAt = Timestamp.fromMillis(at);
  return value;
}

test("legacy final-room reviews override draft/submitted badges and count in teacher and student statistics", () => {
  const submissions = [
    { status: "draft", podcastWorkshopFeedback: feedback("approved") },
    { status: "submitted", podcastWorkshopFeedback: feedback("needs_work") },
  ];
  assert.equal(getSubmissionStatus(submissions[0]), "reviewed");
  assert.equal(getSubmissionStatus(submissions[1]), "needs_work");
  const expected = { total: 2, draft: 0, submitted: 0, needsWork: 1, approved: 1, other: 0 };
  assert.deepEqual(summarizeSubmissionStatuses(submissions), expected);
  assert.deepEqual(summarizeSubmissionStatuses(submissions, true), expected);
});

test("only a final decision counts; other rooms, fields and text-only feedback are formative", () => {
  const value = feedback("");
  value.rooms.ideas.status = "approved";
  value.rooms.plan.status = "needs_work";
  value.rooms.production.status = "approved";
  value.fields["final:reflection"] = { text: "Good", status: "approved" };
  assert.equal(getSubmissionStatus({ status: "draft", podcastWorkshopFeedback: value }), "draft");
  assert.equal(getSubmissionStatus({ status: "submitted", podcastWorkshopFeedback: value }), "submitted");
  assert.equal(summarizeSubmissionStatuses([{ status: "draft", podcastWorkshopFeedback: value }]).total, 0);
  assert.equal(podcastFeedbackUpdate(value, "final", "teacher", 3000).status, undefined);
});

test("saving a final review synchronizes status and feedback for both submission copies", () => {
  for (const decision of ["approved", "needs_work"] as const) {
    const value = feedback(decision);
    const now = Timestamp.fromMillis(3000);
    const update = podcastFeedbackUpdate(value, "final", "teacher", now);
    const nested = { status: "draft", submittedAt: 1000, ...update };
    const index = { status: "submitted", submittedAt: 1000, ...update };
    const expected = decision === "approved" ? "reviewed" : "needs_work";
    assert.equal(nested.status, expected); assert.equal(index.status, expected);
    assert.equal(getSubmissionStatus(nested), expected); assert.equal(getSubmissionStatus(index), expected);
    assert.deepEqual(update.teacherFeedback, { text: "Flott podcast!", updatedAt: now, teacherUid: "teacher" });
    assert.equal(update.podcastWorkshopFeedback.finalReviewedAt, now);
  }
});

test("saving another room or a field does not set the overall review status", () => {
  const value = feedback("approved");
  for (const room of ["ideas", "plan", "script", "production", undefined] as const) {
    const update = podcastFeedbackUpdate(value, room, "teacher", 4000);
    assert.equal(update.status, undefined);
    assert.equal(update.teacherFeedback, undefined);
    assert.equal(update.podcastWorkshopFeedback.finalReviewedAt, value.updatedAt);
    assert.equal(update.podcastWorkshopFeedback.rooms.final.status, "approved");
  }
});

test("resubmission waits for a fresh final review, even if another room is saved meanwhile", () => {
  const oldFeedback = feedback("needs_work");
  const resubmission = { status: "submitted", submittedAt: Timestamp.fromMillis(3000), podcastWorkshopFeedback: oldFeedback };
  assert.equal(getSubmissionStatus(resubmission), "submitted");
  const formativeUpdate = podcastFeedbackUpdate(readPodcastWorkshopFeedback(oldFeedback), "plan", "teacher", Timestamp.fromMillis(4000));
  const afterFormative = { ...resubmission, ...formativeUpdate };
  assert.equal(getSubmissionStatus(afterFormative), "submitted");
  assert.equal(summarizeSubmissionStatuses([afterFormative]).submitted, 1);
  const reviewedFeedback = readPodcastWorkshopFeedback(formativeUpdate.podcastWorkshopFeedback);
  reviewedFeedback.rooms.final.status = "approved";
  const finalUpdate = podcastFeedbackUpdate(reviewedFeedback, "final", "teacher", Timestamp.fromMillis(5000));
  assert.equal(getSubmissionStatus({ ...afterFormative, ...finalUpdate }), "reviewed");
});

test("final review wins over other rooms and changing the final decision updates the count", () => {
  const value = feedback("approved"); value.rooms.production.status = "needs_work";
  const submission = { status: "draft", podcastWorkshopFeedback: value };
  assert.equal(summarizeSubmissionStatuses([submission]).approved, 1);
  value.rooms.final.status = "needs_work";
  assert.deepEqual(summarizeSubmissionStatuses([submission]), {
    total: 1, approved: 0, needsWork: 1, submitted: 0, draft: 0, other: 0,
  });
});

test("ordinary submissions, malformed feedback and archive/draft filters retain their existing behavior", () => {
  for (const status of ["submitted", "reviewed", "needs_work", "draft"]) {
    for (const invalid of [undefined, null, [], "approved", { rooms: { final: { status: "invalid" } } }]) {
      assert.equal(getSubmissionStatus({ status, podcastWorkshopFeedback: invalid }), status);
    }
  }
  const list = [
    { status: "draft" }, { status: "submitted" }, { status: "reviewed" }, { status: "needs_work" },
    { status: "draft", podcastWorkshopFeedback: feedback("approved"), archived: true },
    { status: "submitted", podcastWorkshopFeedback: feedback("approved"), studentArchived: true },
  ];
  assert.deepEqual(summarizeSubmissionStatuses(list), { total: 3, draft: 0, submitted: 1, approved: 1, needsWork: 1, other: 0 });
  assert.deepEqual(summarizeSubmissionStatuses(list, true), { total: 6, draft: 1, submitted: 1, approved: 3, needsWork: 1, other: 0 });
});
