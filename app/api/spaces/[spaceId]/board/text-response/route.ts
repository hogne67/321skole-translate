import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

type NoteColor = "amber" | "emerald" | "sky" | "rose" | "violet";

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

function isNoteColor(value: unknown): value is NoteColor {
  return value === "amber" || value === "emerald" || value === "sky" || value === "rose" || value === "violet";
}

function memberDocId(spaceId: string, uid: string) {
  return `${spaceId}_${uid}`;
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
      displayName?: unknown;
      groupName?: unknown;
      text?: unknown;
      noteColor?: unknown;
    };

    const sessionId = safeString(body.sessionId);
    const text = safeString(body.text).slice(0, 2000);
    const displayName = safeString(body.displayName).slice(0, 120);
    const groupName = safeString(body.groupName).slice(0, 120);
    const noteColor = isNoteColor(body.noteColor) ? body.noteColor : "amber";

    if (!sessionId) return json({ error: "Missing sessionId" }, 400);
    if (!text) return json({ error: "Missing text" }, 400);

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
    if (state.mode && state.mode !== "text") return json({ error: "Board is not accepting text responses" }, 409);

    const responseRef = db.collection("spaces").doc(spaceId).collection("boardResponses").doc();
    await responseRef.set({
      sessionId,
      uid,
      displayName: displayName || groupName || "Elev",
      ...(groupName ? { groupName } : {}),
      text,
      noteColor,
      createdAt: FieldValue.serverTimestamp(),
    });

    return json({ ok: true, responseId: responseRef.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save board response";
    return json({ error: message }, 500);
  }
}
