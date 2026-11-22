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
  return data && !data.deletedAt && data.archived !== true && data.status !== "archived";
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

export async function joinSchoolPupil(input: JoinSchoolPupilInput) {
  const { db, tx, schoolId, spaceId, room, uid, isAnonymous, studentCode, enter } = input;
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
  const data = registration.data();
  if (pupil.get("codeHash") !== hash || !data || !isActiveSpaceMember(data)
    || data.role !== "student" || data.schoolPupilId !== pupilId || data.schoolPupilSchoolId !== schoolId) {
    return { error: "invalid_student_code" } as const;
  }
  const displayName = joinText(pupil.get("displayName"));
  const participantId = joinText(data.participantId);
  if (!displayName || !participantId) return { error: "invalid_student_code" } as const;

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
    || (prior && isActiveSpaceMember(prior) && (prior.role !== "student" || prior.participantId !== participantId))
    || getSpaceOwnerUid(room) === uid
    || (accountRole && accountRole !== "student") || profile.get("roles.admin") === true || profile.get("roles.teacher") === true,
  );
  const response = {
    ok: true as const, spaceId, title: joinText(room.title), participantId,
    displayName, currentDisplayName: joinText(otherIdentity?.get("displayName") ?? prior?.displayName) || null,
    switchRequired, signedInAccount: !isAnonymous, preview: !enter || switchRequired,
  };
  if (response.preview) return response;
  if (prior && !isActiveSpaceMember(prior)
    && !(prior.schoolPupilId === pupilId && prior.schoolPupilSchoolId === schoolId
      && prior.participantId === participantId && (prior.status === "school_code_rotated" || prior.status === "removed"))) {
    return { error: "access_revoked" } as const;
  }

  // Leave an existing non-code school account membership independent of code rotation.
  const accountMembership = !!prior && isActiveSpaceMember(prior) && prior.schoolPupilCodeAccess !== true;
  tx.set(binding, { schoolId, pupilId });
  tx.set(membership, {
    spaceId, uid, participantId, role: "student", displayName, studentName: displayName,
    schoolPupilSchoolId: schoolId, schoolPupilId: pupilId, teacherStudentId: data.teacherStudentId || pupilId,
    active: true, archived: false, status: "active", isAnon: isAnonymous,
    schoolPupilCodeAccess: !accountMembership,
    updatedAt: FieldValue.serverTimestamp(),
    ...(!priorMembership.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
  }, { merge: true });
  if (attemptData) tx.delete(attempt);
  return response;
}
