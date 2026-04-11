// lib/publishedLessons.server.ts
import "server-only";
import { cache } from "react";
import { getAdmin } from "@/lib/firebaseAdmin";

export type PublishedLessonPublic = {
  id: string;
  lessonId?: string;
  title: string;
  description?: string;
  level?: string;
  topic?: string;
  topics?: string[];
  language?: string;
  textType?: string;
  texttype?: string;
  sourceText?: string;
  text?: string;
  tasks?: unknown;
  coverImageUrl?: string;
  imageUrl?: string;
  isActive?: boolean;
  visibility?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toStringSafe(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function toStringArraySafe(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const arr = v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
  return arr.length ? arr : undefined;
}

function coercePublishedLesson(id: string, raw: unknown): PublishedLessonPublic {
  const obj = isRecord(raw) ? raw : {};

  return {
    id,
    lessonId: toStringSafe(obj.lessonId),
    title: toStringSafe(obj.title) || "Untitled",
    description: toStringSafe(obj.description),
    level: toStringSafe(obj.level),
    topic: toStringSafe(obj.topic),
    topics: toStringArraySafe(obj.topics),
    language: toStringSafe(obj.language),
    textType: toStringSafe(obj.textType),
    texttype: toStringSafe(obj.texttype),
    sourceText: toStringSafe(obj.sourceText),
    text: toStringSafe(obj.text),
    tasks: obj.tasks,
    coverImageUrl: toStringSafe(obj.coverImageUrl),
    imageUrl: toStringSafe(obj.imageUrl),
    isActive: typeof obj.isActive === "boolean" ? obj.isActive : undefined,
    visibility: toStringSafe(obj.visibility),
  };
}

export function pickPublishedLessonImage(lesson: PublishedLessonPublic): string | null {
  const a = String(lesson.coverImageUrl || "").trim();
  if (a) return a;

  const b = String(lesson.imageUrl || "").trim();
  if (b) return b;

  return null;
}

export function getPublishedLessonTopics(lesson: PublishedLessonPublic): string[] {
  const out: string[] = [];

  if (Array.isArray(lesson.topics)) {
    for (const topic of lesson.topics) {
      const v = String(topic || "").trim();
      if (v && !out.includes(v)) out.push(v);
    }
  }

  const single = String(lesson.topic || "").trim();
  if (single && !out.includes(single)) out.push(single);

  return out;
}

export const getPublishedLessonByEitherIdOrField = cache(
  async (lessonId: string): Promise<PublishedLessonPublic | null> => {
    const { db } = getAdmin();

    const directSnap = await db.collection("published_lessons").doc(lessonId).get();

    if (directSnap.exists) {
      const lesson = coercePublishedLesson(directSnap.id, directSnap.data());
      if (lesson.isActive === false) return null;
      return lesson;
    }

    const querySnap = await db
      .collection("published_lessons")
      .where("lessonId", "==", lessonId)
      .limit(1)
      .get();

    if (querySnap.empty) return null;

    const docSnap = querySnap.docs[0];
    const lesson = coercePublishedLesson(docSnap.id, docSnap.data());

    if (lesson.isActive === false) return null;

    return lesson;
  }
);