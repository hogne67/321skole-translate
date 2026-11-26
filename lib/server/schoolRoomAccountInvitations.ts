import "server-only";

import { createHash } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { FieldValue, Timestamp, type DocumentData, type Firestore, type Transaction } from "firebase-admin/firestore";
import { canCreateSchoolSpace } from "@/lib/schools/teacherSpaceAccess";
import { assertActiveProfile, isGloballyEnabled } from "@/lib/security/accountAccess.server";
import { schoolAllowsPupilCode } from "@/lib/security/schoolPupilAccess.server";
import { parsePupilAccountProviders, schoolPupilProviderAllowed } from "@/lib/security/schoolPupilProviders";
import { isActiveSpaceMember, isSchoolSpace, isSpaceTeachingMember, pupilMembershipRequiresCode } from "@/lib/security/spaceAccess";
import { getSpaceAccess } from "@/lib/security/spaceAccess.server";
import { getSpaceOwnerUid, hasSpaceOwnerAccess } from "@/lib/security/spaceOwnership";
import { validSubmissionPart } from "@/lib/security/studentSubmissionPolicy";
import { joinText } from "@/lib/spaceJoinPolicy";
import { compatibleUserProfileRole, hasCompletedProfileOnboarding } from "@/lib/userProfileCompatibility";
import { activeSchoolEnrollment, availableSchoolRoom, documentId } from "./schoolSpacePupilCode";
import { legacyCodeDeviceUids, planLegacySchoolSubmissionTransfer } from "./legacySchoolSubmissionTransfer";
import { availableTeacherRosterSlot, readTeacherRosterRooms, teacherRosterLimit } from "./teacherPupilCapacity";

