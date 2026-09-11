import "server-only";

import type { Auth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";

type StaffRole = "co_teacher" | "observer";

type InviteBody = {
  email?: unknown;
  role?: unknown;
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

function normalizeEmail(v: unknown): string {
  return safeString(v).toLowerCase();
}

function normalizeStaffRole(v: unknown): StaffRole {
  return v === "observer" ? "observer" : "co_teacher";
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

function isTeacherProfile(profile: Record<string, unknown> | null): boolean {
  if (!profile) return false;
  if (profile.role === "teacher" || profile.role === "creator" || profile.role === "admin") {
    return true;
  }
  const roles = profile.roles;
  return isRecord(roles) && (roles.teacher === true || roles.creator === true || roles.admin === true);
}

async function canManageSpaceStaff(params: {
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

async function findUserByEmail(params: {
  auth: Auth;
  db: Firestore;
  email: string;
}) {
  const { auth, db, email } = params;

  try {
    const authUser = await auth.getUserByEmail(email);
    const profileSnap = await db.collection("users").doc(authUser.uid).get();
    const profile = profileSnap.exists ? ((profileSnap.data() ?? {}) as Record<string, unknown>) : null;

    return {
      uid: authUser.uid,
      email: authUser.email ?? email,
      displayName:
        safeString(profile?.displayName) ||
        safeString(authUser.displayName) ||
        safeString(profile?.name) ||
        email,
      profile,
    };
  } catch {
    const profileSnap = await db.collection("users").where("email", "==", email).limit(1).get();
    if (profileSnap.empty) return null;

    const doc = profileSnap.docs[0];
    const profile = (doc.data() ?? {}) as Record<string, unknown>;
    return {
      uid: doc.id,
      email: safeString(profile.email) || email,
      displayName: safeString(profile.displayName) || safeString(profile.name) || email,
      profile,
    };
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ spaceId: string }> }
) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { spaceId } = await ctx.params;
    if (!spaceId) return json({ error: "Missing spaceId" }, 400);

    const body = (await req.json().catch(() => ({}))) as InviteBody;
    const email = normalizeEmail(body.email);
    const staffRole = normalizeStaffRole(body.role);
    if (!email || !email.includes("@")) return json({ error: "Valid email is required" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    const requesterSnap = await db.collection("users").doc(uid).get();
    const requesterProfile = requesterSnap.exists
      ? ((requesterSnap.data() ?? {}) as Record<string, unknown>)
      : null;

    const canManage = await canManageSpaceStaff({
      db,
      uid,
      spaceId,
      profile: requesterProfile,
    });
    if (!canManage) return json({ error: "No access to manage staff for this space" }, 403);

    const invited = await findUserByEmail({ auth, db, email });
    if (!invited) return json({ error: "No registered user found with this email" }, 404);
    if (invited.uid === uid) return json({ error: "You already own this access" }, 400);
    if (!isTeacherProfile(invited.profile)) {
      return json({ error: "The invited user must have teacher access first" }, 409);
    }

    const docId = `${spaceId}_${invited.uid}`;
    await db.collection("spaceMembers").doc(docId).set(
      {
        spaceId,
        uid: invited.uid,
        userId: invited.uid,
        role: staffRole === "observer" ? "observer" : "teacher",
        staffRole,
        displayName: invited.displayName,
        email: invited.email,
        archived: false,
        active: true,
        status: "active",
        invitedByUid: uid,
        invitedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return json({
      ok: true,
      member: {
        uid: invited.uid,
        email: invited.email,
        displayName: invited.displayName,
        role: staffRole,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not invite staff.";
    return json({ error: message }, 500);
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ spaceId: string }> }
) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { spaceId } = await ctx.params;
    if (!spaceId) return json({ error: "Missing spaceId" }, 400);

    const url = new URL(req.url);
    const targetUid = safeString(url.searchParams.get("uid"));
    if (!targetUid) return json({ error: "Missing uid" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    const requesterSnap = await db.collection("users").doc(uid).get();
    const requesterProfile = requesterSnap.exists
      ? ((requesterSnap.data() ?? {}) as Record<string, unknown>)
      : null;

    const canManage = await canManageSpaceStaff({
      db,
      uid,
      spaceId,
      profile: requesterProfile,
    });
    if (!canManage) return json({ error: "No access to manage staff for this space" }, 403);

    await db.collection("spaceMembers").doc(`${spaceId}_${targetUid}`).set(
      {
        archived: true,
        active: false,
        status: "removed",
        removedByUid: uid,
        removedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not remove staff.";
    return json({ error: message }, 500);
  }
}
