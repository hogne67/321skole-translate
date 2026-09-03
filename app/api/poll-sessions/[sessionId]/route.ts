import "server-only";

import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { isRecord, normalizePollOptions, safeString, type PollVote } from "@/lib/pollSessions";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function asMillis(value: unknown): number {
  if (isRecord(value) && typeof value.toMillis === "function") return value.toMillis();
  if (isRecord(value) && typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function normalizeStatus(value: unknown): "ready" | "active" | "finished" {
  if (value === "finished") return "finished";
  if (value === "ready") return "ready";
  return "active";
}

export async function GET(_req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await ctx.params;
    if (!sessionId) return json({ error: "Missing sessionId" }, 400);

    const { db } = getAdmin();
    const sessionRef = db.collection("pollSessions").doc(sessionId);
    const [sessionSnap, votesSnap] = await Promise.all([
      sessionRef.get(),
      sessionRef.collection("votes").limit(1000).get(),
    ]);
    if (!sessionSnap.exists) return json({ error: "Session not found" }, 404);

    const session = sessionSnap.data() ?? {};
    const options = normalizePollOptions(session.options);
    const counts = new Map(options.map((option) => [option, 0]));
    let total = 0;

    votesSnap.docs.forEach((doc) => {
      const vote = doc.data() as PollVote;
      const choice = safeString(vote.choice);
      if (!counts.has(choice)) return;
      counts.set(choice, (counts.get(choice) ?? 0) + 1);
      total += 1;
    });

    return json({
      session: {
        id: sessionId,
        code: safeString(session.code),
        status: normalizeStatus(session.status),
        question: safeString(session.question, "Hva mener du?"),
        options: options.map((option) => ({ option, count: counts.get(option) ?? 0 })),
        timerSeconds: typeof session.timerSeconds === "number" && session.timerSeconds > 0 ? session.timerSeconds : null,
        endsAt: asMillis(session.endsAt) || null,
        total,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load poll";
    return json({ error: message }, 500);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await ctx.params;
    if (!sessionId) return json({ error: "Missing sessionId" }, 400);

    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    const sessionRef = db.collection("pollSessions").doc(sessionId);
    const [sessionSnap, userSnap] = await Promise.all([
      sessionRef.get(),
      db.collection("users").doc(uid).get(),
    ]);
    if (!sessionSnap.exists) return json({ error: "Session not found" }, 404);

    const session = sessionSnap.data() ?? {};
    const user = userSnap.data() ?? {};
    const roles = isRecord(user.roles) ? user.roles : {};
    const isAdmin = user.role === "admin" || roles.admin === true;
    if (safeString(session.ownerId) !== uid && !isAdmin) return json({ error: "Not allowed" }, 403);
    if (session.status === "finished") return json({ error: "Avstemmingen er avsluttet." }, 409);

    const timerSeconds = typeof session.timerSeconds === "number" && session.timerSeconds > 0 ? session.timerSeconds : null;
    await sessionRef.set({
      status: "active",
      endsAt: timerSeconds ? Timestamp.fromMillis(Date.now() + timerSeconds * 1000) : null,
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start poll";
    return json({ error: message }, 500);
  }
}
