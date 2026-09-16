import "server-only";

import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";

type CreateStudentBody = {
  displayName?: unknown;
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

async function codeExists(db: Firestore, spaceId: string, studentCode: string): Promise<boolean> {
  const snap = await db.collection("spaceMembers").where("spaceId", "==", spaceId).get();
  return snap.docs.some((docSnap) => {
    const data = (docSnap.data() ?? {}) as Record<string, unknown>;
    const status = safeString(data.status).toLowerCase();
    return (
      data.archived !== true &&
      data.active !== false &&
      status !== "removed" &&
      safeString(data.studentCode).toUpperCase() === studentCode
    );
  });
}

async function generateUniqueStudentCode(db: Firestore, spaceId: string): Promise<string> {
  for (let i = 0; i < 10; i += 1) {
    const code = generateStudentCode();
    const exists = await codeExists(db, spaceId, code);
    if (!exists) return code;
  }

  return `${generateStudentCode(5)}${Math.floor(Math.random() * 10)}`;
}

export async function POST(req: Request, ctx: { params: Promise<{ spaceId: string }> }) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { spaceId } = await ctx.params;
    if (!spaceId) return json({ error: "Missing spaceId" }, 400);

    const body = (await req.json().catch(() => ({}))) as CreateStudentBody;
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

    const participantId = `participant_${randomUUID()}`;
    const memberId = `${spaceId}_${participantId}`;
    const studentCode = await generateUniqueStudentCode(db, spaceId);

    const payload = {
      spaceId,
      participantId,
      role: "student",
      displayName,
      studentName: displayName,
      studentCode,
      studentCodeKey: studentCodeKey(spaceId, studentCode),
      isAnon: true,
      teacherManaged: true,
      archived: false,
      active: true,
      status: "active",
      createdByUid: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await db.collection("spaceMembers").doc(memberId).set(payload, { merge: true });

    return json({
      ok: true,
      member: {
        id: memberId,
        participantId,
        displayName,
        studentCode,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not create student.";
    return json({ error: message }, 500);
  }
}
