// app/api/producer/generate-text/route.ts
import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
  getFeatureStatusAdmin,
} from "@/lib/featureGuardAdmin";
import { getEffectivePlan, type AppRole, type PlanKey } from "@/lib/featureAccess";

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

type RequestUserContext = {
  uid: string;
  role: AppRole | string;
  plan: PlanKey | string;
};

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

  return {
    uid,
    role: data?.role ?? "anonymous",
    plan,
  };
}

function resolveLanguageName(code: string): string {
  const c = code.toLowerCase();
  if (c === "nb" || c === "no") return "Norwegian";
  if (c === "en") return "English";
  if (c === "pt") return "Portuguese";
  return code;
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing API key" }, { status: 500 });
    }

    const user = await getRequestUserContext(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = await getFeatureStatusAdmin({
      uid: user.uid,
      role: user.role,
      plan: user.plan,
      feature: "producer_create_lesson",
    });

    if (!status.allowed) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }

    const body = (await req.json()) as GenerateTextBody;

    const level = body.level || "A2";
    const languageName = resolveLanguageName(body.language || "en");
    const topic = body.topic || "Untitled";
    const textType = body.textType || "Story";
    const textLength = body.textLength || 200;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const resp = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: [
        {
          role: "system",
          content: `You create CEFR texts. Return JSON only. Output must be in ${languageName}.`,
        },
        {
          role: "user",
          content: `
Write a ${textType} text.

Language: ${languageName}
Level: ${level}
Topic: ${topic}
Length: ${textLength} words

Return:
{
  "title": "...",
  "text": "..."
}
          `,
        },
      ],
    });

    const out = resp.output_text?.trim() || "";
    const parsed = JSON.parse(out) as GenerateTextResult;

    return NextResponse.json(parsed);
  } catch (err: unknown) {
  const message =
    err instanceof Error ? err.message : "Unknown error";

  return NextResponse.json({ error: message }, { status: 500 });
}
}
