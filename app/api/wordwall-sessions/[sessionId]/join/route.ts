import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { safeString } from "@/lib/wordwallSessions";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await ctx.params;
    if (!sessionId) return json({ error: "Missing sessionId" }, 400);

    const body = (await req.json().catch(() => ({}))) as { participantId?: unknown; displayName?: unknown };
    const participantId = safeString(body.participantId).slice(0, 120);
    const displayName = safeString(body.displayName).replace(/\s+/g, " ").slice(0, 32);
    if (!participantId) return json({ error: "Missing participantId" }, 400);

    const { db } = getAdmin();
    const sessionRef = db.collection("wordwallSessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) return json({ error: "Session not found" }, 404);

    await sessionRef.collection("participants").doc(participantId).set(
      {
        participantId,
        displayName,
        joinedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not join wordwall";
    return json({ error: message }, 500);
  }
}
