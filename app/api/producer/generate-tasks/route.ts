// app/api/producer/generate-tasks/route.ts
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
  getFeatureStatusAdmin,
  consumeFeatureAdmin,
} from "@/lib/featureGuardAdmin";
import type { AppRole, PlanKey } from "@/lib/featureAccess";

export const runtime = "nodejs";

type GenerateTasksBody = {
  level?: string;
  language?: string;
  topic?: string;
  textType?: string;
  text?: string;
  tasks?: {
    mcq?: number;
    trueFalse?: number;
    facts?: number;
    reflection?: number;
  };
};

type TasksOnly = {
  multipleChoice: Array<{
    q: string;
    options: [string, string, string, string];
    answerIndex: 0 | 1 | 2 | 3;
  }>;
  trueFalse: Array<{ statement: string; answer: boolean }>;
  writeFacts: string[];
  reflectionQuestions: string[];
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

  const plan = typeof data?.plan === "string" ? data.plan : "free";

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

function resolveLanguageName(code: string): string {
  const c = code.trim().toLowerCase();

  if (c === "nb" || c === "no" || c === "nn") return "Norwegian";
  if (c === "en") return "English";
  if (c === "pt") return "Portuguese";
  if (c === "pt-br") return "Brazilian Portuguese";
  if (c === "es") return "Spanish";
  if (c === "de") return "German";
  if (c === "fr") return "French";
  if (c === "it") return "Italian";
  if (c === "pl") return "Polish";
  if (c === "uk") return "Ukrainian";
  if (c === "ar") return "Arabic";

  return code;
}

function clampCount(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY mangler i .env.local" },
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
      feature: "producer_create_lesson",
    });

    if (!status.allowed) {
      return mapStatusToResponse(status);
    }

    const body = (await req.json()) as GenerateTasksBody;

    const level = String(body.level || "A2").trim();
    const language = String(body.language || "en").trim();
    const languageName = resolveLanguageName(language);
    const topic = String(body.topic || "Untitled topic").trim();
    const textType = String(body.textType || "Everyday story").trim();
    const text = String(body.text || "").trim();

    if (!text) {
      return NextResponse.json(
        { ok: false, error: "Mangler 'text' i request body." },
        { status: 400 }
      );
    }

    const mcq = clampCount(Number(body.tasks?.mcq ?? 6), 0, 20, 6);
    const trueFalse = clampCount(Number(body.tasks?.trueFalse ?? 10), 0, 30, 10);
    const facts = clampCount(Number(body.tasks?.facts ?? 6), 0, 10, 6);
    const reflection = clampCount(Number(body.tasks?.reflection ?? 3), 0, 20, 3);

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const system = `
You create CEFR-adapted reading tasks for 321skole.
You must return valid JSON only.
The output language must strictly follow the requested target language.
Do not default to the UI language, prompt language, instruction language, or topic language unless it matches the requested target language.
All task texts must be written only in the requested target language.
`.trim();

    const userPrompt = `
Create tasks based ONLY on the text below.

Target language: ${languageName}
CEFR level: ${level}
Topic: ${topic}
Text type: ${textType}

SOURCE TEXT (use this as the factual basis):
"""
${text}
"""

Important rules:
- All questions, statements, options, prompts, and task texts must be written in ${languageName}.
- Do not use Norwegian, English, or any other language unless it is the target language.
- Do not let the language of the source text instructions or topic override the target language.
- Base the tasks only on information found in the source text.
- Do not invent facts that are not supported by the source text.
- The task language must match CEFR level ${level}.
- multipleChoice must always contain exactly 4 options.
- answerIndex must point to the correct option.
- trueFalse statements must be checkable against the source text.
- writeFacts should be short task prompts suitable for the learner.
- reflectionQuestions should be open-ended and relevant to the source text.

Return EXACTLY valid JSON with no markdown and no extra text in this structure:
{
  "tasks": {
    "multipleChoice": [
      { "q": string, "options": [string, string, string, string], "answerIndex": 0 }
    ],
    "trueFalse": [
      { "statement": string, "answer": true }
    ],
    "writeFacts": [string],
    "reflectionQuestions": [string]
  }
}

Counts:
- multipleChoice: ${mcq}
- trueFalse: ${trueFalse}
- writeFacts: ${facts}
- reflectionQuestions: ${reflection}
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
        { ok: false, error: "Tomt svar fra modellen." },
        { status: 500 }
      );
    }

    let parsed: { tasks: TasksOnly };
    try {
      parsed = JSON.parse(out) as { tasks: TasksOnly };
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "Modellen returnerte ikke gyldig JSON.",
          raw: out.slice(0, 2000),
        },
        { status: 500 }
      );
    }

    if (!parsed?.tasks) {
      return NextResponse.json(
        { ok: false, error: "Mangler 'tasks' i JSON-respons." },
        { status: 500 }
      );
    }

    await consumeFeatureAdmin({
      uid: user.uid,
      feature: "producer_create_lesson",
    });

    const quotaAfter = await getFeatureStatusAdmin({
      uid: user.uid,
      role: user.role,
      plan: user.plan,
      feature: "producer_create_lesson",
    });

    return NextResponse.json({
      ok: true,
      tasks: parsed.tasks,
      quota: {
        feature: "producer_create_lesson",
        bucket: quotaAfter.bucket,
        limit: quotaAfter.limit,
        used: quotaAfter.used,
        remaining: quotaAfter.remaining,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(err) || "Ukjent feil" },
      { status: 500 }
    );
  }
}