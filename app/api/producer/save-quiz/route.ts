import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type QuestionType = "multiple_choice" | "true_false";

type QuizQuestionInput = {
  type?: unknown;
  question?: unknown;
  options?: unknown;
  correctIndex?: unknown;
  explanation?: unknown;
  seconds?: unknown;
};

type SaveQuizBody = {
  id?: unknown;
  requireCover?: unknown;
  title?: unknown;
  description?: unknown;
  language?: unknown;
  level?: unknown;
  sourceMode?: unknown;
  topic?: unknown;
  tags?: unknown;
  sourceText?: unknown;
  focus?: unknown;
  questionMode?: unknown;
  coverImageUrl?: unknown;
  coverImagePrompt?: unknown;
  questions?: unknown;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function safeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => safeString(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  const m = h?.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function cleanQuestion(raw: QuizQuestionInput, index: number) {
  const type: QuestionType = raw.type === "true_false" ? "true_false" : "multiple_choice";
  const question = safeString(raw.question);
  const options = Array.isArray(raw.options) ? raw.options.map((item) => safeString(item)).filter(Boolean).slice(0, 4) : [];
  const correctIndex = Math.max(0, Math.min(options.length - 1, Math.trunc(safeNumber(raw.correctIndex, 0))));
  const explanation = safeString(raw.explanation);
  const seconds = Math.max(5, Math.min(180, Math.trunc(safeNumber(raw.seconds, 30))));

  if (!question || options.length < 2) return null;

  return {
    id: `quiz_q_${index + 1}`,
    order: index + 1,
    type,
    question,
    options,
    correctIndex,
    explanation,
    seconds,
  };
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

    const profileSnap = await db.collection("users").doc(uid).get().catch(() => null);
    const profile = profileSnap?.exists ? (profileSnap.data() as Record<string, unknown>) : null;
    const producerName = pickName(profile) || safeString(decoded.name);

    const body = (await req.json().catch(() => ({}))) as SaveQuizBody;
    const requestedId = safeString(body.id);
    const requireCover = body.requireCover === true;
    const title = safeString(body.title);
    const description = safeString(body.description);
    const language = safeString(body.language) || "nb";
    const level = safeString(body.level) || "A2";
    const sourceMode = safeString(body.sourceMode) || "topic";
    const topic = safeString(body.topic);
    const tags = safeStringArray(body.tags);
    const sourceText = safeString(body.sourceText);
    const focus = safeString(body.focus) || "language";
    const questionMode = safeString(body.questionMode) || "mixed";
    const coverImageUrl = safeString(body.coverImageUrl);
    const coverImagePrompt = safeString(body.coverImagePrompt);
    const questions = Array.isArray(body.questions)
      ? body.questions
          .map((item, index) => cleanQuestion(item && typeof item === "object" ? (item as QuizQuestionInput) : {}, index))
          .filter((item): item is NonNullable<ReturnType<typeof cleanQuestion>> => item !== null)
      : [];

    if (!title) return json({ ok: false, error: "Title is required." }, 400);
    if (requireCover && !coverImageUrl) return json({ ok: false, error: "Cover image is required before saving to My content." }, 400);
    if (questions.length < 1) return json({ ok: false, error: "At least one question is required." }, 400);

    const sourceSummary = sourceMode === "text" ? sourceText : topic;
    const sourceTextForLesson = [
      description,
      sourceSummary ? `Kilde: ${sourceSummary}` : "",
      "",
      ...questions.flatMap((q) => [
        `${q.order}. ${q.question}`,
        ...q.options.map((option, optionIndex) => `${String.fromCharCode(65 + optionIndex)}. ${option}`),
        `Riktig svar: ${q.options[q.correctIndex] ?? ""}`,
        q.explanation ? `Forklaring: ${q.explanation}` : "",
        "",
      ]),
    ]
      .filter(Boolean)
      .join("\n");

    const tasks = questions.map((q) => ({
      id: q.id,
      order: q.order,
      type: "quiz",
      questionType: q.type,
      prompt: q.question,
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      seconds: q.seconds,
    }));

    const lessonRef = requestedId ? db.collection("lessons").doc(requestedId) : db.collection("lessons").doc();
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
      description,
      producerName,
      language,
      level,
      lessonType: "quiz",
      textType: "quiz",
      texttype: "Quiz",
      contentType: "quiz",
      source: "tools-quiz-generator",
      sourceMode,
      topic,
      tags,
      focus,
      questionMode,
      sourceText: sourceTextForLesson,
      text: sourceTextForLesson,
      coverImageUrl,
      imageUrl: coverImageUrl,
      coverImagePrompt,
      quiz: {
        title,
        description,
        language,
        level,
        sourceMode,
        topic,
        tags,
        sourceText,
        focus,
        questionMode,
        questions,
      },
      tasks,
      estimatedMinutes: Math.max(5, Math.ceil(questions.reduce((sum, q) => sum + q.seconds, 0) / 60) + 5),
      releaseMode: "ALL_AT_ONCE",
      isActive: true,
      publishVisibility: "private",
      showInLibrary: true,
      meta: ["quiz", "board", "live_quiz"],
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
    const message = error instanceof Error ? error.message : "Failed to save quiz.";
    return json({ ok: false, error: message }, 500);
  }
}
