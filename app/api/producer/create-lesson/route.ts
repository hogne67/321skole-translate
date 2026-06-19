// app/api/producer/create-lesson/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { createHash } from "crypto";
import { getAdmin } from "@/lib/firebaseAdmin";

type Body = {
  title: string;
  level: string;
  language: string;
  prompt: string;
  topic?: string;
  textType: string;
  sourceText: string;
  tasks: unknown[];
  aiQuality?: {
    factCheckRequired?: boolean;
    factChecked?: boolean;
    factCheckReason?: string;
    generatedWith?: string;
  };
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function textHash(text: string): string {
  return createHash("sha256").update(text.trim().replace(/\s+/g, " "), "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function POST(req: Request) {
  try {
    const authHeader =
      req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      return json({ error: "Not signed in." }, 401);
    }

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const body = (await req.json()) as Partial<Body>;

    const title = String(body.title || "").trim();
    const sourceText = String(body.sourceText || "").trim();

    if (!title) return json({ error: "Title is required." }, 400);
    if (!sourceText) return json({ error: "Source text is empty." }, 400);

    const lessonRef = db.collection("lessons").doc();

    const cleanTextType = String(body.textType || "")
      .trim()
      .replace(/^"+|"+$/g, "")
      .trim();
    const aiQualityInput = isRecord(body.aiQuality) ? body.aiQuality : {};
    const factCheckRequired = aiQualityInput.factCheckRequired === true;
    const factChecked = aiQualityInput.factChecked === true;
    const factCheckReason =
      typeof aiQualityInput.factCheckReason === "string" ? aiQualityInput.factCheckReason : "";
    const generatedWith =
      typeof aiQualityInput.generatedWith === "string" ? aiQualityInput.generatedWith : "unknown";
    const aiQuality = {
      factCheckRequired,
      factChecked,
      factCheckReason,
      generatedWith,
      checkedTextHash: factChecked ? textHash(sourceText) : null,
      checkedAt: factChecked ? FieldValue.serverTimestamp() : null,
    };

    await lessonRef.set({
      ownerId: uid,
      status: "draft",
      title,
      level: String(body.level || "A2"),
      language: String(body.language || "nb"),

      topic: String(body.topic || body.prompt || ""),
      prompt: String(body.prompt || ""),

      textType: cleanTextType,
      texttype: cleanTextType, // legacy-compat

      estimatedMinutes: 20,
      releaseMode: "ALL_AT_ONCE",

      sourceText,
      tasks: Array.isArray(body.tasks) ? body.tasks : [],
      aiQuality,

      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      source: "producer-texts-new",

      deletedAt: null,
      activePublishedId: null,
    });

    return json({ id: lessonRef.id }, 200);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Unknown error" }, 500);
  }
}
