// app/api/producer/create-reading-test/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { limitForFeature } from "@/lib/limits";

const FEATURE = "producer_create_lesson";

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

type UsageDoc = {
  features?: Record<string, { used?: number }>;
  updatedAt?: unknown;
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

/** YYYY-MM in Europe/Oslo */
function currentPeriodOslo(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);

  const year = parts.find((p) => p.type === "year")?.value || "1970";
  const month = parts.find((p) => p.type === "month")?.value || "01";
  return `${year}-${month}`;
}

function readUsed(doc: UsageDoc | null | undefined, feature: string): number {
  const used = doc?.features?.[feature]?.used;
  return safeNumber(used);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

async function isAdminUser(db: FirebaseFirestore.Firestore, uid: string): Promise<boolean> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return false;
  const d = snap.data() as Record<string, unknown>;

  if (typeof d.role === "string" && d.role === "admin") return true;

  const roles = d.roles;
  if (isRecord(roles) && roles.admin === true) return true;

  return false;
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

  const options =
    Array.isArray(t.options)
      ? t.options.map((x) => String(x ?? "").trim()).filter(Boolean)
      : undefined;

  const correctAnswerRaw = t.correctAnswer;
  let correctAnswer: string | boolean | string[] | undefined;

  if (typeof correctAnswerRaw === "string") correctAnswer = correctAnswerRaw.trim();
  else if (typeof correctAnswerRaw === "boolean") correctAnswer = correctAnswerRaw;
  else if (Array.isArray(correctAnswerRaw)) {
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
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ error: "Not signed in." }, 401);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const admin = await isAdminUser(db, uid);

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

    const period = currentPeriodOslo();

    const usageRef = db.collection("usage").doc(uid).collection("months").doc(period);
    const lessonRef = db.collection("lessons").doc();

    const limit = limitForFeature(FEATURE, { uid, isAdmin: admin });

    const result = await db.runTransaction(async (tx) => {
      const usageSnap = await tx.get(usageRef);
      const usage = (usageSnap.exists ? (usageSnap.data() as UsageDoc) : null) ?? null;

      const usedBefore = readUsed(usage, FEATURE);
      if (usedBefore + 1 > limit) {
        return {
          ok: false as const,
          quota: {
            feature: FEATURE,
            limit,
            used: usedBefore,
            remaining: Math.max(0, limit - usedBefore),
            period,
          },
        };
      }

      const usedAfter = usedBefore + 1;

      tx.set(
        usageRef,
        {
          ...(usage ?? {}),
          features: {
            ...(usage?.features ?? {}),
            [FEATURE]: { used: usedAfter },
          },
          updatedAt: FieldValue.serverTimestamp(),
        } satisfies UsageDoc,
        { merge: true }
      );

      tx.set(lessonRef, {
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

        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        source: "reading-test-generator",

        deletedAt: null,
        activePublishedId: null,
      });

      return {
        ok: true as const,
        id: lessonRef.id,
        quota: {
          feature: FEATURE,
          limit,
          used: usedAfter,
          remaining: Math.max(0, limit - usedAfter),
          period,
        },
      };
    });

    if (!result.ok) {
      return json({ error: "Limit reached", quota: result.quota }, 429);
    }

    return json({ id: result.id, quota: result.quota }, 200);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Unknown error" }, 500);
  }
}