import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type SaveAudioReadingBody = {
  id?: unknown;
  title?: unknown;
  sourceText?: unknown;
  sourceMode?: unknown;
  sourceLessonId?: unknown;
  sourceLessonTitle?: unknown;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ ok: false, error: "Unauthorized" }, 401);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    if (!uid) return json({ ok: false, error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as SaveAudioReadingBody;
    const requestedId = safeString(body.id);
    const title = safeString(body.title) || "Lydlesing";
    const sourceText = safeString(body.sourceText);
    const sourceMode = safeString(body.sourceMode) === "lesson" ? "lesson" : "paste";
    const sourceLessonId = safeString(body.sourceLessonId);
    const sourceLessonTitle = safeString(body.sourceLessonTitle);

    if (!sourceText) {
      return json({ ok: false, error: "Text is required." }, 400);
    }

    const lessonRef = requestedId
      ? db.collection("lessons").doc(requestedId)
      : db.collection("lessons").doc();

    if (requestedId) {
      const existingSnap = await lessonRef.get();
      const existing = existingSnap.exists ? existingSnap.data() : null;
      if (existing && existing.ownerId !== uid && existing.uid !== uid) {
        return json({ ok: false, error: "Forbidden" }, 403);
      }
    }

    const payload = {
      ownerId: uid,
      uid,
      status: "draft",
      title,
      description: "Lydlesing beta",
      language: "nb",
      lessonType: "audio_reading",
      taskType: "audio_reading",
      textType: "audio_reading",
      texttype: "Lydlesing",
      contentType: "audio_reading",
      source: "tools-audio-reading",
      sourceText,
      text: sourceText,
      tasks: [],
      audioReadingConfig: {
        version: 1,
        sourceMode,
        sourceLessonId: sourceMode === "lesson" ? sourceLessonId || null : null,
        sourceLessonTitle: sourceMode === "lesson" ? sourceLessonTitle || null : null,
        assessmentMode: "beta_duration_signal",
      },
      estimatedMinutes: Math.max(5, Math.ceil(sourceText.split(/\s+/).filter(Boolean).length / 115) + 5),
      releaseMode: "ALL_AT_ONCE",
      isActive: true,
      publishVisibility: "private",
      showInLibrary: false,
      meta: ["audio_reading", "lydlesing", "read_aloud"],
      deletedAt: null,
      activePublishedId: null,
      updatedAt: FieldValue.serverTimestamp(),
    };

    await lessonRef.set(
      requestedId
        ? payload
        : {
            ...payload,
            createdAt: FieldValue.serverTimestamp(),
          },
      { merge: true }
    );

    return json({ ok: true, id: lessonRef.id }, 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save audio reading activity.";
    return json({ ok: false, error: message }, 500);
  }
}
