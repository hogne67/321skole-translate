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

    const existing = await db
      .collection("lessons")
      .where("ownerId", "==", uid)
      .where("sourcePublishedQuizId", "==", publishedId)
      .limit(1)
      .get();

    if (!existing.empty) {
      return json({ ok: true, lessonId: existing.docs[0].id, alreadyExists: true });
    }

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
      publishedBy: _publishedBy,
      signedBy: _signedBy,
      ...copyable
    } = source;

    void _id;
    void _ratingAverage;
    void _ratingCount;
    void _ratingSum;
    void _publishedAt;
    void _publishedBy;
    void _signedBy;

    await lessonRef.set({
      ...copyable,
      ownerId: uid,
      uid,
      producerName,
      status: "draft",
      publishVisibility: "private",
      visibility: "private",
      source: "321quiz-library",
      sourcePublishedQuizId: publishedId,
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
