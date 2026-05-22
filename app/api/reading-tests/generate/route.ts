import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
  getFeatureStatusAdmin,
  consumeFeatureAdmin,
} from "@/lib/featureGuardAdmin";
import { getEffectivePlan, type AppRole, type PlanKey } from "@/lib/featureAccess";

export const runtime = "nodejs";

type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

type ReadingTestTaskType = "mcq" | "true_false" | "best_summary";

type GenerateReadingTestBody = {
  level?: string;
  language?: string;
  topic?: string;
  audience?: string;
  minWords?: number;
  maxWords?: number;
  enabledTaskTypes?: ReadingTestTaskType[];
};

type ReadingMcqTask = {
  prompt: string;
  options: [string, string, string];
  correctAnswer: string;
};

type ReadingTrueFalseTask = {
  prompt: string;
  correctAnswer: boolean;
};

type ReadingBestSummaryTask = {
  prompt: string;
  options: [string, string, string];
  correctAnswer: string;
};

type ReadingFeedback = {
  learner: string;
  adult: string;
  nextStep: string;
};

type ReadingTestResponse = {
  title: string;
  cefrLevel: CefrLevel;
  language: string;
  topic: string;
  wordCount: number;
  text: string;
  tasks: {
    mcq: ReadingMcqTask[];
    trueFalse: ReadingTrueFalseTask[];
    bestSummary: ReadingBestSummaryTask;
  };
  feedback: ReadingFeedback;
};

type OpenAIErrorLike = { message?: string; code?: string | number };

