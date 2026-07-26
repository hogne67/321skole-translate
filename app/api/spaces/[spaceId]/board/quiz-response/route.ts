import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function memberDocId(spaceId: string, uid: string) {
  return `${spaceId}_${uid}`;
}

function numberFromRecord(record: unknown, key: number): number | null {
  if (!record || typeof record !== "object") return null;
  const value = (record as Record<string, unknown>)[String(key)];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function POST(req: Request, ctx: { params: Promise<{ spaceId: string }> }) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { spaceId } = await ctx.params;
    if (!spaceId) return json({ error: "Missing spaceId" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const body = (await req.json().catch(() => ({}))) as {
      sessionId?: unknown;
      quizQuestionIndex?: unknown;
      quizChoice?: unknown;
      displayName?: unknown;
      groupName?: unknown;
      emoji?: unknown;
    };

    const sessionId = safeString(body.sessionId);
    const quizChoice = safeString(body.quizChoice).slice(0, 500);
    const displayName = safeString(body.displayName).slice(0, 120);
    const groupName = safeString(body.groupName).slice(0, 120);
    const emoji = safeString(body.emoji).slice(0, 16);
    const quizQuestionIndex =
      typeof body.quizQuestionIndex === "number" && Number.isInteger(body.quizQuestionIndex)
        ? body.quizQuestionIndex
        : -1;

    if (!sessionId) return json({ error: "Missing sessionId" }, 400);
    if (!quizChoice) return json({ error: "Missing quizChoice" }, 400);
    if (quizQuestionIndex < 0) return json({ error: "Missing quizQuestionIndex" }, 400);

    const memberSnap = await db.collection("spaceMembers").doc(memberDocId(spaceId, uid)).get();
    const spaceSnap = await db.collection("spaces").doc(spaceId).get();
    const userSnap = await db.collection("users").doc(uid).get();

    const space = spaceSnap.data() ?? {};
    const user = userSnap.data() ?? {};
    const roles = user.roles && typeof user.roles === "object" ? (user.roles as Record<string, unknown>) : {};
    const isOwner = typeof space.ownerId === "string" && space.ownerId === uid;
    const isAdmin = user.role === "admin" || roles.admin === true;

    if (!memberSnap.exists && !isOwner && !isAdmin) {
      return json({ error: "Not a member of this space" }, 403);
    }

    const stateSnap = await db.collection("spaces").doc(spaceId).collection("board").doc("state").get();
    const state = stateSnap.data() ?? {};

    if (state.active !== true) return json({ error: "Board is not live" }, 409);
    if (state.sessionId !== sessionId) return json({ error: "Board session changed" }, 409);
    const mode = typeof state.mode === "string" ? state.mode.trim().toLowerCase() : "";
    if (mode !== "quiz") return json({ error: "Board is not accepting quiz responses" }, 409);
    const data = state.data && typeof state.data === "object" ? (state.data as Record<string, unknown>) : {};
    if (data.quizShowAnswer === true) return json({ error: "Answer is locked" }, 409);

    const timerStartedAt = typeof state.timerStartedAt === "number" ? state.timerStartedAt : null;
    const timerTotalSec = typeof state.timerTotalSec === "number" && state.timerTotalSec > 0 ? state.timerTotalSec : null;
    const questionStartedAt =
      timerStartedAt ??
      numberFromRecord(data.quizQuestionStartedAtByIndex, quizQuestionIndex) ??
      (typeof data.quizQuestionStartedAt === "number" ? data.quizQuestionStartedAt : null);
    const responseTimeMs = questionStartedAt ? Math.max(0, Date.now() - questionStartedAt) : null;
    const questionLimitMs = timerTotalSec ? timerTotalSec * 1000 : null;

    const responseId = `${sessionId}_quiz_${quizQuestionIndex}_${uid}`;
    const responseRef = db.collection("spaces").doc(spaceId).collection("boardResponses").doc(responseId);
    const responseSnap = await responseRef.get();
    await responseRef.set({
      sessionId,
      uid,
      displayName: displayName || groupName || "Elev",
      ...(groupName ? { groupName } : {}),
      ...(emoji ? { emoji } : {}),
      quizQuestionIndex,
      quizChoice,
      ...(responseTimeMs !== null ? { quizResponseMs: responseTimeMs } : {}),
      ...(questionLimitMs !== null ? { quizResponseLimitMs: questionLimitMs } : {}),
      ...(responseSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return json({ ok: true, responseId: responseRef.id, quizResponseMs: responseTimeMs, quizResponseLimitMs: questionLimitMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save quiz response";
    return json({ error: message }, 500);
  }
}
