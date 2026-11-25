import "server-only";

import { createHash, randomInt } from "node:crypto";
import type { DecodedIdToken } from "firebase-admin/auth";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { assertActiveProfile } from "@/lib/security/accountAccess.server";
import { isActiveSpaceMember, isSpaceTeachingMember, pupilMembershipRequiresCode } from "@/lib/security/spaceAccess";
import { schoolPupilProviderAllowed } from "@/lib/security/schoolPupilProviders";
import { getSpaceOwnerUid } from "@/lib/security/spaceOwnership";
import { joinText } from "@/lib/spaceJoinPolicy";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const codeLength = 12;
const codePattern = new RegExp("^[" + alphabet + "]{" + codeLength + "}$");
const attemptWindowMs = 5 * 60_000;
const maximumFailedAttempts = 12;

export function documentId(value: unknown) {
  const id = joinText(value);
  return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : "";
}

export function availableSchoolRoom(data: FirebaseFirestore.DocumentData | undefined) {
  return data && !data.deletedAt && data.archived !== true && joinText(data.status).toLowerCase() !== "archived";
}

export function schoolPupilRegistrationId(spaceId: string, pupilId: string) {
  return spaceId + "_schoolpupil_" + pupilId;
}

export function hasSchoolPupilCodeFormat(code: string) {
  return codePattern.test(code);
}

export function createSchoolPupilCode() {
  return Array.from({ length: codeLength }, () => alphabet[randomInt(alphabet.length)]).join("");
}

export function schoolPupilCodeHash(schoolId: string, code: string) {
  return createHash("sha256").update(schoolId).update(":").update(code).digest("hex");
}

type JoinSchoolPupilInput = {
  db: Firestore;
  tx: Transaction;
  schoolId: string;
  spaceId: string;
  room: FirebaseFirestore.DocumentData;
  uid: string;
  isAnonymous: boolean;
  studentCode: string;
  enter: boolean;
};


type SchoolRoomEnrollment = {
  spaceId: string;
  participantId: string;
  teacherStudentId: string;
  accountUid: string;
};

type SchoolRoomAccess = { enrollment: SchoolRoomEnrollment; membership: FirebaseFirestore.DocumentSnapshot };
type SchoolPupilIdentity = { schoolId: string; pupilId: string; uid: string; isAnonymous: boolean; displayName: string };

export function activeSchoolEnrollment(
  snapshot: FirebaseFirestore.DocumentSnapshot,
  schoolId: string,
  pupilId: string,
): SchoolRoomEnrollment | null {
  const member = snapshot.data();
  if (!member || member.role !== "student" || member.schoolPupilRegistration !== true
    || member.schoolPupilSchoolId !== schoolId || member.schoolPupilId !== pupilId || !isActiveSpaceMember(member)) return null;

  const spaceId = documentId(member.spaceId);
  const participantId = joinText(member.participantId);
  if (!spaceId || !participantId || snapshot.id !== schoolPupilRegistrationId(spaceId, pupilId)) return null;
  return {
    spaceId, participantId, teacherStudentId: joinText(member.teacherStudentId) || pupilId,
    accountUid: joinText(member.schoolPupilAccountUid),
  };
}

function canUseMembership(
  prior: FirebaseFirestore.DocumentData | undefined,
  enrollment: SchoolRoomEnrollment,
  schoolId: string,
  pupilId: string,
) {
  if (!prior) return true;
  if (prior.role !== "student" || prior.participantId !== enrollment.participantId) return false;
  const samePupil = prior.schoolPupilId === pupilId && prior.schoolPupilSchoolId === schoolId;
  if ((prior.schoolPupilId || prior.schoolPupilSchoolId) && !samePupil) return false;
  return isActiveSpaceMember(prior)
    || (samePupil && (prior.status === "school_code_rotated" || prior.status === "removed"));
}

