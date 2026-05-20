import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type Body = {
  attemptId?: string;
  worksheet?: unknown;
  answersByTaskId?: unknown;
  auto?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(req: Request) {
  try {
    const authHeader =
      req.headers.get("authorization") ||
      req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.slice(7).trim();
    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const body = (await req.json()) as Body;
    const { attemptId, worksheet, answersByTaskId, auto } = body ?? {};

    if (!worksheet || !isRecord(worksheet) || !answersByTaskId || !isRecord(answersByTaskId)) {
      return NextResponse.json({ ok: false, error: "Missing data" }, { status: 400 });
    }

    const attemptsRef = db.collection("users").doc(uid).collection("fractionAttempts");
    const ref =
      typeof attemptId === "string" && attemptId.trim()
        ? attemptsRef.doc(attemptId.trim())
        : attemptsRef.doc();

    const existingSnap = await ref.get();
    const isNew = !existingSnap.exists;

    await ref.set(
      {
        ownerUid: uid,
        mode: "practice",
        worksheet,
        answersByTaskId,
        auto: auto ?? null,
        updatedAt: new Date(),
        ...(isNew ? { createdAt: new Date() } : {}),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (err) {
    console.error("save-fraction-attempt failed:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to save fraction attempt" },
      { status: 500 }
    );
  }
}
