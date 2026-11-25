import "server-only";

import type { DocumentReference, DocumentSnapshot, Firestore, Transaction } from "firebase-admin/firestore";
import { isActiveSpaceMember } from "@/lib/security/spaceAccess";
import {
  SubmissionWriteError, type SubmissionContext, validSubmissionPart, validateStoredStudentSubmission, validateStoredSubmissionIndex,
} from "@/lib/security/studentSubmissionPolicy";

type LegacyRoomParticipant = { spaceId: string; schoolId: string; pupilId: string; participantId: string };

export function legacyCodeDeviceUids(rows: readonly DocumentSnapshot[], identity: LegacyRoomParticipant) {
  const { spaceId, schoolId, pupilId, participantId } = identity;
  const uids = new Set<string>();
  for (const row of rows) {
    const data = row.data();
    const uid = data?.uid;
    if (!data || !validSubmissionPart(uid) || row.id !== `${spaceId}_${uid}`
      || data.spaceId !== spaceId || data.role !== "student" || data.isAnon !== true
      || data.schoolPupilId !== pupilId || data.schoolPupilSchoolId !== schoolId || data.participantId !== participantId
      || data.schoolPupilRegistration === true || data.schoolPupilAccountUid || data.schoolPupilCodeAccess !== true
      || (data.userId !== undefined && data.userId !== uid)
      || (!isActiveSpaceMember(data) && !(data.status === "school_code_rotated" && data.active === false && data.archived === true))) continue;
    uids.add(uid);
  }
  return uids;
}

type IdentityUpdate = { ref: DocumentReference; fields: { participantId: string; uid?: string } };
type LegacyCandidate = { context: SubmissionContext; ref: DocumentReference; data: Record<string, unknown> };
type RoomTransfer = { spaceId: string; participantId: string; deviceUids: Set<string>; accountUid: string };
const scopeFields = ["spaceId", "assignmentId", "activityId", "lessonId"];
const authorFields = ["uid", "studentUid", "userId", "ownerUid", "ownerId", "participantId", "auth"];

async function readDocuments(tx: Transaction, refs: DocumentReference[]) {
  const documents: DocumentSnapshot[] = [];
  const batchSize = 200;
  for (let offset = 0; offset < refs.length; offset += batchSize) {
    documents.push(...await tx.getAll(...refs.slice(offset, offset + batchSize), { fieldMask: [...scopeFields, ...authorFields] }));
  }
  return documents;
}

function missingParticipant(data: Record<string, unknown>) {
  return data.participantId === undefined || data.participantId === "";
}

function needsLegacyBinding(data: Record<string, unknown>) {
  return missingParticipant(data) || data.uid === undefined;
}

function legacyIdentityUpdate(data: Record<string, unknown>, context: SubmissionContext) {
  return {
    participantId: context.participantId,
    // Some older writing rows record the author only as studentUid.
    ...(data.uid === undefined ? { uid: context.uid } : {}),
  };
}

function matchesLegacyIdentity(data: Record<string, unknown>, context: SubmissionContext) {
  const { uid, participantId } = context;
  if ((data.uid ?? data.studentUid) !== uid || (data.uid !== undefined && data.uid !== uid)
    || (data.studentUid !== undefined && data.studentUid !== uid && data.studentUid !== participantId)
    || (data.userId !== undefined && data.userId !== uid)
    || (data.ownerUid !== undefined && data.ownerUid !== uid)
    || (data.ownerId !== undefined && data.ownerId !== uid)
    || (!missingParticipant(data) && data.participantId !== participantId)) return false;
  if (data.auth !== undefined) {
    if (!data.auth || typeof data.auth !== "object" || Array.isArray(data.auth)) return false;
    const auth = data.auth as Record<string, unknown>;
    if ((auth.uid !== undefined && auth.uid !== uid) || auth.isAnon === false
      || (auth.participantId !== undefined && auth.participantId !== uid && auth.participantId !== participantId)) return false;
  }
  try {
    validateStoredStudentSubmission({ ...data, ...legacyIdentityUpdate(data, context) }, context);
  } catch (error) {
    if (error instanceof SubmissionWriteError) return false;
    throw error;
  }
  return true;
}