async function readSchoolRoomMemberships(
  input: Pick<JoinSchoolPupilInput, "db" | "tx" | "schoolId" | "uid"> & { spaceId?: string },
  pupilId: string,
): Promise<SchoolRoomAccess[]> {
  const { db, tx, schoolId, spaceId, uid } = input;
  const members = db.collection("spaceMembers");
  const registrations = await tx.get(members
    .where("schoolPupilSchoolId", "==", schoolId)
    .where("schoolPupilId", "==", pupilId)
    .where("schoolPupilRegistration", "==", true));
  const enrollments = registrations.docs
    .map(row => activeSchoolEnrollment(row, schoolId, pupilId))
    .filter((row): row is SchoolRoomEnrollment => row !== null && !row.accountUid && row.spaceId !== spaceId);
  if (!enrollments.length) return [];

  const spaces = db.collection("spaces");
  const [rooms, existing] = await Promise.all([
    tx.getAll(...enrollments.map(row => spaces.doc(row.spaceId))),
    tx.getAll(...enrollments.map(row => members.doc(row.spaceId + "_" + uid))),
  ]);

  return enrollments.flatMap((enrollment, index) => {
    const room = rooms[index].data();
    if (!availableSchoolRoom(room) || room?.schoolId !== schoolId || getSpaceOwnerUid(room) === uid) return [];
    return [{ enrollment, membership: existing[index] }];
  });
}

function readSchoolPupilBindings(binding: FirebaseFirestore.DocumentSnapshot, isAnonymous: boolean) {
  const identities = new Map<string, string>();
  const schoolId = documentId(binding.get("schoolId"));
  const pupilId = documentId(binding.get("pupilId"));
  if (schoolId && pupilId) identities.set(schoolId, pupilId);
  if (isAnonymous) return identities;

  const additional = binding.get("accountPupilIdsBySchool");
  if (additional && typeof additional === "object" && !Array.isArray(additional)) {
    for (const [key, value] of Object.entries(additional)) {
      const linkedSchool = documentId(key);
      const linkedPupil = documentId(value);
      if (linkedSchool && linkedPupil && !identities.has(linkedSchool)) identities.set(linkedSchool, linkedPupil);
    }
  }
  return identities;
}

function isStudentAccountMembership(
  memberId: string,
  member: FirebaseFirestore.DocumentData | undefined,
  { uid, isAnonymous }: SchoolPupilIdentity,
) {
  const spaceId = joinText(member?.spaceId);
  return !isAnonymous && member?.role === "student" && member.uid === uid
    && !!spaceId && !spaceId.includes("/") && memberId === spaceId + "_" + uid
    && !isSpaceTeachingMember(member);
}

function conflictingMembership(snapshot: FirebaseFirestore.QuerySnapshot, identity: SchoolPupilIdentity) {
  return snapshot.docs.find(row => {
    const member = row.data();
    if (!isActiveSpaceMember(member)) return false;
    if (member.role !== "student") return true;
    const samePupil = member.schoolPupilId === identity.pupilId && member.schoolPupilSchoolId === identity.schoolId;
    if (samePupil) return false;
    if (!isStudentAccountMembership(row.id, member, identity)) return true;
    if (member.schoolPupilCodeAccess !== true) return false;
    const linkedSchool = documentId(member.schoolPupilSchoolId);
    return !linkedSchool || linkedSchool === identity.schoolId || !documentId(member.schoolPupilId);
  });
}

function hasConflictingAccountRole(profile: FirebaseFirestore.DocumentSnapshot) {
  const role = profile.get("role");
  return Boolean((role && role !== "student") || profile.get("roles.admin") === true || profile.get("roles.teacher") === true);
}

