import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { isRecord, normalizePollOptions, safeString } from "@/lib/pollSessions";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function safeDocId(value: string) {
  return value.replace(/[^\w-]/g, "").slice(0, 120);
}

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await ctx.params;
    if (!sessionId) return json({ error: "Missing sessionId" }, 400);
    const body = (await req.json().catch(() => ({}))) as { choice?: unknown; participantId?: unknown };
    const choice = safeString(body.choice);
    const participantId = safeDocId(safeString(body.participantId));
    if (!choice) return json({ error: "Velg et alternativ først." }, 400);
    if (!participantId) return json({ error: "Missing participantId" }, 400);

    const { db } = getAdmin();
    const sessionRef = db.collection("pollSessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) return json({ error: "Session not found" }, 404);
    const session = sessionSnap.data() ?? {};
    if (session.status === "finished") return json({ error: "Avstemmingen er avsluttet." }, 409);
    const endsAtMs = isRecord(session.endsAt) && typeof session.endsAt.toMillis === "function" ? session.endsAt.toMillis() : 0;
    if (endsAtMs && Date.now() >= endsAtMs) return json({ error: "Tiden er ute." }, 409);
    const options = normalizePollOptions(session.options);
    if (!options.includes(choice)) return json({ error: "Ugyldig alternativ." }, 400);

    await sessionRef.collection("votes").doc(participantId).set({
      choice,
      participantId,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await sessionRef.set({ updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save vote";
    return json({ error: message }, 500);
  }
}