export class SchoolRoomInvitationError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export function invitationEmail(value: unknown): string {
  const email = joinText(value).toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function invitationIdForEmail(email: string) {
  return createHash("sha256").update(email).digest("hex");
}

function invitationCollection(db: Firestore, spaceId: string) {
  return db.collection("spaces").doc(spaceId).collection("accountInvitations");
}

const transferInvitationLifetimeMs = 14 * 24 * 60 * 60 * 1000;

function currentPendingInvitation(invite: FirebaseFirestore.DocumentSnapshot) {
  const expiresAt = invite.get("expiresAt");
  return invite.get("status") === "pending" && (invite.get("sourceMemberId") === undefined
    || (expiresAt instanceof Timestamp && expiresAt.toMillis() > Date.now()));
}

function roomInvitationSchoolId(room: DocumentData | undefined): string | null | undefined {
  if (!room || !availableSchoolRoom(room)) return undefined;
  if (room.schoolId == null) return room.kind !== "family" && room.kind !== "parent_group" ? null : undefined;
  const schoolId = documentId(room.schoolId);
  return schoolId && isSchoolSpace(room, schoolId) ? schoolId : undefined;
}

async function canManageSchoolInvitation(db: Firestore, tx: Transaction, schoolId: string, uid: string, profile?: DocumentData) {
  if (profile?.schoolId !== schoolId || profile.schoolStatus !== "active") {
    return false;
  }
  const [school, teacher] = await tx.getAll(
    db.doc("schools/" + schoolId),
    db.doc("schools/" + schoolId + "/members/" + uid),
  );
  return canCreateSchoolSpace(schoolId, uid, profile.schoolRole, school.data(), teacher.data());
}

type InvitationContext = { db: Firestore; tx: Transaction; spaceId: string; actor: DecodedIdToken };
type TeacherInvitationAction = { type: "list" } | { type: "create"; email: string; sourceMemberId?: string } | { type: "withdraw"; id: string };

async function readTransferSource(db: Firestore, tx: Transaction, spaceId: string, schoolId: string, memberId: string) {
  const registration = await tx.get(db.collection("spaceMembers").doc(memberId));
  const pupilId = documentId(registration.get("schoolPupilId"));
  if (!pupilId) return null;
  const enrollment = activeSchoolEnrollment(registration, schoolId, pupilId);
  if (!enrollment || enrollment.spaceId !== spaceId || enrollment.accountUid || !validSubmissionPart(enrollment.participantId)) return null;
  const pupil = await tx.get(db.collection("schools").doc(schoolId).collection("spacePupils").doc(pupilId));
  const displayName = joinText(pupil.get("displayName"));
  return displayName ? { registration, pupilId, enrollment, displayName } : null;
}

export async function manageSchoolRoomInvitation(
  context: InvitationContext,
  action: TeacherInvitationAction,
) {
  const { db, tx, spaceId, actor } = context;
  const access = await getSpaceAccess(db, spaceId, actor.uid, tx);
  assertActiveProfile(access.profile, actor);
  if (!access.owner) throw new SchoolRoomInvitationError("forbidden", 403);
  const schoolId = roomInvitationSchoolId(access.space);
  if (schoolId === undefined) throw new SchoolRoomInvitationError("room_unavailable", 403);
  const authorized = schoolId
    ? await canManageSchoolInvitation(db, tx, schoolId, actor.uid, access.profile)
    : access.profile?.role === "teacher";
  if (!authorized) {
    throw new SchoolRoomInvitationError("forbidden", 403);
  }
  const invitations = invitationCollection(db, spaceId);
  if (action.type === "list") {
    const pending = await tx.get(invitations.where("status", "==", "pending"));
    return {
      invitations: pending.docs.flatMap(invite => {
        const email = invitationEmail(invite.get("email"));
        const sourceMemberId = documentId(invite.get("sourceMemberId"));
        return currentPendingInvitation(invite) && email && invite.get("schoolId") === schoolId && invite.id === invitationIdForEmail(email)
          ? [{ id: invite.id, email, ...(sourceMemberId ? { sourceMemberId } : {}) }] : [];
      }).sort((left, right) => left.email.localeCompare(right.email)),
    };
  }
  const ref = invitations.doc(action.type === "create" ? invitationIdForEmail(action.email) : action.id);
  const invitation = await tx.get(ref);
  if (action.type === "withdraw") {
    if (invitation.get("status") !== "pending" || invitation.get("schoolId") !== schoolId) {
      throw new SchoolRoomInvitationError("invitation_not_pending", 409);
    }
    tx.delete(ref);
    return { ok: true };
  }
  if (invitation.exists && (invitation.get("status") !== "pending" || invitation.get("schoolId") !== schoolId
    || invitation.get("email") !== action.email)) {
    throw new SchoolRoomInvitationError("invitation_already_used", 409);
  }
  const expiredTransfer = invitation.exists && invitation.get("sourceMemberId") !== undefined && !currentPendingInvitation(invitation);
  let transfer: { sourceMemberId: string; sourceParticipantId: string; expiresAt: Timestamp } | undefined;
  if (action.sourceMemberId) {
    const source = schoolId ? await readTransferSource(db, tx, spaceId, schoolId, action.sourceMemberId) : null;
    if (!source) throw new SchoolRoomInvitationError("account_transfer_unavailable", 409);
    const existingSource = invitation.get("sourceMemberId");
    if (!expiredTransfer && existingSource !== undefined && (existingSource !== action.sourceMemberId
      || invitation.get("sourceParticipantId") !== source.enrollment.participantId)) {
      throw new SchoolRoomInvitationError("account_transfer_conflict", 409);
    }
    const existingTransfers = await tx.get(invitations.where("sourceMemberId", "==", action.sourceMemberId));
    if (existingTransfers.docs.some(doc => doc.id !== ref.id && currentPendingInvitation(doc))) {
      throw new SchoolRoomInvitationError("account_transfer_pending", 409);
    }
    transfer = { sourceMemberId: action.sourceMemberId, sourceParticipantId: source.enrollment.participantId,
      expiresAt: Timestamp.fromMillis(Date.now() + transferInvitationLifetimeMs) };
    for (const old of existingTransfers.docs) {
      if (old.id !== ref.id && old.get("status") === "pending") tx.delete(old.ref);
    }
  }
  if (!invitation.exists || expiredTransfer) {
    tx.set(ref, {
      email: action.email, schoolId, status: "pending", ...transfer,
      invitedByUid: actor.uid, createdAt: FieldValue.serverTimestamp(),
    });
  } else if (transfer && invitation.get("sourceMemberId") === undefined) {
    tx.update(ref, { ...transfer, invitedByUid: actor.uid });
  }
  return { ok: true };
}

type AccountEntry = {
  db: Firestore;
  tx: Transaction;
  spaceId: string;
  room: DocumentData;
  actor: DecodedIdToken;
  email: string;
};

async function completeAccountTransfer(
  { db, tx, spaceId, actor }: AccountEntry,
  schoolId: string,
  owner: string,
  invite: FirebaseFirestore.DocumentSnapshot,
  member: FirebaseFirestore.DocumentSnapshot,
) {
  const { uid } = actor;
  const sourceMemberId = documentId(invite.get("sourceMemberId"));
  if (!sourceMemberId || invite.get("sourceMemberId") !== sourceMemberId || invite.get("invitedByUid") !== owner) {
    return { error: "account_transfer_unavailable" } as const;
  }
  const source = await readTransferSource(db, tx, spaceId, schoolId, sourceMemberId);
  if (!source || invite.get("sourceParticipantId") !== source.enrollment.participantId) {
    return { error: "account_transfer_unavailable" } as const;
  }
  const ownerAccess = await getSpaceAccess(db, spaceId, owner, tx);
  if (!ownerAccess.owner || !await canManageSchoolInvitation(db, tx, schoolId, owner, ownerAccess.profile)) {
    return { error: "account_transfer_unavailable" } as const;
  }
  const { enrollment: { participantId, teacherStudentId }, pupilId, registration, displayName } = source;
  const prior = member.data();
  const sameIdentity = (row: DocumentData) => (!row.schoolPupilId || row.schoolPupilId === pupilId)
    && (!row.schoolPupilSchoolId || row.schoolPupilSchoolId === schoolId);
  if (prior && (prior.role !== "student" || prior.spaceId !== spaceId || (prior.uid || prior.userId) !== uid
    || (prior.userId && prior.userId !== uid) || prior.schoolPupilRegistration === true || isSpaceTeachingMember(prior)
    || prior.participantId !== participantId || !sameIdentity(prior) || prior.schoolPupilAccountUid
    || (!isActiveSpaceMember(prior) && !(prior.status === "school_code_rotated" && pupilMembershipRequiresCode(prior))))) {
    return { error: "account_transfer_conflict" } as const;
  }
  const [roomRows, accountWork] = await Promise.all([
    tx.get(db.collection("spaceMembers").where("spaceId", "==", spaceId)),
    tx.get(db.collection("spaceSubmissions").where("spaceId", "==", spaceId).where("uid", "==", uid).select("participantId")),
  ]);
  if (roomRows.docs.some(row => row.get("schoolPupilId") === pupilId && row.get("schoolPupilSchoolId") === schoolId
    && row.get("role") === "student" && row.get("participantId") !== participantId && isActiveSpaceMember(row.data()))) {
    return { error: "account_transfer_conflict" } as const;
  }
  const previousAccess = roomRows.docs.filter(row => {
    const data = row.data();
    const participant = joinText(data.participantId) || joinText(data.uid) || joinText(data.userId) || row.id;
    return row.id !== registration.id && row.id !== member.id && data.role === "student" && participant === participantId
      && (isActiveSpaceMember(data) || data.status === "pending_approval");
  });
  if (previousAccess.some(row => {
    const data = row.data();
    return !sameIdentity(data) || data.schoolPupilRegistration === true || isSpaceTeachingMember(data)
      || data.schoolPupilAccountUid || (!pupilMembershipRequiresCode(data) && !joinText(data.studentCodeKey));
  })) return { error: "account_transfer_conflict" } as const;
  // This handover must fit in one Firestore commit.
  if (previousAccess.length > 497) return { error: "account_transfer_unavailable" } as const;
  const deviceUids = legacyCodeDeviceUids(roomRows.docs, { spaceId, schoolId, pupilId, participantId });
  const { updates: legacyWork, accountConflict } = await planLegacySchoolSubmissionTransfer(
    db, tx, { spaceId, participantId, deviceUids, accountUid: uid },
  );
  const legacyPaths = new Set(legacyWork.map(work => work.ref.path));
  if (accountConflict || accountWork.docs.some(doc =>
    (joinText(doc.get("participantId")) || uid) !== participantId && !legacyPaths.has(doc.ref.path))) {
    return { error: "account_transfer_conflict" } as const;
  }
  if (previousAccess.length + legacyWork.length > 497) return { error: "account_transfer_unavailable" } as const;

  const now = FieldValue.serverTimestamp();
  const codeFields = {
    studentCode: FieldValue.delete(), studentCodeKey: FieldValue.delete(), linkedByStudentCode: FieldValue.delete(),
    linkedFromMemberId: FieldValue.delete(), approvalCode: FieldValue.delete(), approvalExpiresAt: FieldValue.delete(),
  };
  const identity = { schoolPupilId: pupilId, schoolPupilSchoolId: schoolId };
  tx.set(member.ref, {
    spaceId, uid, participantId, teacherStudentId, ...identity, schoolPupilAccountUid: uid,
    role: "student", displayName, studentName: displayName, isAnon: false, schoolPupilCodeAccess: false,
    status: "active", active: true, archived: false, ...codeFields, updatedAt: now,
    ...(!member.exists ? { createdAt: now } : {}),
  }, { merge: true });
  tx.update(registration.ref, { schoolPupilAccountUid: uid, ...codeFields, updatedAt: now });
  tx.update(invite.ref, { status: "accepted", acceptedByUid: uid, acceptedAt: now, email: FieldValue.delete() });
  for (const row of previousAccess) {
    tx.update(row.ref, { ...identity, status: "school_pupil_account_linked", active: false, archived: true, ...codeFields, updatedAt: now });
  }
  for (const { ref, fields } of legacyWork) tx.update(ref, fields);
  return { ok: true } as const;
}

export async function joinSchoolRoomWithAccount({ db, tx, spaceId, room, actor, email }: AccountEntry) {
  const schoolId = roomInvitationSchoolId(room);
  const owner = getSpaceOwnerUid(room);
  if (schoolId === undefined || !owner) return { error: "room_unavailable" } as const;
  if (schoolId) {
    const school = (await tx.get(db.doc("schools/" + schoolId))).data();
    if (school?.status !== "active") return { error: "room_unavailable" } as const;
    if (!schoolPupilProviderAllowed(school, actor.firebase?.sign_in_provider)) {
      return { error: "school_pupil_provider_disabled", pupilAccountProviders: parsePupilAccountProviders(school.pupilAccountProviders) } as const;
    }
  }
  const { uid } = actor;
  const membership = db.doc("spaceMembers/" + spaceId + "_" + uid);
  const invitation = invitationCollection(db, spaceId).doc(invitationIdForEmail(email));
  const [profileSnap, member, invite] = await tx.getAll(db.doc("users/" + uid), membership, invitation);
  const profile = profileSnap.data();
  assertActiveProfile(profile, actor);
  const role = profile ? compatibleUserProfileRole(profile) : null;
  const rawRole = typeof profile?.role === "string" ? profile.role.toLowerCase() : profile?.role;
  if (owner === uid || profile?.roles?.admin === true || profile?.roles?.teacher === true
    || (rawRole != null && rawRole !== "" && rawRole !== "student")
    || (role !== "student" && (role !== null || profile?.onboardingComplete === true))) {
    return { error: "account_role_ineligible" } as const;
  }
  if (!profile || role !== "student" || !hasCompletedProfileOnboarding(profile)) {
    return { error: "account_profile_incomplete" } as const;
  }
  if (profile.schoolId && (profile.schoolId !== schoolId || profile.schoolStatus !== "active")) {
    return { error: "account_invitation_required" } as const;
  }
  const result = { ok: true as const, spaceId, title: joinText(room.title), preview: false };
  const pending = currentPendingInvitation(invite) && invite.get("schoolId") === schoolId && invite.get("email") === email;
  if (pending && invite.get("sourceMemberId") !== undefined) {
    if (!schoolId) return { error: "account_transfer_unavailable" } as const;
    const transferred = await completeAccountTransfer({ db, tx, spaceId, room, actor, email }, schoolId, owner, invite, member);
    return "error" in transferred ? transferred : result;
  }
  const accepted = {
    status: "accepted", acceptedByUid: uid, acceptedAt: FieldValue.serverTimestamp(), email: FieldValue.delete(),
  };
  if (member.exists) {
    const prior = member.data();
    if (!isActiveSpaceMember(prior) || prior?.role !== "student" || prior.spaceId !== spaceId
      || (prior.uid || prior.userId) !== uid || (prior.userId && prior.userId !== uid)
      || prior.isAnon === true || isSpaceTeachingMember(prior)) {
      return { error: "access_revoked" } as const;
    }
    if (schoolId && pupilMembershipRequiresCode(prior) && !await schoolAllowsPupilCode(db, schoolId, tx)) {
      return { error: "school_pupil_code_disabled" } as const;
    }
    if (pending) tx.update(invitation, accepted);
    return result;
  }
  // A previously accepted invitation cannot recreate a withdrawn membership.
  if (!pending) return { error: "account_invitation_required" } as const;
  const quotaSchoolId = schoolId ?? "";
  const [ownerProfile, rooms, ownerMembership] = await Promise.all([
    tx.get(db.doc("users/" + owner)),
    readTeacherRosterRooms(db, owner, quotaSchoolId, tx),
    tx.get(db.doc("spaceMembers/" + spaceId + "_" + owner)),
  ]);
  const ownerData = ownerProfile.data();
  if (!isGloballyEnabled(ownerData) || !hasSpaceOwnerAccess(room, owner, ownerMembership.data())
    || (schoolId ? invite.get("invitedByUid") !== owner || !await canManageSchoolInvitation(db, tx, schoolId, owner, ownerData)
      : ownerData?.role !== "teacher")) {
    return { error: "room_unavailable" } as const;
  }
  const limit = teacherRosterLimit(ownerData ?? {}, quotaSchoolId);
  const lock = await availableTeacherRosterSlot({ db, tx, owner, spaceIds: [...rooms.keys()], limit }, uid);
  if (!lock) return { error: "account_capacity_reached" } as const;
  const displayName = (joinText(profile.displayName) || joinText(actor.name) || "Elev").slice(0, 80);
  const now = FieldValue.serverTimestamp();
  tx.set(lock, { updatedAt: now });
  tx.create(membership, {
    spaceId, uid, participantId: uid, role: "student", displayName, studentName: displayName,
    active: true, archived: false, status: "active", isAnon: false, createdAt: now, updatedAt: now,
  });
  tx.update(invitation, accepted);
  return result;
}