function matchesLegacyIndex(index: Record<string, unknown>, candidate: LegacyCandidate) {
  const { context, data } = candidate;
  const { spaceId, activityId, kind } = context;
  if (index.spaceId !== spaceId || (kind === "lessons"
    ? (index.assignmentId ?? index.lessonId) !== activityId
    : index.activityId !== activityId)
    || !matchesLegacyIdentity(index, context)) return false;
  try {
    validateStoredSubmissionIndex(
      { ...index, ...legacyIdentityUpdate(index, context) },
      { ...data, ...legacyIdentityUpdate(data, context) },
      context,
    );
  } catch (error) {
    if (error instanceof SubmissionWriteError) return false;
    throw error;
  }
  return true;
}

export async function planLegacySchoolSubmissionTransfer(
  db: Firestore, tx: Transaction, { spaceId, participantId, deviceUids, accountUid }: RoomTransfer,
): Promise<{ updates: IdentityUpdate[]; accountConflict: boolean }> {
  const room = db.collection("spaces").doc(spaceId);
  const kinds = ["lessons", "writingActivities"] as const;
  const activities = await Promise.all(kinds.map(kind => tx.get(room.collection(kind).select())));
  const uids = new Set([...deviceUids, accountUid]);
  const lookups = new Map<string, DocumentReference>();
  const accountPaths = new Set<string>();
  for (const [index, { docs }] of activities.entries()) {
    const kind = kinds[index];
    for (const activity of docs) {
      if (!validSubmissionPart(activity.id)) continue;
      for (const uid of uids) {
        for (const id of [uid, `${spaceId}_${activity.id}_${uid}`]) {
          if (!validSubmissionPart(id)) continue;
          const ref = room.collection(kind).doc(activity.id).collection("submissions").doc(id);
          lookups.set(ref.path, ref);
          if (uid === accountUid) accountPaths.add(ref.path);
        }
      }
    }
  }

  // Read exact room-local legacy locations. Never search an older device's private or other-room work.
  const candidates: LegacyCandidate[] = [];
  for (const snapshot of await readDocuments(tx, [...lookups.values()])) {
    const data = snapshot.data();
    const uid = data?.uid ?? data?.studentUid;
    const activity = snapshot.ref.parent.parent;
    const kind = activity?.parent.id;
    if (!data || !activity || (kind !== "lessons" && kind !== "writingActivities")) continue;
    const context: SubmissionContext = { kind, spaceId, activityId: activity.id, submissionId: snapshot.id, uid: accountUid, participantId };
    if (typeof uid === "string" && deviceUids.has(uid)
      && (snapshot.id === uid || snapshot.id === `${spaceId}_${activity.id}_${uid}`)) {
      const legacyContext = { ...context, uid };
      if (matchesLegacyIdentity(data, legacyContext)) {
        candidates.push({ context: legacyContext, ref: snapshot.ref, data });
        continue;
      }
    }
    if (accountPaths.has(snapshot.ref.path)) {
      try {
        validateStoredStudentSubmission(data, context);
        if (!missingParticipant(data) || accountUid === participantId) continue;
      } catch (error) {
        if (!(error instanceof SubmissionWriteError)) throw error;
      }
      return { updates: [], accountConflict: true };
    }
  }

  const indexCollection = db.collection("spaceSubmissions");
  const indexIds = new Set(candidates.map(candidate => candidate.ref.id));
  const indexes = new Map((await readDocuments(tx, [...indexIds].map(id => indexCollection.doc(id))))
    .map(snapshot => [snapshot.id, snapshot]));
  const updates = new Map<string, IdentityUpdate>();
  for (const candidate of candidates) {
    const { ref, data, context } = candidate;
    if (needsLegacyBinding(data)) updates.set(ref.path, { ref, fields: legacyIdentityUpdate(data, context) });
    const index = indexes.get(ref.id);
    const indexData = index?.data();
    if (index && indexData && needsLegacyBinding(indexData) && matchesLegacyIndex(indexData, candidate)) {
      updates.set(index.ref.path, { ref: index.ref, fields: legacyIdentityUpdate(indexData, context) });
    }
  }
  return { updates: [...updates.values()], accountConflict: false };
}
