import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const authHeader =
      req.headers.get("authorization") ||
      req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const idToken = authHeader.slice(7).trim();
    const { auth, db } = getAdmin();

    const decoded = await auth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const body = await req.json();
    const { worksheet, answersByTaskId, auto, aiFeedback } = body ?? {};

    if (!worksheet || !answersByTaskId) {
      return NextResponse.json(
        { ok: false, error: "Missing data" },
        { status: 400 }
      );
    }

    const ref = db
      .collection("users")
      .doc(uid)
      .collection("geometryAttempts")
      .doc();

    await ref.set({
      ownerUid: uid,
      mode: "practice",
      worksheet,
      answersByTaskId,
      auto: auto ?? null,
      aiFeedback: aiFeedback ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({
      ok: true,
      id: ref.id,
    });
  } catch (err) {
    console.error("save-attempt failed:", err);

    return NextResponse.json(
      { ok: false, error: "Failed to save attempt" },
      { status: 500 }
    );
  }
}