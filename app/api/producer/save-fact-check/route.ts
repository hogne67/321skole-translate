import "server-only";

import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { emailVerificationRequiredResponse, needsEmailVerification } from "@/lib/emailVerificationGuard";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function textHash(text: string): string {
  return createHash("sha256").update(text.trim().replace(/\s+/g, " "), "utf8").digest("hex");
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  try {
    const { auth, db } = getAdmin();

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const decoded = await auth.verifyIdToken(token);
    if (needsEmailVerification(decoded)) {
      return emailVerificationRequiredResponse();
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const lessonId = cleanString(body.lessonId ?? body.id);
    const sourceText = cleanString(body.sourceText);
    const factCheckReport = cleanString(body.factCheckReport);
    const factCheckReason = cleanString(body.factCheckReason) || "factual_text";

    if (!lessonId) return json({ error: "Missing lessonId" }, 400);
    if (!sourceText) return json({ error: "Source text is empty." }, 400);

    const ref = db.doc(`lessons/${lessonId}`);
    const snap = await ref.get();
    if (!snap.exists) return json({ error: "Lesson not found." }, 404);

    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const ownerId = typeof data.ownerId === "string" ? data.ownerId : "";
    if (ownerId && ownerId !== decoded.uid) {
      return json({ error: "Not owner of draft" }, 403);
    }

    await ref.set(
      {
        sourceText,
        text: sourceText,
        aiQuality: {
          factCheckRequired: true,
          factChecked: true,
          factCheckReason,
          generatedWith: "factcheck",
          checkedTextHash: textHash(sourceText),
          checkedAt: FieldValue.serverTimestamp(),
          factCheckReport,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not save fact check.";
    return json({ error: message }, 500);
  }
}
