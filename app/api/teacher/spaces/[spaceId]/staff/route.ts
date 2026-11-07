import { getSpaceAccess } from "@/lib/security/spaceAccess.server";
import { getSpaceOwnerUid } from "@/lib/security/spaceOwnership";
import { isCurrentSpaceSubstitute } from "@/lib/security/spaceAccess";
import { accountErrorStatus, assertActiveProfile, isGloballyEnabled } from "@/lib/security/accountAccess.server";
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

function hasActiveSchoolAssignment(
  schoolId: string,
  uid: string,
  profile: Record<string, unknown> | undefined,
  member: Record<string, unknown> | undefined,
): boolean {
  const role = member?.role;
  return isGloballyEnabled(profile) && profile?.schoolId === schoolId && profile?.schoolStatus === "active"
    && (role === "school_teacher" || role === "school_admin") && profile?.schoolRole === role
    && member?.uid === uid && (member.schoolId === undefined || member.schoolId === schoolId)
    && member.status === "active";
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
    if (!spaceId || spaceId.includes("/")) return json({ error: "Invalid spaceId" }, 400);

    const body = (await req.json().catch(() => ({}))) as InviteBody;
    const email = normalizeEmail(body.email);
    const staffRole = normalizeStaffRole(body.role);
    if (!email || !email.includes("@")) return json({ error: "Valid email is required" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    const current = await getSpaceAccess(db, spaceId, uid);
    if (!current.exists || (!current.owner && !isAdminProfile(current.profile ?? null))) {
      return json({ error: "No access to manage staff for this space" }, 403);
    }

    const invited = await findUserByEmail({ auth, db, email });
    if (!invited) return json({ error: "No registered user found with this email" }, 404);
    if (invited.uid === uid) return json({ error: "You already own this access" }, 400);
    const result = await db.runTransaction(async (tx) => {
      const access = await getSpaceAccess(db, spaceId, uid, tx);
      assertActiveProfile(access.profile, decoded);
      const platformAdmin = isAdminProfile(access.profile ?? null);
      if (!access.exists || (!access.owner && !platformAdmin)) return "room";

      const profile = (await tx.get(db.doc(`users/${invited.uid}`))).data();
      if (!isGloballyEnabled(profile) || !isTeacherProfile(profile ?? null)) return "teacher";

      const schoolId = access.space?.schoolId;
      if (schoolId != null) {
        if (typeof schoolId !== "string" || !schoolId || schoolId.trim() !== schoolId || schoolId.includes("/")) return "school";
        const [school, invitee] = await Promise.all([
          tx.get(db.doc(`schools/${schoolId}`)),
          tx.get(db.doc(`schools/${schoolId}/members/${invited.uid}`)),
        ]);
        if (school.get("status") !== "active" || !hasActiveSchoolAssignment(schoolId, invited.uid, profile, invitee.data())) return "school";
        if (!platformAdmin) {
          const owner = await tx.get(db.doc(`schools/${schoolId}/members/${uid}`));
          if (!hasActiveSchoolAssignment(schoolId, uid, access.profile, owner.data())) return "school";
        }
      }

      const target = db.doc(`spaceMembers/${spaceId}_${invited.uid}`);
      const prior = (await tx.get(target)).data();
      if (isCurrentSpaceSubstitute(prior)) return "substitute";
      tx.set(target, {
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
        ...(prior?.role === "substitute" ? {
          substituteSchoolId: FieldValue.delete(), substituteGrantId: FieldValue.delete(),
          substituteExpiresAt: FieldValue.delete(), substituteGrantedByUid: FieldValue.delete(),
          substituteRoomTitle: FieldValue.delete(),
        } : {}),
      }, { merge: true });
      return "created";
    });
    if (result === "room") return json({ error: "No access to manage staff for this space" }, 403);
    if (result === "school") return json({ error: "School rooms require active teacher access at the same school" }, 403);
    if (result === "teacher") return json({ error: "The invited user must have teacher access first" }, 409);
    if (result === "substitute") return json({ error: "The school administrator must first revoke the substitute access" }, 409);

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
    return json({ error: message }, (accountErrorStatus(error) ?? 500));
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
    const removed = await db.runTransaction(async tx => {
      const access = await getSpaceAccess(db, spaceId, uid, tx);
      assertActiveProfile(access.profile, decoded);
      const admin = isAdminProfile(access.profile ?? null);
      if (!admin && !access.owner) return "forbidden";
      if (targetUid === getSpaceOwnerUid(access.space) && !admin) return "owner";
      const target = db.doc(`spaceMembers/${spaceId}_${targetUid}`);
      if ((await tx.get(target)).get("role") === "substitute") return "substitute";
      tx.set(target, {
        archived: true,
        active: false,
        status: "removed",
        removedByUid: uid,
        removedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return "removed";
    });
    if (removed === "forbidden") return json({ error: "No access to manage staff for this space" }, 403);
    if (removed === "owner") return json({ error: "Platform administrator required for owner membership" }, 403);
    if (removed === "substitute") return json({ error: "The school administrator manages substitute access" }, 409);

    return json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not remove staff.";
    return json({ error: message }, (accountErrorStatus(error) ?? 500));
  }
}
