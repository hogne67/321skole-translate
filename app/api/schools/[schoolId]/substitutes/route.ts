import "server-only";
import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp, type Firestore, type Transaction } from "firebase-admin/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { accountErrorStatus, assertActiveProfile, isGloballyEnabled } from "@/lib/security/accountAccess.server";
import { isCurrentSpaceSubstitute, isSchoolSpace, spaceSubstituteExpiry } from "@/lib/security/spaceAccess";
import { getSpaceOwnerUid } from "@/lib/security/spaceOwnership";

const maxGrantMs = 31 * 24 * 60 * 60 * 1000;
type Context = { params: Promise<{ schoolId: string }> };

class SubstituteError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function errorResponse(error: unknown) {
  if (error instanceof SubstituteError) return json({ error: error.code }, error.status);
  return json({ error: "unavailable" }, accountErrorStatus(error) ?? 503);
}

function documentId(value: unknown): value is string {
  return typeof value === "string" && /^[^/\s]+$/.test(value) && value.length <= 128 && value !== "." && value !== "..";
}

async function session(request: Request, context: Context) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new SubstituteError(401, "unauthorized");
  const { schoolId } = await context.params;
  if (!documentId(schoolId)) throw new SubstituteError(400, "invalidRequest");
  const { auth, db } = getAdmin();
  const actor = await auth.verifyIdToken(token, true);
  if (actor.firebase?.sign_in_provider === "anonymous") throw new SubstituteError(403, "forbidden");
  return { actor, auth, db, schoolId };
}

function matchesSchoolAssignment(data: Record<string, unknown> | undefined, schoolId: string, uid: string, role: string) {
  return data?.uid === uid && (data.schoolId === undefined || data.schoolId === schoolId) &&
    data.role === role && data.status === "active";
}

async function verifyAdministrator(db: Firestore, actor: DecodedIdToken, schoolId: string, tx?: Transaction) {
  const read = (path: string) => tx ? tx.get(db.doc(path)) : db.doc(path).get();
  const [user, assignment] = await Promise.all([read(`users/${actor.uid}`), read(`schools/${schoolId}/members/${actor.uid}`)]);
  const profile = user.data();
  assertActiveProfile(profile, actor);
  if (profile?.schoolId !== schoolId || profile.schoolRole !== "school_admin" || profile.schoolStatus !== "active" ||
      !matchesSchoolAssignment(assignment.data(), schoolId, actor.uid, "school_admin")) {
    throw new SubstituteError(403, "forbidden");
  }
}

