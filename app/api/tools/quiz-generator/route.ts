import OpenAI from "openai";
import { getAdmin } from "@/lib/firebaseAdmin";
import { consumeFeatureAdmin, getFeatureStatusAdmin } from "@/lib/featureGuardAdmin";
import { getEffectivePlan, type AppRole, type PlanKey } from "@/lib/featureAccess";
import { emailVerificationRequiredWebResponse, needsEmailVerification } from "@/lib/emailVerificationGuard";

export const runtime = "nodejs";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type QuizQuestion = {
  type: "multiple_choice" | "true_false";
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  seconds: number;
};

type QuestionMode = "mixed" | "multiple_choice" | "true_false";

type RequestUserContext = {
  uid: string;
  role: AppRole | string;
  plan: PlanKey | string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pickString(obj: unknown, key: string, fallback = ""): string {
  if (!isRecord(obj)) return fallback;
  const value = obj[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function pickNumber(obj: unknown, key: string, fallback: number): number {
  if (!isRecord(obj)) return fallback;
  const value = obj[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeLanguage(language: string): string {
  return language.trim() || "nb";
}

function pickQuestionMode(value: string): QuestionMode {
  if (value === "multiple_choice" || value === "true_false") return value;
  return "mixed";
}

function getLanguageInstruction(language: string): string {
  const lower = language.toLowerCase();
  if (lower === "no" || lower === "nb" || lower === "nn") return "Write everything in Norwegian Bokmal.";
  if (lower === "pt" || lower === "pt-br" || lower === "pt-pt") return "Write everything in Portuguese.";
  if (lower === "en") return "Write everything in English.";
  return `Write everything in the language with code "${language}".`;
}

function getFocusInstruction(focus: string): string {
  const normalized = focus.trim().toLowerCase();
  const labels: Record<string, string> = {
    language: "language and text",
    math: "mathematics",
    science: "science",
    social_studies: "social studies",
    english: "English as a school subject",
    work_life: "work life and careers",
    citizenship: "democracy and citizenship",
    culture: "culture and society",
    health: "health and life skills",
    sports: "sports and physical education",
    food: "food and drink",
    wildlife: "animals and wildlife",
    other: "other/general topic",
  };
  return labels[normalized] || focus || "other/general topic";
}

async function getRequestUserContext(req: Request): Promise<RequestUserContext | null> {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const idToken = authHeader.slice(7).trim();
  if (!idToken) return null;

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(idToken);
  if (needsEmailVerification(decoded)) {
    throw new Error("EMAIL_VERIFICATION_REQUIRED");
  }
  const uid = decoded.uid;
  const userSnap = await db.collection("users").doc(uid).get();
  const data = userSnap.exists ? userSnap.data() : undefined;

  const role =
    typeof data?.role === "string"
      ? data.role
      : typeof data?.mode === "string"
        ? data.mode
        : "anonymous";

  const plan = getEffectivePlan({
    plan: typeof data?.plan === "string" ? data.plan : "free",
    billing:
      data?.billing && typeof data.billing === "object"
        ? (data.billing as { plan?: string | null; status?: string | null })
        : null,
    schoolId: typeof data?.schoolId === "string" ? data.schoolId : null,
    schoolRole: typeof data?.schoolRole === "string" ? data.schoolRole : null,
    schoolStatus: typeof data?.schoolStatus === "string" ? data.schoolStatus : null,
  });

  return { uid, role, plan };
}

function quotaErrorResponse(status: Awaited<ReturnType<typeof getFeatureStatusAdmin>>) {
  if (status.reason === "limit_reached") {
    return Response.json({ error: "Du har brukt opp månedens AI-kvote.", quota: status }, { status: 403 });
  }
  if (status.reason === "teacher_only") {
    return Response.json({ error: "Denne funksjonen er bare tilgjengelig for lærere.", quota: status }, { status: 403 });
  }
  return Response.json({ error: "Denne funksjonen krever et abonnement.", quota: status }, { status: 403 });
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function cleanQuestion(raw: unknown, index: number, fallbackSeconds: number): QuizQuestion | null {
  if (!isRecord(raw)) return null;
  const question = pickString(raw, "question");
  const explanation = pickString(raw, "explanation");
  const rawType = pickString(raw, "type", "multiple_choice");
  const type = rawType === "true_false" ? "true_false" : "multiple_choice";
  const options = Array.isArray(raw.options)
    ? raw.options.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
  const correctIndex = Math.trunc(pickNumber(raw, "correctIndex", 0));
  const seconds = Math.max(10, Math.min(120, Math.trunc(pickNumber(raw, "seconds", fallbackSeconds))));

  if (!question || !explanation) return null;
  if (type === "true_false") {
    const tfOptions = options.length >= 2 ? options.slice(0, 2) : ["Sant", "Usant"];
    return {
      type,
      question,
      options: tfOptions,
      correctIndex: correctIndex === 1 ? 1 : 0,
      explanation,
      seconds,
    };
  }

  const nextOptions = options.slice(0, 4);
  if (nextOptions.length < 2) return null;

  return {
    type,
    question,
    options: nextOptions,
    correctIndex: Math.max(0, Math.min(nextOptions.length - 1, correctIndex)),
    explanation,
    seconds,
  };
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });
    }

    const user = await getRequestUserContext(req);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const quotaBefore = await getFeatureStatusAdmin({
      uid: user.uid,
      role: user.role,
      plan: user.plan,
      feature: "producer_create_quiz",
    });

    if (!quotaBefore.allowed) {
      return quotaErrorResponse(quotaBefore);
    }

    const body = (await req.json().catch(() => ({}))) as unknown;
    const language = normalizeLanguage(pickString(body, "language", "nb"));
    const level = pickString(body, "level", "A2");
    const sourceMode = pickString(body, "sourceMode", "topic");
    const topic = pickString(body, "topic");
    const sourceText = pickString(body, "sourceText");
    const focus = pickString(body, "focus", "language");
    const questionMode = pickQuestionMode(pickString(body, "questionMode", "mixed"));
    const count = Math.max(3, Math.min(12, Math.trunc(pickNumber(body, "count", 6))));
    const seconds = Math.max(10, Math.min(120, Math.trunc(pickNumber(body, "seconds", 30))));

    if (sourceMode === "text" && sourceText.length < 40) {
      return Response.json({ error: "Add a little more lesson text first." }, { status: 400 });
    }
    if (sourceMode !== "text" && !topic) {
      return Response.json({ error: "Missing topic." }, { status: 400 });
    }

    const prompt =
      `You are creating a classroom quiz for 321school.\n` +
      `${getLanguageInstruction(language)}\n` +
      `Learner level: ${level}\n` +
      `Number of questions: ${count}\n` +
      `Default seconds per question: ${seconds}\n` +
      `Category: ${getFocusInstruction(focus)}\n\n` +
      `Question format: ${
        questionMode === "multiple_choice"
          ? "Only multiple choice questions."
          : questionMode === "true_false"
            ? "Only true/false questions."
            : "Use a good mix of multiple choice and true/false questions."
      }\n\n` +
      `Source:\n` +
      (sourceMode === "text" ? sourceText : topic) +
      `\n\nRules:\n` +
      `- Create a useful classroom quiz, not a worksheet.\n` +
      (questionMode === "mixed" ? `- Use a mix of multiple_choice and true_false when it fits.\n` : `- Every question must use type "${questionMode}".\n`) +
      `- Multiple choice must have 3 or 4 options.\n` +
      `- True/false must have exactly 2 options, written in the target language.\n` +
      `- Include one short explanation per question.\n` +
      `- Make distractors plausible but clearly wrong.\n` +
      `- Return JSON only. No markdown.\n\n` +
      `Return this exact shape:\n` +
      `{\n` +
      `  "title": "string",\n` +
      `  "description": "string",\n` +
      `  "level": "string",\n` +
      `  "language": "string",\n` +
      `  "questions": [\n` +
      `    {\n` +
      `      "type": "multiple_choice",\n` +
      `      "question": "string",\n` +
      `      "options": ["string", "string", "string", "string"],\n` +
      `      "correctIndex": 0,\n` +
      `      "explanation": "string",\n` +
      `      "seconds": ${seconds}\n` +
      `    }\n` +
      `  ]\n` +
      `}`;

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      text: { format: { type: "json_object" } },
      input: [
        {
          role: "system",
          content: "Create editable classroom quizzes. Return valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = response.output_text?.trim();
    if (!raw) return Response.json({ error: "Empty response from model." }, { status: 500 });

    const jsonText = extractJsonObject(raw);
    if (!jsonText) return Response.json({ error: "Could not find JSON in model response.", raw }, { status: 500 });

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return Response.json({ error: "Invalid JSON from model.", raw }, { status: 500 });
    }

    if (!isRecord(parsed)) return Response.json({ error: "Model returned non-object JSON.", raw }, { status: 500 });

    const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
      .map((item, index) => cleanQuestion(item, index, seconds))
      .filter((item): item is QuizQuestion => item !== null)
      .slice(0, count);

    if (questions.length < 3) {
      return Response.json({ error: "Model response missing usable questions.", raw }, { status: 500 });
    }

    await consumeFeatureAdmin({
      uid: user.uid,
      feature: "producer_create_quiz",
    });

    const quotaAfter = await getFeatureStatusAdmin({
      uid: user.uid,
      role: user.role,
      plan: user.plan,
      feature: "producer_create_quiz",
    });

    return Response.json({
      title: pickString(parsed, "title", topic || "321 quiz"),
      description: pickString(parsed, "description", ""),
      level: pickString(parsed, "level", level),
      language: pickString(parsed, "language", language),
      sourceMode,
      topic,
      sourceText: sourceMode === "text" ? sourceText : "",
      focus,
      questionMode,
      questions,
      quota: {
        feature: "producer_create_quiz",
        bucket: quotaAfter.bucket,
        limit: quotaAfter.limit,
        used: quotaAfter.used,
        remaining: quotaAfter.remaining,
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "EMAIL_VERIFICATION_REQUIRED") {
      return emailVerificationRequiredWebResponse();
    }
    const message = error instanceof Error ? error.message : "Unknown server error";
    console.error("quiz-generator route error:", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
