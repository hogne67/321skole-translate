import "server-only";

import { createHash, randomInt } from "node:crypto";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { isActiveSpaceMember } from "@/lib/security/spaceAccess";
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
};

function activeSchoolEnrollment(
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
  return { spaceId, participantId, teacherStudentId: joinText(member.teacherStudentId) || pupilId };
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

async function readOtherRoomMemberships(input: JoinSchoolPupilInput, pupilId: string) {
  const { db, tx, schoolId, spaceId, uid } = input;
  const members = db.collection("spaceMembers");
  const registrations = await tx.get(members
    .where("schoolPupilSchoolId", "==", schoolId)
    .where("schoolPupilId", "==", pupilId)
    .where("schoolPupilRegistration", "==", true));
  const enrollments = registrations.docs
    .map(row => activeSchoolEnrollment(row, schoolId, pupilId))
    .filter((row): row is SchoolRoomEnrollment => row !== null && row.spaceId !== spaceId);
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
  const { participantId } = enrollment;

  const membership = db.collection("spaceMembers").doc(spaceId + "_" + uid);
  const binding = db.collection("spacePupilSessions").doc(uid);
  const [priorMembership, priorBinding, profile] = await tx.getAll(membership, binding, db.collection("users").doc(uid));
  const prior = priorMembership.data();
  const boundPupil = priorBinding.get("pupilId");
  const activeInOtherRooms = await tx.get(db.collection("spaceMembers").where("uid", "==", uid));
  const otherIdentity = activeInOtherRooms.docs.find(row => {
    const member = row.data();
    return isActiveSpaceMember(member) && (member.role !== "student"
      || member.schoolPupilId !== pupilId || member.schoolPupilSchoolId !== schoolId);
  });
  const accountRole = profile.get("role");
  const switchRequired = Boolean(
    (priorBinding.exists && (boundPupil !== pupilId || priorBinding.get("schoolId") !== schoolId))
    || otherIdentity
    || (isActiveSpaceMember(prior) && !canUseMembership(prior, enrollment, schoolId, pupilId))
    || getSpaceOwnerUid(room) === uid
    || (accountRole && accountRole !== "student") || profile.get("roles.admin") === true || profile.get("roles.teacher") === true,
  );
  const response = {
    ok: true as const, spaceId, title: joinText(room.title), participantId,
    displayName, currentDisplayName: joinText(otherIdentity?.get("displayName") ?? prior?.displayName) || null,
    switchRequired, signedInAccount: !isAnonymous, preview: !enter || switchRequired,
  };
  if (response.preview) return response;
  if (!canUseMembership(prior, enrollment, schoolId, pupilId)) return { error: "access_revoked" } as const;

  const otherMemberships = await readOtherRoomMemberships(input, pupilId);
  const conflict = otherMemberships.find(({ enrollment, membership }) => {
    const prior = membership.data();
    return isActiveSpaceMember(prior) && !canUseMembership(prior, enrollment, schoolId, pupilId);
  });
  if (conflict) {
    return { ...response, switchRequired: true, preview: true, currentDisplayName: joinText(conflict.membership.get("displayName")) || null };
  }

  const targets = [{ enrollment, membership: priorMembership }, ...otherMemberships];
  tx.set(binding, { schoolId, pupilId });
  for (const { enrollment, membership } of targets) {
    const prior = membership.data();
    if (!canUseMembership(prior, enrollment, schoolId, pupilId)) continue;
    // Leave an existing non-code school account membership independent of code rotation.
    const accountMembership = !!prior && isActiveSpaceMember(prior) && prior.schoolPupilCodeAccess !== true;
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
  if (attemptData) tx.delete(attempt);
  return response;
}
