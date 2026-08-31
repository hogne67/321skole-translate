import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { normalizeStudentAccessMode } from "@/lib/studentAccessMode";
import { emailVerificationRequiredResponse, needsEmailVerification } from "@/lib/emailVerificationGuard";

function readBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function POST(req: NextRequest) {
  try {
    const token = readBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Missing bearer token." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      studentAccessMode?: unknown;
    };
    const studentAccessMode = normalizeStudentAccessMode(body.studentAccessMode);
    if (!studentAccessMode) {
      return NextResponse.json({ error: "Invalid studentAccessMode." }, { status: 400 });
    }

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    if (needsEmailVerification(decoded)) {
      return emailVerificationRequiredResponse();
    }

    const uid = decoded.uid;
    if (!uid) {
      return NextResponse.json({ error: "Invalid token uid." }, { status: 401 });
    }

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : null;
    const role = typeof userData?.role === "string" ? userData.role : "student";

    if (role !== "student") {
      return NextResponse.json({ error: "Only student accounts can change student access mode." }, { status: 403 });
    }

    await userRef.set(
      {
        role: "student",
        roles: {
          student: true,
        },
        studentAccessMode,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, studentAccessMode });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not update student access mode.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
