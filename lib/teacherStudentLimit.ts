// lib/teacherStudentLimit.ts

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getBucketLimit, type AppRole, type PlanKey } from "@/lib/featureAccess";

type SpaceOwnerFields = {
  ownerId?: unknown;
  teacherId?: unknown;
  createdBy?: unknown;
  createdByUid?: unknown;
  uid?: unknown;
};

type SpaceTitleFields = {
  title?: unknown;
};

type SpaceMemberFields = {
  uid?: unknown;
  spaceId?: unknown;
  displayName?: unknown;
  isAnon?: unknown;
  archived?: unknown;
};

export type TeacherStudentSpaceInfo = {
  spaceId: string;
  title: string;
};

export type TeacherStudentOverviewItem = {
  uid: string;
  displayName: string;
  isAnon: boolean;
  spaces: TeacherStudentSpaceInfo[];
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

export function getTeacherUidFromSpaceData(data: DocumentData | undefined): string | null {
  if (!data || typeof data !== "object") return null;

  const d = data as SpaceOwnerFields;

  return (
    asNonEmptyString(d.ownerId) ||
    asNonEmptyString(d.teacherId) ||
    asNonEmptyString(d.createdByUid) ||
    asNonEmptyString(d.createdBy) ||
    asNonEmptyString(d.uid) ||
    null
  );
}

async function getSpaceIdsByOwnerField(
  db: Firestore,
  field: string,
  teacherUid: string
): Promise<string[]> {
  try {
    const qy = query(collection(db, "spaces"), where(field, "==", teacherUid));
    const snap = await getDocs(qy);
    return snap.docs.map((item) => item.id);
  } catch {
    return [];
  }
}

export async function getTeacherSpaceIds(db: Firestore, teacherUid: string): Promise<string[]> {
  const all = await Promise.all([
    getSpaceIdsByOwnerField(db, "ownerId", teacherUid),
    getSpaceIdsByOwnerField(db, "teacherId", teacherUid),
    getSpaceIdsByOwnerField(db, "createdByUid", teacherUid),
    getSpaceIdsByOwnerField(db, "createdBy", teacherUid),
    getSpaceIdsByOwnerField(db, "uid", teacherUid),
  ]);

  return Array.from(new Set(all.flat().filter(Boolean)));
}

async function querySpacesByOwnerField(
  db: Firestore,
  field: string,
  teacherUid: string
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  try {
    const qy = query(collection(db, "spaces"), where(field, "==", teacherUid));
    const snap = await getDocs(qy);
    return snap.docs;
  } catch {
    return [];
  }
}

async function getTeacherSpacesMap(
  db: Firestore,
  teacherUid: string
): Promise<Map<string, TeacherStudentSpaceInfo>> {
  const map = new Map<string, TeacherStudentSpaceInfo>();

  const all = await Promise.all([
    querySpacesByOwnerField(db, "ownerId", teacherUid),
    querySpacesByOwnerField(db, "teacherId", teacherUid),
    querySpacesByOwnerField(db, "createdByUid", teacherUid),
    querySpacesByOwnerField(db, "createdBy", teacherUid),
    querySpacesByOwnerField(db, "uid", teacherUid),
  ]);

  for (const snapDoc of all.flat()) {
    const data = snapDoc.data() as SpaceTitleFields;
    const title = asNonEmptyString(data.title) ?? "Untitled space";

    map.set(snapDoc.id, {
      spaceId: snapDoc.id,
      title,
    });
  }

  return map;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function getMemberUid(docSnap: QueryDocumentSnapshot<DocumentData>): string | null {
  const data = docSnap.data() as SpaceMemberFields;
  return asNonEmptyString(data.uid);
}

function getMemberDisplayName(docSnap: QueryDocumentSnapshot<DocumentData>): string {
  const data = docSnap.data() as SpaceMemberFields;
  return asNonEmptyString(data.displayName) ?? "Unnamed student";
}

function getMemberIsAnon(docSnap: QueryDocumentSnapshot<DocumentData>): boolean {
  const data = docSnap.data() as SpaceMemberFields;
  return asBoolean(data.isAnon);
}

function isArchivedMember(docSnap: QueryDocumentSnapshot<DocumentData>): boolean {
  const data = docSnap.data() as SpaceMemberFields;
  return asBoolean(data.archived);
}

export async function getTeacherStudentCount(db: Firestore, teacherUid: string): Promise<number> {
  const items = await getTeacherStudentsOverview(db, teacherUid);
  return items.length;
}

export function getTeacherStudentLimit(
  roleInput: AppRole | string,
  planInput: PlanKey | string
): number {
  return getBucketLimit(roleInput, planInput, "members");
}

export async function canTeacherAddStudent(params: {
  db: Firestore;
  teacherUid: string;
  role: AppRole | string;
  plan: PlanKey | string;
}) {
  const { db, teacherUid, role, plan } = params;
  const used = await getTeacherStudentCount(db, teacherUid);
  const limit = getTeacherStudentLimit(role, plan);
  const remaining = Math.max(0, limit - used);

  return {
    allowed: used < limit,
    used,
    limit,
    remaining,
  };
}

export async function isUserAlreadyStudentInSpace(params: {
  db: Firestore;
  spaceId: string;
  uid: string;
}) {
  const { db, spaceId, uid } = params;

  const qy = query(
    collection(db, "spaceMembers"),
    where("spaceId", "==", spaceId),
    where("uid", "==", uid),
    limit(1)
  );

  const snap = await getDocs(qy);
  return !snap.empty;
}

export async function getTeacherStudentsOverview(
  db: Firestore,
  teacherUid: string
): Promise<TeacherStudentOverviewItem[]> {
  const spacesMap = await getTeacherSpacesMap(db, teacherUid);
  const spaceIds = Array.from(spacesMap.keys());

  if (spaceIds.length === 0) return [];

  const batches = chunkArray(spaceIds, 10);
  const studentMap = new Map<string, TeacherStudentOverviewItem>();

  for (const batch of batches) {
    const qy = query(
      collection(db, "spaceMembers"),
      where("spaceId", "in", batch),
      where("role", "==", "student")
    );

    const snap = await getDocs(qy);

    for (const snapDoc of snap.docs) {
      if (isArchivedMember(snapDoc)) continue;

      const uid = getMemberUid(snapDoc);
      const data = snapDoc.data() as SpaceMemberFields;
      const spaceId = asNonEmptyString(data.spaceId);

      if (!uid || !spaceId) continue;

      const spaceInfo = spacesMap.get(spaceId);
      if (!spaceInfo) continue;

      const current = studentMap.get(uid);

      if (!current) {
        studentMap.set(uid, {
          uid,
          displayName: getMemberDisplayName(snapDoc),
          isAnon: getMemberIsAnon(snapDoc),
          spaces: [spaceInfo],
        });
        continue;
      }

      const hasSpace = current.spaces.some((space) => space.spaceId === spaceId);
      if (!hasSpace) {
        current.spaces.push(spaceInfo);
      }

      if (!current.displayName || current.displayName === "Unnamed student") {
        current.displayName = getMemberDisplayName(snapDoc);
      }

      if (current.isAnon) {
        current.isAnon = getMemberIsAnon(snapDoc);
      }
    }
  }

  return Array.from(studentMap.values())
    .map((item) => ({
      ...item,
      spaces: [...item.spaces].sort((a, b) => a.title.localeCompare(b.title, "en")),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "en"));
}

async function getTeacherStudentMembershipDocs(params: {
  db: Firestore;
  teacherUid: string;
  studentUid: string;
}): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const { db, teacherUid, studentUid } = params;
  const spaceIds = await getTeacherSpaceIds(db, teacherUid);

  if (spaceIds.length === 0) return [];

  const batches = chunkArray(spaceIds, 10);
  const docs: QueryDocumentSnapshot<DocumentData>[] = [];

  for (const batch of batches) {
    const qy = query(
      collection(db, "spaceMembers"),
      where("spaceId", "in", batch),
      where("uid", "==", studentUid),
      where("role", "==", "student")
    );

    const snap = await getDocs(qy);
    docs.push(...snap.docs);
  }

  return docs;
}

export async function archiveStudentFromTeacherSpaces(params: {
  db: Firestore;
  teacherUid: string;
  studentUid: string;
}) {
  const { db, teacherUid, studentUid } = params;
  const membershipDocs = await getTeacherStudentMembershipDocs({
    db,
    teacherUid,
    studentUid,
  });

  for (const membershipDoc of membershipDocs) {
    await updateDoc(doc(db, "spaceMembers", membershipDoc.id), {
      archived: true,
    });
  }

  return {
    affected: membershipDocs.length,
  };
}

export async function removeStudentFromTeacherSpaces(params: {
  db: Firestore;
  teacherUid: string;
  studentUid: string;
}) {
  const { db, teacherUid, studentUid } = params;
  const membershipDocs = await getTeacherStudentMembershipDocs({
    db,
    teacherUid,
    studentUid,
  });

  for (const membershipDoc of membershipDocs) {
    await deleteDoc(doc(db, "spaceMembers", membershipDoc.id));
  }

  return {
    affected: membershipDocs.length,
  };
}