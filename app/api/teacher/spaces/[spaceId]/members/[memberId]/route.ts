import { getSpaceAccess } from "@/lib/security/spaceAccess.server";
import { getSpaceOwnerUid } from "@/lib/security/spaceOwnership";
import { accountErrorStatus, isGloballyEnabled } from "@/lib/security/accountAccess.server";
import { isActiveSpaceMember } from "@/lib/security/spaceAccess";
import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { documentId, schoolPupilRegistrationId } from "@/lib/server/schoolSpacePupilCode";

type MemberBody = {
  action?: unknown;
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

  return (await getSpaceAccess(db, spaceId, uid)).owner;
}

async function getActiveStudentDocsForParticipant(
  db: Firestore,
  spaceId: string,
  participantId: string
) {
  const snap = await db.collection("spaceMembers").where("spaceId", "==", spaceId).get();

  return snap.docs.filter((docSnap) => {
    const data = (docSnap.data() ?? {}) as Record<string, unknown>;
    return (
      safeString(data.participantId) === participantId &&
      safeString(data.role) === "student" &&
      isActiveSpaceMember(data)
    );
  });
}

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { spaceId, memberId } = await ctx.params;
    if (!spaceId || !memberId) return json({ error: "Missing route params" }, 400);

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
    const body = (await req.json().catch(() => ({}))) as MemberBody;
    const action = safeString(body.action);

    if (action === "remove") {
      const removed = await db.runTransaction(async (tx) => {
        const currentAccess = await getSpaceAccess(db, spaceId, uid, tx);
        const ownerUid = getSpaceOwnerUid(currentAccess.space);
        const admin = isGloballyEnabled(currentAccess.profile) && isAdminProfile(currentAccess.profile ?? null);
        if (!admin && !currentAccess.owner) return { error: "No access to manage members for this space" };
        const currentMember = await tx.get(memberRef);
        const currentIdentity = safeString(currentMember.get("participantId")) || safeString(currentMember.get("uid")) || memberId;
        if (!currentMember.exists || currentMember.get("spaceId") !== spaceId || currentMember.get("role") !== "student" || currentIdentity !== participantId) return { error: "Member changed; retry" };
        // Query inside the same transaction as the revocation. Include pending
        // requests and the retained teacher identity, not just active aliases.
        const current = await tx.get(db.collection("spaceMembers").where("spaceId", "==", spaceId));
        const targetDocs = current.docs.filter(doc => safeString(doc.get("role")) === "student" &&
          (safeString(doc.get("participantId")) || safeString(doc.get("uid")) || doc.id) === participantId);
        if (!admin && targetDocs.some(target => target.id === `${spaceId}_${ownerUid}`)) return { error: "Platform administrator required for owner membership" };
        const schoolId = documentId(currentAccess.space?.schoolId);
        const transferRegistration = schoolId && targetDocs.find(row => {
          const pupilId = documentId(row.get("schoolPupilId"));
          const accountUid = documentId(row.get("schoolPupilAccountUid"));
          if (!pupilId || row.id !== schoolPupilRegistrationId(spaceId, pupilId)
            || row.get("schoolPupilRegistration") !== true || row.get("schoolPupilSchoolId") !== schoolId
            || row.get("participantId") !== participantId || !accountUid) return false;
          return targetDocs.some(target => target.id === `${spaceId}_${accountUid}` && target.get("uid") === accountUid
            && target.get("schoolPupilAccountUid") === accountUid && target.get("schoolPupilId") === pupilId
            && target.get("schoolPupilSchoolId") === schoolId && target.get("participantId") === participantId
            && target.get("schoolPupilCodeAccess") === false);
        });
        // Keep precise proof of historical code sessions. These rows are already revoked
        // and will never be reactivated by re-admitting the account.
        const rowsToRemove = targetDocs.filter(row => !transferRegistration
          || !["school_pupil_account_linked", "school_code_rotated"].includes(row.get("status"))
          || row.get("active") !== false || row.get("archived") !== true
          || row.get("schoolPupilAccountUid") !== undefined || row.get("schoolPupilRegistration") === true
          || row.get("schoolPupilId") !== transferRegistration.get("schoolPupilId")
          || row.get("schoolPupilSchoolId") !== schoolId || row.get("participantId") !== participantId);
        for (const targetDoc of rowsToRemove) {
          tx.set(
            targetDoc.ref,
            {
              archived: true,
              active: false,
              status: "removed",
              removedAt: FieldValue.serverTimestamp(),
              removedByUid: uid,
              approvalCode: FieldValue.delete(),
              approvalExpiresAt: FieldValue.delete(),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
        return { removed: rowsToRemove.length };
      });
      if ("error" in removed) return json({ error: removed.error }, 403);

      return json({
        ok: true,
        action: "remove",
        participantId,
        removed: removed.removed,
      });
    }

    if (member.schoolPupilId) return json({ error: "Use the school pupil card" }, 409);
    const activeParticipantDocs = await getActiveStudentDocsForParticipant(db, spaceId, participantId);
    const targetDocs = activeParticipantDocs.length ? activeParticipantDocs : [memberSnap];

    const displayName = cleanName(safeString(body.displayName));
    if (!displayName) return json({ error: "Display name is required" }, 400);

    const edited = await db.runTransaction(async (tx) => {
      if ((await tx.get(memberRef)).get("schoolPupilId")) return false;
      const pupilRecord = await tx.get(db.collection("spaceMembers").doc(`${spaceId}_${participantId}`));
      const nameTargets = pupilRecord.exists && pupilRecord.data()?.teacherManaged === true &&
        !targetDocs.some(doc => doc.id === pupilRecord.id) ? [...targetDocs, pupilRecord] : targetDocs;
      for (const targetDoc of nameTargets) {
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
      return true;
    });
    if (!edited) return json({ error: "Use the school pupil card" }, 409);

    return json({
      ok: true,
      displayName,
      participantId,
      updated: targetDocs.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not update member.";
    return json({ error: message }, (accountErrorStatus(error) ?? 500));
  }
}
