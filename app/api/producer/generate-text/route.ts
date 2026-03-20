// app/api/producer/generate-text/route.ts
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
  getFeatureStatusAdmin,
  consumeFeatureAdmin,
} from "@/lib/featureGuardAdmin";
import type { AppRole, PlanKey } from "@/lib/featureAccess";

export const runtime = "nodejs";

type GenerateTextBody = {
  level?: string;
  language?: string;
  topic?: string;
  textType?: string;
  textLength?: number;
};

type GenerateTextResult = {
  title: string;
  text: string;
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

    const body = (await req.json()) as GenerateTextBody;

    const level = String(body.level || "A2").trim();
    const language = String(body.language || "en").trim();
    const topic = String(body.topic || "Untitled topic").trim();
    const textType = String(body.textType || "Everyday story").trim();
    const textLength = Number(body.textLength || 260);

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const system = `
Du er en profesjonell innholdsprodusent for språkinnlæring (CEFR) for 321skole.
Du må returnere ren JSON og ingenting annet.
`.trim();

    const userPrompt = `
Skriv EN tekst på språk: ${language} for nivå: ${level}

Tema: ${topic}
Teksttype: ${textType}
Lengde: ca ${textLength} ord.

Krav:
- Språket skal passe nivå ${level}.
- Teksten skal ha tydelige avsnitt.
- Ikke bruk unødvendig vanskelige egennavn og årstall.

RETURNER EKSAKT gyldig JSON (ingen markdown, ingen ekstra tekst) i denne strukturen:
{
  "title": string,
  "text": string
}
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

    let parsed: GenerateTextResult;
    try {
      parsed = JSON.parse(out) as GenerateTextResult;
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

    const title = String(parsed.title || "").trim() || "New lesson";
    const text = String(parsed.text || "").trim();

    if (!text) {
      return NextResponse.json(
        { ok: false, error: "Mangler 'text' i JSON-respons." },
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
      title,
      text,
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