import "server-only";

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
  const [quizSnap, wordwallSnap, imageSnap, pollSnap] = await Promise.all([
    db.collection("quizSessions").where("code", "==", code).limit(1).get(),
    db.collection("wordwallSessions").where("code", "==", code).limit(1).get(),
    db.collection("imageSessions").where("code", "==", code).limit(1).get(),
    db.collection("pollSessions").where("code", "==", code).limit(1).get(),
  ]);

  const quizDoc = quizSnap.docs[0];
  if (quizDoc) {
    return NextResponse.json({
      ok: true,
      type: "quiz",
      sessionId: quizDoc.id,
      code,
    });
  }

  const wordwallDoc = wordwallSnap.docs[0];
  if (wordwallDoc) {
    return NextResponse.json({
      ok: true,
      type: "wordwall",
      sessionId: wordwallDoc.id,
      code,
    });
  }

  const imageDoc = imageSnap.docs[0];
  if (imageDoc) {
    return NextResponse.json({
      ok: true,
      type: "image",
      sessionId: imageDoc.id,
      code,
    });
  }

  const pollDoc = pollSnap.docs[0];
  if (pollDoc) {
    return NextResponse.json({
      ok: true,
      type: "poll",
      sessionId: pollDoc.id,
      code,
    });
  }

  return NextResponse.json({ error: "Fant ingen liveaktivitet med denne koden." }, { status: 404 });
}
