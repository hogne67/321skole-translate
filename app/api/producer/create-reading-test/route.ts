// app/api/producer/create-reading-test/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

type ReadingTestTaskType =
  | "word_choice"
  | "sentence_placement"
  | "best_summary"
  | "mcq"
  | "true_false"
  | "fill_in_word"
  | "short_answer"
  | "open";

type ReadingTestTask = {
  id: string;
  order?: number;
  type: ReadingTestTaskType;
  prompt: string;
  options?: string[];
  correctAnswer?: string | boolean | string[];
  sentence?: string;
  textWithGap?: string;
  enabled?: boolean;
};

type ReadingTestConfig = {
  cefrLevel: string;
  audience: string;
  topic: string;
  minWords: number;
  maxWords: number;
  timerEnabled: boolean;
  timerSeconds: number | null;
  showQuestionsAfterReading: boolean;
  enabledTaskTypes: ReadingTestTaskType[];
  feedbackMode: "learner" | "adult" | "both";
};

type Body = {
  title: string;
  level: string;
  language: string;
  sourceText: string;
  wordCount?: number;
  tasks: ReadingTestTask[];
  readingTestConfig: ReadingTestConfig;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function safeNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function safeNullableNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function countWords(text: string) {
  const t = (text ?? "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function normalizeTaskType(v: unknown): ReadingTestTaskType {
  switch (v) {
    case "word_choice":
    case "sentence_placement":
    case "best_summary":
    case "mcq":
    case "true_false":
    case "fill_in_word":
    case "short_answer":
    case "open":
      return v;
    default:
      return "mcq";
  }
}

function normalizeTask(task: unknown, index: number): ReadingTestTask {
  const t = isRecord(task) ? task : {};

  const options = Array.isArray(t.options)
    ? t.options.map((x) => String(x ?? "").trim()).filter(Boolean)
    : undefined;

  const correctAnswerRaw = t.correctAnswer;
  let correctAnswer: string | boolean | string[] | undefined;

  if (typeof correctAnswerRaw === "string") {
    correctAnswer = correctAnswerRaw.trim();
  } else if (typeof correctAnswerRaw === "boolean") {
    correctAnswer = correctAnswerRaw;
  } else if (Array.isArray(correctAnswerRaw)) {
    correctAnswer = correctAnswerRaw.map((x) => String(x ?? "").trim()).filter(Boolean);
  }

  const normalized: ReadingTestTask = {
    id: typeof t.id === "string" && t.id.trim() ? t.id.trim() : `rt_${index + 1}`,
    order: typeof t.order === "number" && Number.isFinite(t.order) ? t.order : index + 1,
    type: normalizeTaskType(t.type),
    prompt: String(t.prompt ?? "").trim(),
    enabled: typeof t.enabled === "boolean" ? t.enabled : true,
  };

  if (options && options.length > 0) {
    normalized.options = options;
  }

  if (correctAnswer !== undefined) {
    normalized.correctAnswer = correctAnswer;
  }

  if (typeof t.sentence === "string" && t.sentence.trim()) {
    normalized.sentence = t.sentence.trim();
  }

  if (typeof t.textWithGap === "string" && t.textWithGap.trim()) {
    normalized.textWithGap = t.textWithGap.trim();
  }

  return normalized;
}

function normalizeConfig(v: unknown, fallbackLevel: string): ReadingTestConfig {
  const c = isRecord(v) ? v : {};

  const enabledTaskTypes: ReadingTestTaskType[] = Array.isArray(c.enabledTaskTypes)
    ? c.enabledTaskTypes.map(normalizeTaskType)
    : ["word_choice", "sentence_placement", "best_summary"];

  const feedbackModeRaw = c.feedbackMode;
  const feedbackMode =
    feedbackModeRaw === "learner" || feedbackModeRaw === "adult" || feedbackModeRaw === "both"
      ? feedbackModeRaw
      : "both";

  return {
    cefrLevel: String(c.cefrLevel || fallbackLevel || "A2"),
    audience: String(c.audience || "learners"),
    topic: String(c.topic || ""),
    minWords: safeNumber(c.minWords) || 120,
    maxWords: safeNumber(c.maxWords) || 180,
    timerEnabled: c.timerEnabled === true,
    timerSeconds: safeNullableNumber(c.timerSeconds),
    showQuestionsAfterReading: c.showQuestionsAfterReading === true,
    enabledTaskTypes,
    feedbackMode,
  };
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return json({ error: "Not signed in." }, 401);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const body = (await req.json()) as Partial<Body>;

    const title = String(body.title || "").trim();
    const sourceText = String(body.sourceText || "").trim();
    const level = String(body.level || "A2").trim();
    const language = String(body.language || "nb").trim();

    if (!title) return json({ error: "Title is required." }, 400);
    if (!sourceText) return json({ error: "Source text is empty." }, 400);

    const normalizedTasks = Array.isArray(body.tasks)
      ? body.tasks.map((task, index) => normalizeTask(task, index))
      : [];

    const readingTestConfig = normalizeConfig(body.readingTestConfig, level);

    const wordCount =
      typeof body.wordCount === "number" && Number.isFinite(body.wordCount)
        ? body.wordCount
        : countWords(sourceText);

    const lessonRef = db.collection("lessons").doc();

    await lessonRef.set({
      ownerId: uid,

      status: "draft",
      lessonType: "reading_test",

      title,
      level,
      language,

      topic: readingTestConfig.topic || "",
      prompt: readingTestConfig.topic || "",

      textType: "Reading test",
      texttype: "Reading test",

      estimatedMinutes: 10,
      releaseMode: "ALL_AT_ONCE",

      sourceText,
      wordCount,

      readingTestConfig,
      tasks: normalizedTasks,

      source: "reading-test-generator",

      // Viktig: dette gjør at testen ikke skal regnes som offentlig bibliotekinnhold
      publishVisibility: "private",
      visibility: "private",
      showInLibrary: false,
      published: false,

      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),

      deletedAt: null,
      activePublishedId: null,
    });

    return json({ id: lessonRef.id }, 200);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Unknown error" }, 500);
  }
}