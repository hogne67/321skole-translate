import "server-only";

import type { DocumentData, Firestore, QueryDocumentSnapshot, Transaction } from "firebase-admin/firestore";
import { getBucketLimit, getEffectivePlan, type AppRole } from "@/lib/featureAccess";
import { joinText } from "@/lib/spaceJoinPolicy";
import { isActiveTeacherPupil, teacherStudentIdentity } from "@/lib/teacherStudentIdentity";

const ownerFields = ["ownerId", "ownerUid", "teacherId", "createdByUid", "createdBy", "uid"];

export async function readTeacherRosterRooms(db: Firestore, owner: string, schoolId: string, tx?: Transaction) {
  // Query failures must not silently undercount licence usage.
  const owned = await Promise.all(ownerFields.map(field => {
    const query = db.collection("spaces").where(field, "==", owner);
    return tx ? tx.get(query) : query.get();
  }));
  return new Map(owned.flatMap(snap => snap.docs).flatMap(row => {
    const room = row.data();
    const sameArea = schoolId ? room.schoolId === schoolId : room.schoolId == null;
    return sameArea && ownerFields.map(field => joinText(room[field])).find(Boolean) === owner
      ? [[row.id, room] as const] : [];
  }));
}

export async function readTeacherRosterMembers(db: Firestore, spaceIds: string[], tx?: Transaction) {
  const rows: QueryDocumentSnapshot[] = [];
  for (let i = 0; i < spaceIds.length; i += 10) {
    const query = db.collection("spaceMembers").where("spaceId", "in", spaceIds.slice(i, i + 10));
    const matching = tx ? await tx.get(query) : await query.get();
    rows.push(...matching.docs.filter(doc => doc.data().role === "student"));
  }
  return rows;
}

export function teacherRosterLimit(profile: DocumentData, schoolId: string) {
  const plan = getEffectivePlan(schoolId ? profile : { ...profile, schoolId: null });
  const role = joinText(profile.role) || "teacher";
  return getBucketLimit(role as AppRole, plan, "members");
}

export async function availableTeacherRosterSlot(
  { db, tx, owner, spaceIds, limit }: { db: Firestore; tx: Transaction; owner: string; spaceIds: string[]; limit: number },
  existingIdentity?: string,
) {
  const lock = db.collection("teacherRosterLocks").doc(owner);
  await tx.get(lock);
  const members = await readTeacherRosterMembers(db, spaceIds, tx);
  const pupils = new Set(members.map(row => row.data()).filter(isActiveTeacherPupil).map(teacherStudentIdentity).filter(Boolean));
  return (existingIdentity && pupils.has(existingIdentity)) || pupils.size < limit ? lock : null;
}