export async function GET(request: Request, context: Context) {
  try {
    const { actor, db, schoolId } = await session(request, context);
    await verifyAdministrator(db, actor, schoolId);
    const spaceId = new URL(request.url).searchParams.get("spaceId");
    if (spaceId === null) {
      const rooms = await db.collection("spaces").where("schoolId", "==", schoolId).get();
      return json({ rooms: rooms.docs.filter(room => isSchoolSpace(room.data(), schoolId)).map(room => ({
        id: room.id, title: typeof room.get("title") === "string" ? room.get("title") : "",
      })) });
    }
    if (!documentId(spaceId)) throw new SubstituteError(400, "invalidRequest");
    const room = await db.doc(`spaces/${spaceId}`).get();
    if (!isSchoolSpace(room.data(), schoolId)) throw new SubstituteError(404, "roomUnavailable");
    const grants = await db.collection("spaceMembers").where("spaceId", "==", spaceId).where("role", "==", "substitute").get();
    return json({ grants: grants.docs.flatMap(doc => {
      const grant = doc.data();
      const expiresAt = spaceSubstituteExpiry(grant);
      if (!documentId(grant.uid) || !documentId(grant.substituteGrantId) ||
          doc.id !== `${spaceId}_${grant.uid}` || grant.substituteSchoolId !== schoolId ||
          expiresAt === null || !isCurrentSpaceSubstitute(grant)) return [];
      return [{ uid: grant.uid, grantId: grant.substituteGrantId,
        displayName: typeof grant.displayName === "string" ? grant.displayName : "", expiresAt }];
    }) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const { actor, auth, db, schoolId } = await session(request, context);
    const body = await request.json().catch(() => null);
    if (!body || !documentId(body.spaceId) || !documentId(body.teacherUid) || !["grant", "revoke"].includes(body.action)) {
      throw new SubstituteError(400, "invalidRequest");
    }
    const { spaceId, teacherUid, action } = body as { spaceId: string; teacherUid: string; action: "grant" | "revoke" };
    const grantId: unknown = action === "grant" ? randomUUID() : body.grantId;
    if (!documentId(grantId)) throw new SubstituteError(400, "invalidRequest");
    const member = db.doc(`spaceMembers/${spaceId}_${teacherUid}`);
    await db.runTransaction(async tx => {
      await verifyAdministrator(db, actor, schoolId, tx);
      const [room, existing] = await Promise.all([tx.get(db.doc(`spaces/${spaceId}`)), tx.get(member)]);
      if (!isSchoolSpace(room.data(), schoolId)) throw new SubstituteError(404, "roomUnavailable");
      const prior = existing.data();
      const sameGrant = prior?.role === "substitute" && prior.uid === teacherUid && prior.spaceId === spaceId &&
        prior.substituteSchoolId === schoolId;
      const now = FieldValue.serverTimestamp();
      const audit = { actorUid: actor.uid, targetUid: teacherUid, schoolId, spaceId, grantId, createdAt: now };
      if (action === "revoke") {
        if (!sameGrant) throw new SubstituteError(404, "grantUnavailable");
        if (prior.substituteGrantId !== grantId) throw new SubstituteError(409, "membershipConflict");
        if (prior.status === "removed") return;
        tx.update(member, { status: "removed", active: false, archived: true, removedAt: now, removedByUid: actor.uid, updatedAt: now });
        tx.create(db.collection("adminAuditEvents").doc(), { ...audit, type: "space_substitute_revoked", expiresAt: prior.substituteExpiresAt });
        return;
      }

      const current = Date.now();
      if (!Number.isSafeInteger(body.expiresAt) || body.expiresAt <= current || body.expiresAt > current + maxGrantMs) {
        throw new SubstituteError(400, "invalidExpiry");
      }
      const owner = getSpaceOwnerUid(room.data());
      if (!owner || owner === teacherUid || (existing.exists && (!sameGrant || isCurrentSpaceSubstitute(prior, current)))) {
        throw new SubstituteError(409, "membershipConflict");
      }
      const [school, teacher, assignment] = await Promise.all([
        tx.get(db.doc(`schools/${schoolId}`)), tx.get(db.doc(`users/${teacherUid}`)),
        tx.get(db.doc(`schools/${schoolId}/members/${teacherUid}`)),
      ]);
      const profile = teacher.data();
      if (school.get("status") !== "active" || !isGloballyEnabled(profile) || profile?.role !== "teacher" ||
          profile.schoolId !== schoolId || profile.schoolRole !== "school_teacher" || profile.schoolStatus !== "active" ||
          !matchesSchoolAssignment(assignment.data(), schoolId, teacherUid, "school_teacher")) {
        throw new SubstituteError(403, "teacherUnavailable");
      }
      const account = await auth.getUser(teacherUid).catch(error => {
        if (error?.code === "auth/user-not-found") throw new SubstituteError(403, "teacherUnavailable");
        throw error;
      });
      if (account.disabled || Date.now() >= body.expiresAt) throw new SubstituteError(403, "teacherUnavailable");
      const expiresAt = Timestamp.fromMillis(body.expiresAt);
      tx.set(member, {
        uid: teacherUid, userId: teacherUid, spaceId, role: "substitute", status: "substitute", active: true, archived: false,
        displayName: account.displayName ?? (typeof profile.displayName === "string" ? profile.displayName : ""),
        substituteRoomTitle: typeof room.get("title") === "string" ? room.get("title") : "",
        substituteSchoolId: schoolId, substituteGrantId: grantId, substituteExpiresAt: expiresAt, substituteGrantedByUid: actor.uid,
        createdAt: prior?.createdAt ?? now, updatedAt: now,
      });
      tx.create(db.collection("adminAuditEvents").doc(), { ...audit, type: "space_substitute_granted", expiresAt });
    });
    return json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
