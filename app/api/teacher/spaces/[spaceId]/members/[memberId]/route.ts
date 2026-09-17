import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";

type MemberBody = {
  displayName?: unknown;
};

type RouteContext = {
  params: Promise<{
    spaceId: string;
    memberId: string;
  }>;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 80);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isAdminProfile(profile: Record<string, unknown> | null): boolean {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  const roles = profile.roles;
  return isRecord(roles) && roles.admin === true;
}

async function canManageSpaceMembers(params: {
  db: Firestore;
  uid: string;
  spaceId: string;
  profile: Record<string, unknown> | null;
}): Promise<boolean> {
  const { db, uid, spaceId, profile } = params;
  if (isAdminProfile(profile)) return true;

  const spaceSnap = await db.collection("spaces").doc(spaceId).get();
  if (!spaceSnap.exists) return false;

  const space = (spaceSnap.data() ?? {}) as Record<string, unknown>;
  return safeString(space.ownerId) === uid || safeString(space.ownerUid) === uid;
}

async function getActiveStudentDocsForParticipant(
  db: Firestore,
  spaceId: string,
  participantId: string
) {
  const snap = await db.collection("spaceMembers").where("spaceId", "==", spaceId).get();

  return snap.docs.filter((docSnap) => {
    const data = (docSnap.data() ?? {}) as Record<string, unknown>;
    const status = safeString(data.status).toLowerCase();
    return (
      safeString(data.participantId) === participantId &&
      safeString(data.role) === "student" &&
      data.archived !== true &&
      data.active !== false &&
      status !== "removed"
    );
  });
}

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { spaceId, memberId } = await ctx.params;
    if (!spaceId || !memberId) return json({ error: "Missing route params" }, 400);

    const body = (await req.json().catch(() => ({}))) as MemberBody;
    const displayName = cleanName(safeString(body.displayName));
    if (!displayName) return json({ error: "Display name is required" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const requesterSnap = await db.collection("users").doc(uid).get();
    const requesterProfile = requesterSnap.exists
      ? ((requesterSnap.data() ?? {}) as Record<string, unknown>)
      : null;

    const canManage = await canManageSpaceMembers({ db, uid, spaceId, profile: requesterProfile });
    if (!canManage) return json({ error: "No access to manage members for this space" }, 403);

    const memberRef = db.collection("spaceMembers").doc(memberId);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) return json({ error: "Member not found" }, 404);

    const member = (memberSnap.data() ?? {}) as Record<string, unknown>;
    if (safeString(member.spaceId) !== spaceId) return json({ error: "Member is not in this space" }, 400);
    if (safeString(member.role) !== "student") return json({ error: "Only student member names can be edited here" }, 400);

    const memberUid = safeString(member.uid) || safeString(member.userId);
    const participantId = safeString(member.participantId) || memberUid || memberId;
    const activeParticipantDocs = await getActiveStudentDocsForParticipant(db, spaceId, participantId);
    const targetDocs = activeParticipantDocs.length ? activeParticipantDocs : [memberSnap];

    await db.runTransaction(async (tx) => {
      for (const targetDoc of targetDocs) {
        tx.set(
          targetDoc.ref,
          {
            displayName,
            studentName: displayName,
            nameUpdatedAt: FieldValue.serverTimestamp(),
            nameUpdatedByUid: uid,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    });

    return json({
      ok: true,
      displayName,
      participantId,
      updated: targetDocs.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not update member.";
    return json({ error: message }, 500);
  }
}
