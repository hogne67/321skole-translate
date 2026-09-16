import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";

type CodeBody = {
  mode?: unknown;
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

function studentCodeKey(spaceId: string, studentCode: string): string {
  return `${spaceId}:${studentCode}`;
}

function generateStudentCode(length = 5): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

async function findStudentMembershipByCode(
  db: Firestore,
  spaceId: string,
  studentCode: string
) {
  if (!studentCode) return null;

  const snap = await db
    .collection("spaceMembers")
    .where("studentCodeKey", "==", studentCodeKey(spaceId, studentCode))
    .limit(1)
    .get();

  return snap.empty ? null : snap.docs[0];
}

async function generateUniqueStudentCode(db: Firestore, spaceId: string): Promise<string> {
  for (let i = 0; i < 10; i += 1) {
    const code = generateStudentCode();
    const existing = await findStudentMembershipByCode(db, spaceId, code);
    if (!existing) return code;
  }

  return `${generateStudentCode(5)}${Math.floor(Math.random() * 10)}`;
}

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { spaceId, memberId } = await ctx.params;
    if (!spaceId || !memberId) return json({ error: "Missing route params" }, 400);

    const body = (await req.json().catch(() => ({}))) as CodeBody;
    const regenerate = body.mode === "regenerate";

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    const requesterSnap = await db.collection("users").doc(uid).get();
    const requesterProfile = requesterSnap.exists
      ? ((requesterSnap.data() ?? {}) as Record<string, unknown>)
      : null;

    const canManage = await canManageSpaceMembers({
      db,
      uid,
      spaceId,
      profile: requesterProfile,
    });
    if (!canManage) return json({ error: "No access to manage members for this space" }, 403);

    const memberRef = db.collection("spaceMembers").doc(memberId);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) return json({ error: "Member not found" }, 404);

    const member = (memberSnap.data() ?? {}) as Record<string, unknown>;
    if (safeString(member.spaceId) !== spaceId) return json({ error: "Member is not in this space" }, 400);
    if (safeString(member.role) !== "student") return json({ error: "Only student members can have student codes" }, 400);

    const existingCode = safeString(member.studentCode);
    const nextCode = !regenerate && existingCode ? existingCode : await generateUniqueStudentCode(db, spaceId);
    const memberUid = safeString(member.uid) || safeString(member.userId);
    const participantId = safeString(member.participantId) || memberUid || memberId;

    await memberRef.set(
      {
        participantId,
        studentCode: nextCode,
        studentCodeKey: studentCodeKey(spaceId, nextCode),
        studentCodeUpdatedAt: FieldValue.serverTimestamp(),
        studentCodeUpdatedByUid: uid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return json({
      ok: true,
      studentCode: nextCode,
      participantId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not update student code.";
    return json({ error: message }, 500);
  }
}
