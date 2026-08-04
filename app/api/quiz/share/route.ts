import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function isQuizDraft(data: Record<string, unknown>) {
  const lessonType = safeString(data.lessonType || data.contentType || data.textType || data.texttype).toLowerCase();
  const quiz = isRecord(data.quiz) ? data.quiz : {};
  return lessonType === "quiz" || Array.isArray(quiz.questions);
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const body = (await req.json().catch(() => ({}))) as { lessonId?: unknown };
    const lessonId = safeString(body.lessonId);
    if (!lessonId) return json({ error: "Missing lessonId" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const lessonRef = db.collection("lessons").doc(lessonId);
    const [lessonSnap, userSnap] = await Promise.all([
      lessonRef.get(),
      db.collection("users").doc(uid).get(),
    ]);

    if (!lessonSnap.exists) return json({ error: "Quiz not found" }, 404);

    const data = (lessonSnap.data() ?? {}) as Record<string, unknown>;
    const user = (userSnap.data() ?? {}) as Record<string, unknown>;
    const roles = isRecord(user.roles) ? user.roles : {};
    const isAdmin = user.role === "admin" || roles.admin === true;
    const ownerId = safeString(data.ownerId || data.uid);

    if (ownerId && ownerId !== uid && !isAdmin) return json({ error: "Not allowed" }, 403);
    if (!isQuizDraft(data)) return json({ error: "Only quizzes can be shared this way" }, 400);

    const activePublishedId = safeString(data.activePublishedId);
    if (activePublishedId) {
      const activeSnap = await db.collection("published_lessons").doc(activePublishedId).get();
      if (activeSnap.exists) return json({ ok: true, publishedId: activePublishedId, publishedLessonId: activePublishedId });
    }

    const now = FieldValue.serverTimestamp();
    const publishedRef = db.collection("published_lessons").doc();
    const publishedId = publishedRef.id;
    const effectiveOwnerId = ownerId || uid;

    const signedBy = {
      uid,
      nameSnapshot: safeString(user.displayName),
      emailSnapshot: safeString(user.email),
      orgSnapshot: isRecord(user.org) ? user.org : {},
      attestationVersion: null,
      signedAt: now,
      viaAdmin: isAdmin && effectiveOwnerId !== uid,
    };

    await publishedRef.set(
      {
        ...data,
        lessonId,
        publishedId,
        ownerId: effectiveOwnerId,
        isActive: true,
        visibility: "unlisted",
        publishVisibility: "unlisted",
        showInLibrary: false,
        publishedAt: now,
        updatedAt: now,
        signedBy,
        moderation: {
          status: "not_required",
          checkedAt: now,
          model: "quiz-share",
        },
      },
      { merge: true }
    );

    await lessonRef.set(
      {
        status: "published",
        activePublishedId: publishedId,
        publishVisibility: "unlisted",
        showInLibrary: false,
        "publish.visibility": "unlisted",
        updatedAt: now,
      },
      { merge: true }
    );

    await db.collection("auditEvents").add({
      type: "QUIZ_SHARE_LINK_CREATED",
      uid,
      lessonId,
      publishedLessonId: publishedId,
      ts: now,
      meta: { visibility: "unlisted", effectiveOwnerId },
    });

    return json({ ok: true, publishedId, publishedLessonId: publishedId, lessonId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not prepare quiz sharing";
    return json({ error: message }, 500);
  }
}
