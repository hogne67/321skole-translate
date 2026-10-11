import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { reviewContent } from "../reviewContent";
import { LessonError } from "../validation";

export function reviewHash(lesson: Record<string, unknown>) {
  return createHash("sha256").update(reviewContent(lesson)).digest("hex");
}

export function hasTeacherReviewApproval(lesson: Record<string, unknown>, review: Record<string, unknown>) {
  return review.acknowledgedBy === lesson.ownerId && review.acknowledgedHash === reviewHash(lesson);
}

export type FactCheckSource = { title: string; url: string; start?: number; end?: number };
export type FactCheckResult = { report: string; sources: FactCheckSource[] };
export type FactCheckRecord = FactCheckResult & { reviewId: string; checkedHash: string; acknowledgedHash: string | null };

export async function factCheckLesson(db: Firestore, uid: string, lessonId: string,
  action: "read" | "review" | "acknowledge", reviewId: string | undefined,
  generate: (content: string) => Promise<FactCheckResult>) {
  const lessonRef = db.collection("lessons").doc(lessonId);
  const reviewRef = db.collection("lessonFactChecks").doc(lessonId);
  const lessonSnap = await lessonRef.get();
  const lesson = lessonSnap.data();
  if (!lesson || lesson.ownerId !== uid || lesson.deletedAt) throw new LessonError("Lesson not found.", 404);
  const hash = reviewHash(lesson);
  if (action === "read") {
    const review = (await reviewRef.get()).data();
    return { review: review ? publicReview(review) : null, content: reviewContent(lesson), changedSinceCheck: !!review && review.checkedHash !== hash,
      acknowledged: !!review && hasTeacherReviewApproval(lesson, review) };
  }
  if (action === "review") {
    if (!String(lesson.sourceText ?? lesson.text ?? "").trim()) throw new LessonError("Source text is empty.", 400);
    const result = await generate(reviewContent(lesson));
    if (!result.report.trim()) throw new LessonError("Fact check returned no report. Please try again.", 502);
    const review: FactCheckRecord = { ...result, reviewId: randomUUID(), checkedHash: hash, acknowledgedHash: null };
    await db.runTransaction(async tx => {
      const current = (await tx.get(lessonRef)).data();
      if (!current || current.ownerId !== uid) throw new LessonError("Lesson not found.", 404);
      if (reviewHash(current) !== hash) throw new LessonError("Lesson changed during fact check. Please run it again.", 409);
      tx.set(reviewRef, { ...review, ownerId: uid, checkedAt: FieldValue.serverTimestamp() });
    });
    return { review: publicReview(review), content: reviewContent(lesson), changedSinceCheck: false, acknowledged: false };
  }
  // Teachers may correct the text/tasks after reading the report, then approve that version.
  const approvedReview = await db.runTransaction(async tx => {
    const current = (await tx.get(lessonRef)).data();
    const review = (await tx.get(reviewRef)).data();
    if (!current || current.ownerId !== uid) throw new LessonError("Lesson not found.", 404);
    if (!review || review.reviewId !== reviewId) throw new LessonError("Run and read the fact check before confirming.", 409);
    if (reviewHash(current) !== hash) throw new LessonError("Lesson changed. Save and confirm again.", 409);
    tx.update(reviewRef, { acknowledgedHash: hash, acknowledgedBy: uid, acknowledgedAt: FieldValue.serverTimestamp() });
    return review;
  });
  return { review: publicReview(approvedReview), content: reviewContent(lesson), changedSinceCheck: approvedReview.checkedHash !== hash, acknowledged: true };
}

function publicReview(review: Record<string, unknown>) {
  return { reviewId: String(review.reviewId), report: String(review.report), sources: (review.sources ?? []) as FactCheckSource[] };
}
