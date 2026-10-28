import "server-only";
import { isGloballyEnabled } from "./accountAccess.server";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { isActiveSpaceMember, isSpaceTeachingMember } from "./spaceAccess";
import { hasSpaceOwnerAccess } from "./spaceOwnership";

export async function getActiveSpaceMembership(db: Firestore, spaceId: string, uid: string) {
  if (!isGloballyEnabled((await db.doc(`users/${uid}`).get()).data())) return { ok: false, participantId: uid };
  const canonical = await db.doc(`spaceMembers/${spaceId}_${uid}`).get();
  // A tombstone is authoritative; a stale legacy access must not undo revocation.
  if (canonical.exists) {
    const data = canonical.data();
    return { ok: isActiveSpaceMember(data), participantId: typeof data?.participantId === "string" ? data.participantId : uid };
  }
  // Firebase rules use the canonical key. Legacy rows must not grant extra API access.
  return { ok: false, participantId: uid };
}

export async function getSpaceAccess(db: Firestore, spaceId: string, uid: string, transaction?: Transaction) {
  const read = (path: string) => transaction ? transaction.get(db.doc(path)) : db.doc(path).get();
  const [spaceSnap, profileSnap, memberSnap] = await Promise.all([
    read(`spaces/${spaceId}`), read(`users/${uid}`), read(`spaceMembers/${spaceId}_${uid}`),
  ]);
  const space = spaceSnap.data();
  const profile = profileSnap.data();
  const member = memberSnap.data();
  const enabled = isGloballyEnabled(profile);
  const active = enabled && isActiveSpaceMember(member);
  const admin = enabled && (profile?.role === "admin" || profile?.roles?.admin === true);
  const owner = enabled && hasSpaceOwnerAccess(space, uid, memberSnap.exists ? member : null);
  // School administration does not grant access to teaching or pupil content.
  const canTeach = !!space && enabled && (admin || owner || isSpaceTeachingMember(member));
  return { exists: !!space, space, profile, member, active, owner, canTeach,
    canRead: !!space && (canTeach || active), participantId: active && typeof member?.participantId === "string" ? member.participantId : uid };
}

export function submissionBelongsToPath(data: Record<string, unknown>, spaceId: string, assignmentId: string): boolean {
  // Older nested submissions omit these redundant fields; explicit mismatches are never accepted.
  return (!('spaceId' in data) || data.spaceId === spaceId) &&
    (!('assignmentId' in data) || data.assignmentId === assignmentId);
}

export function ownsSpaceSubmission(data: Record<string, unknown>, uid: string, participantId: string): boolean {
  return data.uid === uid || data.userId === uid || data.studentUid === uid ||
    data.participantId === participantId || data.studentUid === participantId;
}
