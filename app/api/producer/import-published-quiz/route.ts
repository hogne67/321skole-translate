import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  const m = h?.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function pickName(data: Record<string, unknown> | null | undefined): string {
  if (!data) return "";
  for (const key of ["producerName", "displayName", "fullName", "name"]) {
    const value = safeString(data[key]);
    if (value) return value;
  }
  return "";
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ ok: false, error: "Unauthorized" }, 401);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    if (!uid) return json({ ok: false, error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const publishedId = safeString(body.publishedId);
    if (!publishedId) return json({ ok: false, error: "publishedId is required." }, 400);

    const publishedSnap = await db.collection("published_lessons").doc(publishedId).get();
    if (!publishedSnap.exists) return json({ ok: false, error: "Quiz not found." }, 404);

    const source = publishedSnap.data() as Record<string, unknown>;
    const lessonType = safeString(source.lessonType || source.contentType || source.textType || source.texttype).toLowerCase();
    const quiz = isRecord(source.quiz) ? source.quiz : {};
    const isQuiz = lessonType === "quiz" || Array.isArray(quiz.questions);
    if (!isQuiz) return json({ ok: false, error: "Not a quiz." }, 400);
    if (source.isActive === false) return json({ ok: false, error: "Quiz is not active." }, 400);

    const legacySourceLessonId = safeString(source.lessonId);
    const existingQueries = await Promise.all([
      db.collection("lessons").where("ownerId", "==", uid).where("sourcePublishedQuizId", "==", publishedId).limit(1).get(),
      db.collection("lessons").where("ownerId", "==", uid).where("activePublishedId", "==", publishedId).limit(1).get(),
      db.collection("lessons").where("ownerId", "==", uid).where("publishedLessonId", "==", publishedId).limit(1).get(),
      legacySourceLessonId
        ? db.collection("lessons").where("ownerId", "==", uid).where("sourceLibraryLessonId", "==", legacySourceLessonId).limit(1).get()
        : Promise.resolve(null),
    ]);
    const existingDoc = existingQueries.find((snap) => snap && !snap.empty)?.docs[0];
    if (existingDoc) return json({ ok: true, lessonId: existingDoc.id, alreadyExists: true });

    const profileSnap = await db.collection("users").doc(uid).get().catch(() => null);
    const profile = profileSnap?.exists ? (profileSnap.data() as Record<string, unknown>) : null;
    const producerName = pickName(profile) || safeString(decoded.name);
    const now = FieldValue.serverTimestamp();
    const lessonRef = db.collection("lessons").doc();

    const {
      id: _id,
      ratingAverage: _ratingAverage,
      ratingCount: _ratingCount,
      ratingSum: _ratingSum,
      publishedAt: _publishedAt,
      publishedLessonId: _publishedLessonId,
      activePublishedId: _activePublishedId,
      publish: _publish,
      publishedBy: _publishedBy,
      signedBy: _signedBy,
      moderation: _moderation,
      visibility: _visibility,
      publishVisibility: _publishVisibility,
      showInLibrary: _showInLibrary,
      sourcePublishedQuizId: _sourcePublishedQuizId,
      ...copyable
    } = source;

    void _id;
    void _ratingAverage;
    void _ratingCount;
    void _ratingSum;
    void _publishedAt;
    void _publishedLessonId;
    void _activePublishedId;
    void _publish;
    void _publishedBy;
    void _signedBy;
    void _moderation;
    void _visibility;
    void _publishVisibility;
    void _showInLibrary;
    void _sourcePublishedQuizId;

    await lessonRef.set({
      ...copyable,
      ownerId: uid,
      uid,
      producerName,
      status: "draft",
      activePublishedId: null,
      publishedLessonId: null,
      publishVisibility: "private",
      visibility: "private",
      showInLibrary: false,
      publish: { visibility: "private", state: "draft" },
      source: "321quiz-library",
      sourcePublishedQuizId: publishedId,
      sourceLibraryLessonId: legacySourceLessonId || null,
      originalOwnerId: safeString(source.ownerId || source.uid) || null,
      originalProducerName: safeString(source.producerName || source.authorName) || null,
      importedFromLibraryAt: now,
      createdAt: now,
      updatedAt: now,
      isActive: true,
    });

    return json({ ok: true, lessonId: lessonRef.id, alreadyExists: false });
  } catch (error) {
    console.error("import-published-quiz failed", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Import failed." }, 500);
  }
}
