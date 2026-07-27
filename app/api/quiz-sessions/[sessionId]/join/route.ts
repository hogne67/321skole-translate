import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { safeString } from "@/lib/quizSessions";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await ctx.params;
    if (!sessionId) return json({ error: "Missing sessionId" }, 400);
    const body = (await req.json().catch(() => ({}))) as { alias?: unknown; emoji?: unknown; participantId?: unknown };
    const alias = safeString(body.alias).slice(0, 80);
    const emoji = safeString(body.emoji).slice(0, 16);
    const requestedId = safeString(body.participantId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    if (!alias) return json({ error: "Missing alias" }, 400);

    const { db } = getAdmin();
    const sessionRef = db.collection("quizSessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) return json({ error: "Session not found" }, 404);

    const participantRef = requestedId
      ? sessionRef.collection("participants").doc(requestedId)
      : sessionRef.collection("participants").doc();
    await participantRef.set(
      {
        alias,
        emoji,
        joinedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return json({ ok: true, participantId: participantRef.id, alias, emoji });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not join quiz session";
    return json({ error: message }, 500);
  }
}
