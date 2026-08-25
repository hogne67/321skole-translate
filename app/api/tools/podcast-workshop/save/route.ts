import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type SavePodcastWorkshopBody = {
  id?: unknown;
  title?: unknown;
  assignmentText?: unknown;
  subject?: unknown;
  level?: unknown;
  language?: unknown;
  targetDurationSeconds?: unknown;
  scriptMode?: unknown;
  aiSupport?: unknown;
  criteria?: unknown;
  vocabulary?: unknown;
  guidingQuestions?: unknown;
  supportWordsBySection?: unknown;
  segments?: unknown;
};

type Segment = {
  id: string;
  title: string;
  hint: string;
  order: number;
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

function cleanStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => safeString(item))
    .filter(Boolean)
    .slice(0, limit);
}

function cleanStringListMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string[]> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    const safeKey = safeString(key).slice(0, 80);
    if (!safeKey) return;
    const words = cleanStringList(item, 16);
    if (words.length > 0) out[safeKey] = words;
  });
  return out;
}

function cleanSegments(value: unknown): Segment[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index): Segment | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const data = item as Record<string, unknown>;
      const title = safeString(data.title);
      if (!title) return null;
      return {
        id: safeString(data.id) || `segment_${index + 1}`,
        title,
        hint: safeString(data.hint),
        order: index,
      };
    })
    .filter((item): item is Segment => item !== null)
    .slice(0, 12);
}

function cleanDurationSeconds(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 30) return null;
  return Math.min(60 * 30, rounded);
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ ok: false, error: "Unauthorized" }, 401);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    if (!uid) return json({ ok: false, error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as SavePodcastWorkshopBody;
    const requestedId = safeString(body.id);
    const title = safeString(body.title) || "Podcastverksted";
    const assignmentText = safeString(body.assignmentText);
    const subject = safeString(body.subject);
    const level = safeString(body.level);
    const language = safeString(body.language) || "nb";
    const targetDurationSeconds = cleanDurationSeconds(body.targetDurationSeconds);
    const scriptMode = safeString(body.scriptMode) === "script" ? "script" : "bullet_points";
    const aiSupport = safeString(body.aiSupport) === "off" ? "off" : "coach";
    const criteria = cleanStringList(body.criteria, 12);
    const vocabulary = cleanStringList(body.vocabulary, 20);
    const guidingQuestions = cleanStringList(body.guidingQuestions, 16);
    const supportWordsBySection = cleanStringListMap(body.supportWordsBySection);
    const segments = cleanSegments(body.segments);

    if (!assignmentText) return json({ ok: false, error: "Assignment text is required." }, 400);
    if (segments.length === 0) return json({ ok: false, error: "At least one segment is required." }, 400);

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
      description: "Podcastverksted beta",
      language,
      level,
      subject,
      lessonType: "podcast_workshop",
      taskType: "podcast_workshop",
      textType: "podcast_workshop",
      texttype: "Podcastverksted",
      contentType: "podcast_workshop",
      source: "tools-podcast-workshop",
      sourceText: assignmentText,
      text: assignmentText,
      tasks: [],
      podcastWorkshopConfig: {
        version: 1,
        assignmentText,
        subject,
        targetDurationSeconds,
        workMode: "individual",
        visibility: "teacher_only",
        scriptMode,
        aiSupport,
        criteria,
        vocabulary,
        guidingQuestions,
        supportWordsBySection,
        segments,
      },
      estimatedMinutes: targetDurationSeconds ? Math.ceil(targetDurationSeconds / 60) : null,
      releaseMode: "ALL_AT_ONCE",
      isActive: true,
      publishVisibility: "private",
      showInLibrary: false,
      meta: ["podcast_workshop", "podcastverksted", "muntlig"],
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
    const message = error instanceof Error ? error.message : "Failed to save podcast workshop.";
    return json({ ok: false, error: message }, 500);
  }
}
