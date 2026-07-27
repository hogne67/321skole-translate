import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ code: string }>;
};

export async function GET(_req: NextRequest, { params }: Params) {
  const { code: rawCode } = await params;
  const code = String(rawCode || "").trim().toUpperCase();

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: "Ugyldig kode." }, { status: 400 });
  }

  const { db } = getAdmin();
  const snap = await db.collection("quizSessions").where("code", "==", code).limit(1).get();
  const doc = snap.docs[0];

  if (!doc) {
    return NextResponse.json({ error: "Fant ingen quiz med denne koden." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    sessionId: doc.id,
    code,
  });
}
