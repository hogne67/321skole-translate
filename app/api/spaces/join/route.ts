import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { randomInt } from "node:crypto";
import { getAdmin } from "@/lib/firebaseAdmin";
import { isActiveSpaceMember } from "@/lib/security/spaceAccess";
import { getSpaceOwnerUid } from "@/lib/security/spaceOwnership";
import { evaluatePupilJoin, isActivePupil, joinText, type JoinMember } from "@/lib/spaceJoinPolicy";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
type JoinReply = { error: string } | {
  ok: true; spaceId: string; title: string; preview: boolean;
  approvalRequired?: boolean; approvalCode?: string; expired?: boolean;
  cancelled?: boolean; renewRequired?: boolean; requestState?: "rejected" | "cancelled" | "replace";
  participantId?: string; displayName?: string; currentDisplayName?: string | null;
  switchRequired?: boolean; signedInAccount?: boolean;
};

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return json({ error: "unauthorized" }, 401);
  const { auth, db } = getAdmin();
  let decoded;
  try { decoded = await auth.verifyIdToken(token, true); }
  catch (accountError) { return json({ error: "unauthorized" }, (accountErrorStatus(accountError) ?? 401)); }
  try {
    const body = await req.json().catch(() => ({}));
    const code = joinText(body.code).toUpperCase();
    const studentCode = joinText(body.studentCode).toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) return json({ error: "space_not_found" }, 404);
    if (!/^[A-Z0-9]{4,12}$/.test(studentCode)) return json({ error: "student_code_required" }, 400);
    let spaceRef: FirebaseFirestore.DocumentReference | undefined;
    for (const field of ["code", "joinCode", "join.code"]) {
      const spaces = await db.collection("spaces").where(field, "==", code).limit(1).get();
      if (!spaces.empty) { spaceRef = spaces.docs[0].ref; break; }
    }
    if (!spaceRef) return json({ error: "space_not_found" }, 404);
    const uid = decoded.uid;
    const room = spaceRef;
    const result = await db.runTransaction<JoinReply>(async tx => {
      const space = await tx.get(room);
      const data = space.data();
      if (!data || data.archived === true || data.status === "archived") return { error: "room_unavailable" } as const;
      // isOpen was a legacy admission toggle. Valid personal codes admit existing pupils on new devices.
      const membershipRef = db.collection("spaceMembers").doc(`${room.id}_${uid}`);
      const existing = await tx.get(membershipRef);
      const matching = await tx.get(db.collection("spaceMembers").where("studentCodeKey", "==", `${room.id}:${studentCode}`));
      const existingData = existing.exists ? existing.data() as JoinMember : null;
      // Do not create an inactive canonical pupil record for the room owner:
      // that would also revoke the owner's existing management authority.
      if (!existing.exists && getSpaceOwnerUid(data) === uid) return { error: "manager_account" };
      const pending = existing.data()?.status === "pending_approval";
      const closedRequest = existing.data()?.status === "rejected" || existing.data()?.status === "cancelled";
      const reply = { ok: true as const, spaceId: room.id, title: joinText(data.title), preview: true, approvalRequired: true };
      if (body.cancel === true) {
        if (!pending) return { error: "request_not_pending" };
        tx.update(membershipRef, { status: "cancelled", active: false, archived: true,
          approvalCode: FieldValue.delete(), approvalExpiresAt: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
        return { ...reply, approvalRequired: false, cancelled: true };
      }
      if (existingData && !pending && !closedRequest && !isActiveSpaceMember(existingData)) return { error: "access_revoked" } as const;
      const decision = evaluatePupilJoin(pending || closedRequest ? null : existingData, matching.docs.map(doc => doc.data() as JoinMember));
      if ("error" in decision) return decision;
      // A code identifies a requested pupil, but does not approve a new account.
      // Existing active memberships continue without any data migration.
      if ((!existingData || pending || closedRequest) && !decision.switchRequired) {
        const targetChanged = pending && (existingData?.participantId !== decision.participantId || existing.data()?.studentCode !== studentCode);
        if ((closedRequest || targetChanged) && body.renew !== true) {
          if (body.confirm === true) return { error: targetChanged ? "identity_conflict" : "request_closed" };
          return { ...reply, renewRequired: true, requestState: closedRequest ? existing.data()?.status as "rejected" | "cancelled" : "replace" };
        }
        const expires = existing.data()?.approvalExpiresAt;
        const expired = !(expires instanceof Timestamp) || expires.toMillis() <= Date.now();
        if (pending && !targetChanged && body.renew !== true) return { ...reply, expired, ...(!expired ? { approvalCode: joinText(existing.data()?.approvalCode) } : {}) };
        if (body.confirm !== true) return reply;
        const approvalCode = String(randomInt(100000, 1000000));
        tx.set(membershipRef, {
          spaceId: room.id, uid, participantId: decision.participantId, role: "student",
          // Do not disclose the pupil name through the requester's readable member document.
          active: false, archived: false, status: "pending_approval",
          displayName: FieldValue.delete(), studentName: FieldValue.delete(), teacherStudentId: FieldValue.delete(),
          approvedAt: FieldValue.delete(), approvedByUid: FieldValue.delete(),
          studentCode, studentCodeKey: `${room.id}:${studentCode}`, code,
          approvalCode, approvalExpiresAt: Timestamp.fromMillis(Date.now() + 15 * 60_000),
          isAnon: decoded.firebase?.sign_in_provider === "anonymous",
          requestedProvider: decoded.firebase?.sign_in_provider ?? "unknown",
          updatedAt: FieldValue.serverTimestamp(),
          ...(!existing.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
        }, { merge: true });
        return { ...reply, approvalCode, expired: false };
      }
      const pupilRecord = await tx.get(db.collection("spaceMembers").doc(`${room.id}_${decision.participantId}`));
      const pupilData = pupilRecord.data();
      // Teacher-created pupil records remain authoritative after their first access is linked.
      const displayName = pupilData?.teacherManaged === true && pupilData.participantId === decision.participantId
        ? joinText(pupilData.displayName) : decision.displayName;
      if (!displayName) return { error: "missing_pupil_name" } as const;
      if (existingData?.status === "revoked") return { error: "access_revoked" } as const;
      const response = {
        ok: true, spaceId: room.id, title: joinText(data.title), participantId: decision.participantId,
        displayName, currentDisplayName: decision.currentDisplayName,
        switchRequired: decision.switchRequired, signedInAccount: decoded.firebase?.sign_in_provider !== "anonymous",
      };
      // Preview is read-only. Switching requires a fresh guest UID after explicit confirmation.
      if (body.confirm !== true || decision.switchRequired) return { ...response, ok: true, preview: true };
      const origin = matching.docs.find(doc => isActivePupil(doc.data() as JoinMember));
      tx.set(membershipRef, {
        spaceId: room.id, uid, participantId: decision.participantId, role: "student",
        ...(joinText(pupilRecord.data()?.teacherStudentId) ? { teacherStudentId: joinText(pupilRecord.data()?.teacherStudentId) } : {}),
        displayName, studentName: displayName,
        studentCode, studentCodeKey: `${room.id}:${studentCode}`, code,
        archived: false, active: true, status: "active", isAnon: decoded.firebase?.sign_in_provider === "anonymous",
        ...(origin && origin.id !== membershipRef.id ? { linkedFromMemberId: origin.id, linkedByStudentCode: true } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        ...(!existing.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
      }, { merge: true });
      for (const access of matching.docs) {
        if (access.id !== membershipRef.id && isActivePupil(access.data() as JoinMember) && joinText(access.data().uid)) {
          tx.update(access.ref, { displayName, studentName: displayName });
        }
      }
      if (origin && !joinText(origin.data().uid)) tx.set(origin.ref, {
        archived: true, active: false, status: "linked", linkedToMemberId: membershipRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { ...response, ok: true, preview: false };
    });
    if ("error" in result) return json(result, ["identity_conflict", "request_not_pending"].includes(result.error) ? 409 : 403);
    if (!result.preview && decoded.firebase?.sign_in_provider !== "anonymous") {
      const profileRef = db.collection("users").doc(uid);
      const profile = await profileRef.get();
      if (!profile.data()?.role || profile.data()?.role === "student") await profileRef.set({
        role: "student", roles: { student: true },
        studentAccessMode: profile.data()?.studentAccessMode === "self_study" ? "self_study" : "space_only",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    return json(result);
  } catch { return json({ error: "join_failed" }, 500); }
}
