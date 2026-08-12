import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { isRecord, safeString } from "@/lib/imageSessions";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await ctx.params;
    if (!sessionId) return json({ error: "Missing sessionId" }, 400);
    const body = (await req.json().catch(() => ({}))) as { text?: unknown; participantId?: unknown; displayName?: unknown };
    const text = safeString(body.text).replace(/\s+/g, " ").trim().slice(0, 360);
    if (!text) return json({ error: "Skriv et svar først." }, 400);

    const { db } = getAdmin();
    const sessionRef = db.collection("imageSessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) return json({ error: "Session not found" }, 404);
    const session = sessionSnap.data() ?? {};
    if (session.status === "finished") return json({ error: "Bildeaktiviteten er avsluttet." }, 409);
    const endsAtMs = isRecord(session.endsAt) && typeof session.endsAt.toMillis === "function" ? session.endsAt.toMillis() : 0;
    if (endsAtMs && Date.now() >= endsAtMs) return json({ error: "Tiden er ute." }, 409);

    await sessionRef.collection("submissions").add({
      text,
      displayName: safeString(body.displayName).slice(0, 80),
      participantId: safeString(body.participantId),
      createdAt: FieldValue.serverTimestamp(),
    });
    await sessionRef.set({ updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not submit response";
    return json({ error: message }, 500);
  }
}
