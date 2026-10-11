import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { factCheckLesson, hasTeacherReviewApproval, reviewHash } from "./factCheck";

const original = { ownerId: "alice", title: "History", sourceText: "An incorrect date: 1900.",
  tasks: [{ id: "a", type: "mcq", prompt: "Which year?", options: ["1900", "2000"], correctAnswer: "1900" }] };
const generated = { report: "Check the date and task 1.", sources: [{ title: "Source", url: "https://example.org/history" }] };

function store() {
  const docs = new Map<string, Record<string, unknown>>([["lessons/draft", structuredClone(original)]]);
  const snapshot = (ref: { path: string }) => ({ data: () => docs.get(ref.path) });
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}`, get: async () => snapshot({ path: `${name}/${id}` }) }) }),
    runTransaction: async (work: (tx: unknown) => Promise<unknown>) => {
      const writes: (() => void)[] = [];
      const result = await work({ get: async (ref: { path: string }) => snapshot(ref),
        set: (ref: { path: string }, value: Record<string, unknown>) => writes.push(() => { docs.set(ref.path, value); }),
        update: (ref: { path: string }, value: Record<string, unknown>) => writes.push(() => { docs.set(ref.path, { ...docs.get(ref.path), ...value }); }),
      });
      writes.forEach(write => write());
      return result;
    },
  } as unknown as Firestore;
  return { db, docs, lesson: () => docs.get("lessons/draft")!, review: () => docs.get("lessonFactChecks/draft")! };
}

test("report-only review includes tasks, never mutates the lesson and does not approve publication", async () => {
  const s = store();
  const result = await factCheckLesson(s.db, "alice", "draft", "review", undefined, async content => {
    assert.match(content, /Which year/);
    assert.match(content, /1900/);
    return generated;
  });
  assert.deepEqual(s.lesson(), original);
  assert.equal(result.review?.report, generated.report);
  assert.equal(result.acknowledged, false);
  assert.equal(hasTeacherReviewApproval(s.lesson(), s.review()), false);
  const read = await factCheckLesson(s.db, "alice", "draft", "read", undefined, async () => { throw Error("Must not generate"); });
  assert.equal(read.review?.reviewId, result.review?.reviewId);
});

test("teacher can correct text and keys, then confirm; subsequent changes invalidate approval", async () => {
  const s = store();
  const result = await factCheckLesson(s.db, "alice", "draft", "review", undefined, async () => generated);
  s.docs.set("lessons/draft", { ...s.lesson(), sourceText: "Correct date: 2000.", tasks: [{ ...original.tasks[0], correctAnswer: "2000" }] });
  const corrected = structuredClone(s.lesson());
  const approved = await factCheckLesson(s.db, "alice", "draft", "acknowledge", result.review!.reviewId, async () => { throw Error("Must not generate"); });
  assert.equal(approved.acknowledged, true);
  assert.deepEqual(s.lesson(), corrected);
  assert.equal(hasTeacherReviewApproval(s.lesson(), s.review()), true);
  for (const changed of [
    { ...corrected, sourceText: "Later text" },
    { ...corrected, tasks: [{ ...original.tasks[0], correctAnswer: "1900" }] },
    { ...corrected, tasks: [{ ...original.tasks[0], prompt: "Different question" }] },
    { ...corrected, highFrequencyReadingSentences: "New supplementary claim" },
    { ...corrected, title: "Different subject" },
  ]) assert.equal(hasTeacherReviewApproval(changed, s.review()), false);
  assert.equal(hasTeacherReviewApproval({ ...corrected, coverImageUrl: "cover.png", estimatedMinutes: 10 }, s.review()), true);
});

test("ownership, missing review, stale review IDs and failed generation cannot approve publication", async () => {
  const s = store();
  await assert.rejects(factCheckLesson(s.db, "bob", "draft", "review", undefined, async () => { throw Error("Must not generate"); }), /not found/);
  await assert.rejects(factCheckLesson(s.db, "alice", "draft", "acknowledge", "made-up", async () => generated), /before confirming/);
  await assert.rejects(factCheckLesson(s.db, "alice", "draft", "review", undefined, async () => ({ report: "", sources: [] })), /no report/);
  assert.equal(s.docs.has("lessonFactChecks/draft"), false);
  const first = await factCheckLesson(s.db, "alice", "draft", "review", undefined, async () => generated);
  const second = await factCheckLesson(s.db, "alice", "draft", "review", undefined, async () => generated);
  assert.notEqual(first.review?.reviewId, second.review?.reviewId);
  await assert.rejects(factCheckLesson(s.db, "alice", "draft", "acknowledge", first.review!.reviewId, async () => generated), /before confirming/);
  assert.equal(hasTeacherReviewApproval(s.lesson(), s.review()), false);
});

test("edits during source lookup reject the outdated result without rewriting content", async () => {
  const s = store();
  await assert.rejects(factCheckLesson(s.db, "alice", "draft", "review", undefined, async () => {
    s.docs.set("lessons/draft", { ...s.lesson(), sourceText: "Edited while checking" });
    return generated;
  }), /changed during fact check/);
  assert.equal(s.lesson().sourceText, "Edited while checking");
  assert.equal(s.docs.has("lessonFactChecks/draft"), false);
});

test("legacy JSON tasks and task IDs do not break content matching", () => {
  assert.equal(reviewHash(original), reviewHash({ ...original, tasks: JSON.stringify(original.tasks) }));
  assert.equal(reviewHash(original), reviewHash({ ...original, tasks: [{ ...original.tasks[0], id: "new-id", order: 1 }] }));
});
