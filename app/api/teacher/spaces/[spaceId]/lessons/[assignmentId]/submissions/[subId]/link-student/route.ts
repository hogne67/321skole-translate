import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";

type LinkBody = {
  studentCode?: unknown;
};

type RouteContext = {
  params: Promise<{
    spaceId: string;
    assignmentId: string;
    subId: string;
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

function cleanStudentCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

function studentCodeKey(spaceId: string, studentCode: string): string {
  return `${spaceId}:${studentCode}`;
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

async function canTeachInSpace(params: {
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
  if (safeString(space.ownerId) === uid || safeString(space.ownerUid) === uid) return true;

  const memberSnap = await db.collection("spaceMembers").doc(`${spaceId}_${uid}`).get();
  if (!memberSnap.exists) return false;
  const member = (memberSnap.data() ?? {}) as Record<string, unknown>;
  const role = safeString(member.role);
  const staffRole = safeString(member.staffRole);
  const status = safeString(member.status).toLowerCase();

  return (
    member.archived !== true &&
    member.active !== false &&
    status !== "removed" &&
    (role === "teacher" || role === "co_teacher" || staffRole === "co_teacher" || staffRole === "substitute")
  );
}

async function findStudentByCode(db: Firestore, spaceId: string, studentCode: string) {
  const snap = await db
    .collection("spaceMembers")
    .where("studentCodeKey", "==", studentCodeKey(spaceId, studentCode))
    .limit(1)
    .get();

  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  const data = (docSnap.data() ?? {}) as Record<string, unknown>;
  const status = safeString(data.status).toLowerCase();

  if (
    safeString(data.spaceId) !== spaceId ||
    safeString(data.role) !== "student" ||
    data.archived === true ||
    data.active === false ||
    status === "removed"
  ) {
    return null;
  }

  return { id: docSnap.id, data };
}

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { spaceId, assignmentId, subId } = await ctx.params;
    if (!spaceId || !assignmentId || !subId) return json({ error: "Missing route params" }, 400);

    const body = (await req.json().catch(() => ({}))) as LinkBody;
    const studentCode = cleanStudentCode(safeString(body.studentCode));
    if (!studentCode) return json({ error: "Missing student code" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const requesterSnap = await db.collection("users").doc(uid).get();
    const requesterProfile = requesterSnap.exists
      ? ((requesterSnap.data() ?? {}) as Record<string, unknown>)
      : null;

    const canTeach = await canTeachInSpace({ db, uid, spaceId, profile: requesterProfile });
    if (!canTeach) return json({ error: "No access to link submissions in this space" }, 403);

    const student = await findStudentByCode(db, spaceId, studentCode);
    if (!student) return json({ error: "No active student found with that code" }, 404);

    const memberUid = safeString(student.data.uid) || safeString(student.data.userId);
    const participantId = safeString(student.data.participantId) || memberUid || student.id;
    const displayName =
      safeString(student.data.displayName) ||
      safeString(student.data.name) ||
      safeString(student.data.studentName) ||
      studentCode;

    const nestedRef = db
      .collection("spaces")
      .doc(spaceId)
      .collection("lessons")
      .doc(assignmentId)
      .collection("submissions")
      .doc(subId);
    const nestedSnap = await nestedRef.get();
    if (!nestedSnap.exists) return json({ error: "Submission not found" }, 404);

    const patch = {
      participantId,
      linkedMemberId: student.id,
      linkedStudentCode: studentCode,
      displayName,
      studentName: displayName,
      linkedAt: FieldValue.serverTimestamp(),
      linkedByUid: uid,
      updatedAt: FieldValue.serverTimestamp(),
    };

    await db.runTransaction(async (tx) => {
      tx.set(nestedRef, patch, { merge: true });
      tx.set(db.collection("spaceSubmissions").doc(subId), patch, { merge: true });
    });

    return json({
      ok: true,
      participantId,
      displayName,
      studentCode,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not link submission.";
    return json({ error: message }, 500);
  }
}