function grantSchoolRoomAccess(tx: Transaction, target: SchoolRoomAccess, identity: SchoolPupilIdentity) {
  const { enrollment, membership } = target;
  const { schoolId, pupilId, uid, isAnonymous, displayName } = identity;
  const prior = membership.data();
  // Leave an existing non-code school account membership independent of code rotation.
  const accountMembership = !!prior && isActiveSpaceMember(prior) && !pupilMembershipRequiresCode(prior);
  tx.set(membership.ref, {
    spaceId: enrollment.spaceId, uid, participantId: enrollment.participantId,
    role: "student", displayName, studentName: displayName,
    schoolPupilSchoolId: schoolId, schoolPupilId: pupilId, teacherStudentId: enrollment.teacherStudentId,
    active: true, archived: false, status: "active", isAnon: isAnonymous,
    schoolPupilCodeAccess: !accountMembership,
    updatedAt: FieldValue.serverTimestamp(),
    ...(!membership.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
  }, { merge: true });
}

export async function joinSchoolPupil(input: JoinSchoolPupilInput) {
  const { db, tx, schoolId, spaceId, room, uid, isAnonymous, studentCode, enter } = input;
  if (!availableSchoolRoom(room) || room.schoolId !== schoolId) return { error: "room_unavailable" } as const;
  const school = db.collection("schools").doc(schoolId);
  const attempt = school.collection("spacePupilAttempts").doc(uid);
  const attemptData = (await tx.get(attempt)).data();
  const now = Date.now();
  const start = typeof attemptData?.windowStartedAt === "number" ? attemptData.windowStartedAt : 0;
  const currentWindow = start > now - attemptWindowMs;
  const failures = currentWindow && typeof attemptData?.failures === "number" ? attemptData.failures : 0;
  if (failures >= maximumFailedAttempts) return { error: "student_code_attempts" } as const;

  const hash = schoolPupilCodeHash(schoolId, studentCode);
  const code = await tx.get(school.collection("spacePupilCodes").doc(hash));
  const pupilId = documentId(code.get("pupilId"));
  if (!pupilId) {
    tx.set(attempt, { failures: failures + 1, windowStartedAt: currentWindow ? start : now });
    return { error: "invalid_student_code" } as const;
  }

  const [pupil, registration] = await tx.getAll(
    school.collection("spacePupils").doc(pupilId),
    db.collection("spaceMembers").doc(schoolPupilRegistrationId(spaceId, pupilId)),
  );
  const enrollment = activeSchoolEnrollment(registration, schoolId, pupilId);
  const displayName = joinText(pupil.get("displayName"));
  if (pupil.get("codeHash") !== hash || !enrollment || enrollment.spaceId !== spaceId || !displayName) {
    return { error: "invalid_student_code" } as const;
  }
  if (enrollment.accountUid) return { error: "school_pupil_account_required" } as const;
  const { participantId } = enrollment;
  const identity = { schoolId, pupilId, uid, isAnonymous, displayName };

  const membership = db.collection("spaceMembers").doc(spaceId + "_" + uid);
  const binding = db.collection("spacePupilSessions").doc(uid);
  const [priorMembership, priorBinding, profile] = await tx.getAll(membership, binding, db.collection("users").doc(uid));
  const prior = priorMembership.data();
  const boundPupil = readSchoolPupilBindings(priorBinding, isAnonymous).get(schoolId);
  const bindingConflict = isAnonymous
    ? priorBinding.exists && boundPupil !== pupilId
    : Boolean(boundPupil && boundPupil !== pupilId);
  const activeInOtherRooms = await tx.get(db.collection("spaceMembers").where("uid", "==", uid));
  const otherIdentity = conflictingMembership(activeInOtherRooms, identity);
  const switchRequired = Boolean(
    bindingConflict
    || otherIdentity
    || (isActiveSpaceMember(prior) && !canUseMembership(prior, enrollment, schoolId, pupilId))
    || getSpaceOwnerUid(room) === uid
    || hasConflictingAccountRole(profile),
  );
  const response = {
    ok: true as const, spaceId, title: joinText(room.title), participantId,
    displayName, currentDisplayName: joinText(otherIdentity?.get("displayName") ?? prior?.displayName) || null,
    switchRequired, signedInAccount: !isAnonymous, preview: !enter || switchRequired,
  };
  if (response.preview) return response;
  if (!canUseMembership(prior, enrollment, schoolId, pupilId)) return { error: "access_revoked" } as const;

  const otherMemberships = await readSchoolRoomMemberships(input, pupilId);
  const conflict = otherMemberships.find(({ enrollment, membership }) => {
    const prior = membership.data();
    // Keep the account's original participant in any other room with separate work.
    const independentAccount = isStudentAccountMembership(membership.id, prior, identity) && prior?.schoolPupilCodeAccess !== true;
    return isActiveSpaceMember(prior) && !canUseMembership(prior, enrollment, schoolId, pupilId)
      && !independentAccount;
  });
  if (conflict) {
    return { ...response, switchRequired: true, preview: true, currentDisplayName: joinText(conflict.membership.get("displayName")) || null };
  }

  const targets = [{ enrollment, membership: priorMembership }, ...otherMemberships];
  if (!priorBinding.exists || isAnonymous) {
    tx.set(binding, { schoolId, pupilId }, { merge: true });
  } else if (!boundPupil) {
    tx.set(binding, { accountPupilIdsBySchool: { [schoolId]: pupilId } }, { merge: true });
  }
  for (const target of targets) {
    if (canUseMembership(target.membership.data(), target.enrollment, schoolId, pupilId)) {
      grantSchoolRoomAccess(tx, target, identity);
    }
  }
  if (attemptData) tx.delete(attempt);
  return response;
}

export async function refreshSchoolPupilRooms(db: Firestore, tx: Transaction, decoded: DecodedIdToken) {
  const { uid } = decoded;
  const isAnonymous = decoded.firebase?.sign_in_provider === "anonymous";
  const binding = await tx.get(db.collection("spacePupilSessions").doc(uid));
  const schools = readSchoolPupilBindings(binding, isAnonymous);
  if (schools.size === 0) return 0;

  const [profile, memberships] = await Promise.all([
    tx.get(db.collection("users").doc(uid)),
    tx.get(db.collection("spaceMembers").where("uid", "==", uid)),
  ]);
  assertActiveProfile(profile.data(), decoded);
  if (hasConflictingAccountRole(profile)) return 0;

  const grantsBySchool = await Promise.all([...schools].map(async ([schoolId, pupilId]) => {
    const schoolRef = db.collection("schools").doc(schoolId);
    const school = (await tx.get(schoolRef)).data();
    if (school?.allowPupilCodeAccess === false || (!isAnonymous && !schoolPupilProviderAllowed(school, decoded.firebase?.sign_in_provider))) return [];
    const pupil = await tx.get(schoolRef.collection("spacePupils").doc(pupilId));
    const displayName = joinText(pupil.get("displayName"));
    const identity = { schoolId, pupilId, uid, displayName, isAnonymous };
    if (!displayName || conflictingMembership(memberships, identity)) return [];

    const targets = await readSchoolRoomMemberships({ db, tx, schoolId, uid }, pupilId);
    // Each school requires a current code membership after code rotation.
    const hasCurrentCodeAccess = targets.some(({ enrollment, membership }) => {
      const current = membership.data();
      return current?.uid === uid && current.spaceId === enrollment.spaceId && current.schoolPupilCodeAccess === true
        && current.schoolPupilId === pupilId && current.schoolPupilSchoolId === schoolId
        && isActiveSpaceMember(current) && canUseMembership(current, enrollment, schoolId, pupilId);
    });
    if (!hasCurrentCodeAccess) return [];

    return targets.filter(({ enrollment, membership }) => {
      const prior = membership.data();
      if (isActiveSpaceMember(prior) || (prior && (prior.uid !== uid || prior.spaceId !== enrollment.spaceId))) return false;
      return canUseMembership(prior, enrollment, schoolId, pupilId);
    }).map(target => ({ target, identity }));
  }));
  const grants = grantsBySchool.flat();
  for (const { target, identity } of grants) {
    grantSchoolRoomAccess(tx, target, identity);
  }
  return grants.length;
}