type RequestUserContext = {
  uid: string;
  role: AppRole | string;
  plan: PlanKey | string;
};

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as OpenAIErrorLike).message;
    if (typeof m === "string") return m;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function clampNumber(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeLevel(v: unknown): CefrLevel {
  return v === "A1" ||
    v === "A2" ||
    v === "B1" ||
    v === "B2" ||
    v === "C1" ||
    v === "C2"
    ? v
    : "A2";
}

function safeString(v: unknown, fallback: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s || fallback;
}

function normalizeWordRange(level: CefrLevel, minWords?: number, maxWords?: number) {
  const defaults: Record<CefrLevel, { min: number; max: number }> = {
    A1: { min: 60, max: 90 },
    A2: { min: 120, max: 180 },
    B1: { min: 120, max: 180 },
    B2: { min: 150, max: 220 },
    C1: { min: 180, max: 260 },
    C2: { min: 180, max: 260 },
  };

  const base = defaults[level];
  const min = clampNumber(minWords, base.min, 40, 400);
  const max = clampNumber(maxWords, base.max, min, 500);

  return { min, max };
}

function countWords(text: string): number {
  const t = (text || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function isTuple3(v: unknown): v is [string, string, string] {
  return Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "string");
}

function normalizeTaskTypes(v: unknown): ReadingTestTaskType[] {
  const valid: ReadingTestTaskType[] = ["mcq", "true_false", "best_summary"];

  if (!Array.isArray(v)) {
    return ["mcq", "true_false", "best_summary"];
  }

  const picked = v.filter(
    (x): x is ReadingTestTaskType => valid.includes(x as ReadingTestTaskType)
  );

  return picked.length > 0
    ? Array.from(new Set(picked))
    : ["mcq", "true_false", "best_summary"];
}

function normalizeLanguageCode(v: unknown): string {
  const raw = safeString(v, "nb").toLowerCase();

  if (raw === "no") return "nb";
  if (raw === "pt-br") return "pt-BR";
  if (raw === "pt-pt") return "pt-PT";

  if (
    raw === "nb" ||
    raw === "nn" ||
    raw === "en" ||
    raw === "es" ||
    raw === "de" ||
    raw === "fr" ||
    raw === "it" ||
    raw === "pt"
  ) {
    return raw;
  }

  if (/^[a-z]{2}(-[a-z]{2})?$/i.test(raw)) {
    return raw;
  }

  return "nb";
}

function getLanguageInstruction(language: string): string {
  switch (language) {
    case "nb":
      return "Use Norwegian Bokmål for the entire response. All fields inside the JSON that contain human-readable text must be written in Norwegian Bokmål.";
    case "nn":
      return "Use Norwegian Nynorsk for the entire response. All fields inside the JSON that contain human-readable text must be written in Norwegian Nynorsk.";
    case "en":
      return "Use English for the entire response. All fields inside the JSON that contain human-readable text must be written in English.";
    case "pt":
      return "Use Portuguese for the entire response. All fields inside the JSON that contain human-readable text must be written in Portuguese.";
    case "pt-BR":
      return "Use Brazilian Portuguese for the entire response. All fields inside the JSON that contain human-readable text must be written in Brazilian Portuguese.";
    case "pt-PT":
      return "Use European Portuguese for the entire response. All fields inside the JSON that contain human-readable text must be written in European Portuguese.";
    case "es":
      return "Use Spanish for the entire response. All fields inside the JSON that contain human-readable text must be written in Spanish.";
    case "de":
      return "Use German for the entire response. All fields inside the JSON that contain human-readable text must be written in German.";
    case "fr":
      return "Use French for the entire response. All fields inside the JSON that contain human-readable text must be written in French.";
    case "it":
      return "Use Italian for the entire response. All fields inside the JSON that contain human-readable text must be written in Italian.";
    default:
      return `Use the language with code "${language}" for the entire response. All fields inside the JSON that contain human-readable text must be written in that language.`;
  }
}

function getAudienceInstruction(audience: string, language: string): string {
  const normalizedAudience = audience.trim().toLowerCase();

  if (language === "nb" || language === "nn") {
    switch (normalizedAudience) {
      case "children":
        return "Målgruppe: barn.";
      case "teenagers":
        return "Målgruppe: ungdom.";
      case "adult learners":
        return "Målgruppe: voksne språkinnlærere.";
      default:
        return "Målgruppe: språkinnlærere.";
    }
  }

  switch (normalizedAudience) {
    case "children":
      return "Audience: children.";
    case "teenagers":
      return "Audience: teenagers.";
    case "adult learners":
      return "Audience: adult language learners.";
    default:
      return "Audience: language learners.";
  }
}

function isReadingTestResponse(v: unknown): v is ReadingTestResponse {
  if (!v || typeof v !== "object") return false;

  const o = v as Record<string, unknown>;
  const tasks = o.tasks as Record<string, unknown> | undefined;
  const feedback = o.feedback as Record<string, unknown> | undefined;

  if (!tasks || typeof tasks !== "object") return false;
  if (!feedback || typeof feedback !== "object") return false;

  const mcq = tasks.mcq;
  const trueFalse = tasks.trueFalse;
  const bestSummary = tasks.bestSummary as Record<string, unknown> | undefined;

  const mcqOk =
    Array.isArray(mcq) &&
    mcq.length > 0 &&
    mcq.every((task) => {
      if (!task || typeof task !== "object") return false;
      const t = task as Record<string, unknown>;
      return (
        typeof t.prompt === "string" &&
        isTuple3(t.options) &&
        typeof t.correctAnswer === "string"
      );
    });

  const trueFalseOk =
    Array.isArray(trueFalse) &&
    trueFalse.length > 0 &&
    trueFalse.every((task) => {
      if (!task || typeof task !== "object") return false;
      const t = task as Record<string, unknown>;
      return typeof t.prompt === "string" && typeof t.correctAnswer === "boolean";
    });

  return (
    typeof o.title === "string" &&
    typeof o.cefrLevel === "string" &&
    typeof o.language === "string" &&
    typeof o.topic === "string" &&
    typeof o.wordCount === "number" &&
    typeof o.text === "string" &&
    mcqOk &&
    trueFalseOk &&
    !!bestSummary &&
    typeof bestSummary.prompt === "string" &&
    isTuple3(bestSummary.options) &&
    typeof bestSummary.correctAnswer === "string" &&
    typeof feedback.learner === "string" &&
    typeof feedback.adult === "string" &&
    typeof feedback.nextStep === "string"
  );
}

function buildTaskInstructions(enabledTaskTypes: ReadingTestTaskType[]) {
  const blocks: string[] = [];

  if (enabledTaskTypes.includes("mcq")) {
    blocks.push(`Multiple choice:
- Create 3 multiple choice questions.
- Each question must have exactly 3 options.
- Only 1 option is correct.
- The correctAnswer must be exactly equal to one of the options.
- The wrong options must be plausible but clearly wrong based on the text.`);
  }

  if (enabledTaskTypes.includes("true_false")) {
    blocks.push(`True or false:
- Create 3 true/false statements.
- Each statement must be clearly true or clearly false based on the text.
- The prompt must be the statement itself.
- correctAnswer must be a boolean: true or false.`);
  }

  if (enabledTaskTypes.includes("best_summary")) {
    blocks.push(`Best summary:
- Create exactly 3 short summaries of the whole text.
- Only 1 summary correctly represents the main idea.
- The 2 wrong summaries should be believable but incorrect.
- The correctAnswer must be exactly equal to one of the options.`);
  }

  return blocks.join("\n\n");
}

function buildOutputShape(level: CefrLevel, language: string, topic: string) {
  return `Return valid JSON in exactly this structure:
{
  "title": "",
  "cefrLevel": "${level}",
  "language": "${language}",
  "topic": "${topic}",
  "wordCount": 0,
  "text": "",
  "tasks": {
    "mcq": [
      {
        "prompt": "",
        "options": ["", "", ""],
        "correctAnswer": ""
      }
    ],
    "trueFalse": [
      {
        "prompt": "",
        "correctAnswer": true
      }
    ],
    "bestSummary": {
      "prompt": "",
      "options": ["", "", ""],
      "correctAnswer": ""
    }
  },
  "feedback": {
    "learner": "",
    "adult": "",
    "nextStep": ""
  }
}`;
}

async function getRequestUserContext(req: Request): Promise<RequestUserContext | null> {
  const authHeader =
    req.headers.get("authorization") || req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) return null;

  const idToken = authHeader.slice(7).trim();
  if (!idToken) return null;

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(idToken);
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

function mapStatusToResponse(
  status: Awaited<ReturnType<typeof getFeatureStatusAdmin>>
) {
  if (status.reason === "teacher_only") {
    return NextResponse.json(
      {
        ok: false,
        error: "This feature is only available for teachers.",
        reason: status.reason,
      },
      { status: 403 }
    );
  }

  if (status.reason === "limit_reached") {
    return NextResponse.json(
      {
        ok: false,
        error: "You have reached your monthly limit.",
        reason: status.reason,
      },
      { status: 403 }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: "This feature requires an upgraded plan.",
      reason: status.reason ?? "upgrade_required",
    },
    { status: 403 }
  );
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY is missing in environment variables." },
        { status: 500 }
      );
    }

    const user = await getRequestUserContext(req);

    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const status = await getFeatureStatusAdmin({
      uid: user.uid,
      role: user.role,
      plan: user.plan,
      feature: "producer_create_reading_test",
    });

    if (!status.allowed) {
      return mapStatusToResponse(status);
    }

    const body = (await req.json()) as GenerateReadingTestBody;

    const level = normalizeLevel(body.level);
    const language = normalizeLanguageCode(body.language);
    const topic = safeString(body.topic, language === "nb" ? "dagligliv" : "everyday life");
    const audience = safeString(body.audience, "learners");
    const enabledTaskTypes = normalizeTaskTypes(body.enabledTaskTypes);

    const { min, max } = normalizeWordRange(level, body.minWords, body.maxWords);

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const system = `
You are an expert language teacher and reading test writer for 321skole.
You must return valid JSON only and nothing else.
Do not use markdown fences.
Do not add commentary before or after the JSON.
Keep all output internally consistent.
Make distractors plausible, not silly.
Make sure the correct answer can be justified from the text.
Do not return explanations outside the JSON.
The reading text, title, prompts, options, summaries and feedback must all be written in the requested target language.
`.trim();

    const userPrompt = `
Create one reading test.

Target language:
- Language code: "${language}"
- ${getLanguageInstruction(language)}

Requirements:
- Write one coherent reading text.
- The text must be between ${min} and ${max} words.
- Topic: ${topic}
- CEFR level: ${level}
- ${getAudienceInstruction(audience, language)}
- Use vocabulary and sentence structure appropriate for CEFR ${level}.
- Keep the text natural, clear, engaging, and age-appropriate.
- The title must also be written in the target language.
- All task prompts must be written in the target language.
- All answer options must be written in the target language.
- All feedback fields must be written in the target language.

Enabled task types selected by the teacher:
${enabledTaskTypes.join(", ")}

${buildTaskInstructions(enabledTaskTypes)}

Also provide:
- short feedback for the learner
- short guidance for a parent or teacher
- one suggested next step

Important:
- Only create these task types: mcq, trueFalse and bestSummary
- Do not create wordChoice, sentencePlacement, fillInWord, shortAnswer or open tasks
- Do not invent extra top-level fields
- Set "wordCount" to the text word count if possible
- Do not translate the language code itself
- The output must be a single valid JSON object

${buildOutputShape(level, language, topic)}
`.trim();

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const resp = await client.responses.create({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    });

    const out = (resp.output_text || "").trim();

    if (!out) {
      return NextResponse.json(
        { ok: false, error: "Empty response from model." },
        { status: 500 }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(out);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "Model did not return valid JSON.",
          raw: out.slice(0, 3000),
        },
        { status: 500 }
      );
    }

    if (!isReadingTestResponse(parsed)) {
      return NextResponse.json(
        {
          ok: false,
          error: "JSON response is missing fields or has an invalid structure.",
          raw: JSON.stringify(parsed).slice(0, 3000),
        },
        { status: 500 }
      );
    }

    const normalized: ReadingTestResponse = {
      ...parsed,
      language,
      cefrLevel: level,
      topic,
      wordCount: countWords(parsed.text),
    };

    await consumeFeatureAdmin({
      uid: user.uid,
      feature: "producer_create_reading_test",
    });

    const quotaAfter = await getFeatureStatusAdmin({
      uid: user.uid,
      role: user.role,
      plan: user.plan,
      feature: "producer_create_reading_test",
    });

    return NextResponse.json({
      ok: true,
      readingTest: normalized,
      quota: {
        feature: "producer_create_reading_test",
        bucket: quotaAfter.bucket,
        limit: quotaAfter.limit,
        used: quotaAfter.used,
        remaining: quotaAfter.remaining,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(err) || "Unknown error" },
      { status: 500 }
    );
  }
}
