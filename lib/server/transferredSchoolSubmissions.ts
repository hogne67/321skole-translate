import "server-only";

import type { Firestore, Transaction } from "firebase-admin/firestore";
import { isActiveSpaceMember, isSchoolSpace } from "@/lib/security/spaceAccess";
import type { getSpaceAccess } from "@/lib/security/spaceAccess.server";
import {
  SubmissionWriteError, validSubmissionPart, validateStoredStudentSubmission, validateStoredSubmissionIndex,
} from "@/lib/security/studentSubmissionPolicy";
import { documentId, schoolPupilRegistrationId } from "./schoolSpacePupilCode";

export async function transferredSchoolParticipant(
  db: Firestore,
  spaceId: string,
  uid: string,
  access: Awaited<ReturnType<typeof getSpaceAccess>>,
  tx?: Transaction,
) {
  const { active, canRead, member, participantId, space } = access;
  const schoolId = documentId(member?.schoolPupilSchoolId);
  const pupilId = documentId(member?.schoolPupilId);
  if (!active || !canRead || !schoolId || !pupilId || !isSchoolSpace(space, schoolId)
    || !member || member.role !== "student" || member.uid !== uid || member.spaceId !== spaceId
    || member.schoolPupilAccountUid !== uid || member.schoolPupilCodeAccess !== false
    || !validSubmissionPart(participantId)) return null;

  const ref = db.collection("spaceMembers").doc(schoolPupilRegistrationId(spaceId, pupilId));
  const registration = (await (tx ? tx.get(ref) : ref.get())).data();
  if (!registration || registration.role !== "student" || registration.spaceId !== spaceId
    || registration.schoolPupilRegistration !== true || !isActiveSpaceMember(registration)
    || registration.schoolPupilId !== pupilId || registration.schoolPupilSchoolId !== schoolId
    || registration.schoolPupilAccountUid !== uid || registration.participantId !== participantId) return null;
  return participantId;
}

export async function matchesTransferredSchoolSubmission(
  db: Firestore,
  spaceId: string,
  uid: string,
  participantId: string,
  submissionId: string,
  index: Record<string, unknown>,
  tx?: Transaction,
) {
  if (index.spaceId !== spaceId || index.participantId !== participantId || !validSubmissionPart(submissionId)) return false;
  const kind = "assignmentId" in index || (!("activityId" in index) && "lessonId" in index) ? "lessons" : "writingActivities";
  const activityId = kind === "lessons" ? index.assignmentId ?? index.lessonId : index.activityId;
  if (!validSubmissionPart(activityId)) return false;
  const ref = db.collection("spaces").doc(spaceId).collection(kind).doc(activityId).collection("submissions").doc(submissionId);
  const canonical = (await (tx ? tx.get(ref) : ref.get())).data();
  if (canonical?.participantId !== participantId) return false;
  const context = { kind, spaceId, activityId, submissionId, uid, participantId } as const;
  try {
    validateStoredStudentSubmission(canonical, context);
    validateStoredSubmissionIndex(index, canonical, context);
  } catch (error) {
    if (error instanceof SubmissionWriteError) return false;
    throw error;
  }
  return true;
}
