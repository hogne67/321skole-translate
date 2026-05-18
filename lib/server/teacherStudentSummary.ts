// lib/server/teacherStudentSummary.ts
import { getBucketLimit, type AppRole, type PlanKey } from "@/lib/featureAccess";

type SpaceMemberFields = {
  uid?: unknown;
  archived?: unknown;
  active?: unknown;
  status?: unknown;
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function safeRole(role?: string): AppRole {
  if (role === "teacher") return "teacher";
  if (role === "student") return "student";
  if (role === "parent") return "parent";
  if (role === "creator") return "creator";
  if (role === "admin") return "admin";
  return "teacher";
}

function safePlan(plan?: string): PlanKey {
  if (plan === "basic") return "basic";
  if (plan === "plus") return "plus";
  if (plan === "pro") return "pro";
  return "free";
}

async function getSpaceIdsByOwnerField(
  db: FirebaseFirestore.Firestore,
  field: string,
  teacherUid: string
): Promise<string[]> {
  try {
    const snap = await db.collection("spaces").where(field, "==", teacherUid).get();
    return snap.docs.map((doc) => doc.id);
  } catch {
    return [];
  }
}

export async function getTeacherSpaceIdsAdmin(
  db: FirebaseFirestore.Firestore,
  teacherUid: string
): Promise<string[]> {
  const all = await Promise.all([
    getSpaceIdsByOwnerField(db, "ownerId", teacherUid),
    getSpaceIdsByOwnerField(db, "teacherId", teacherUid),
    getSpaceIdsByOwnerField(db, "createdByUid", teacherUid),
    getSpaceIdsByOwnerField(db, "createdBy", teacherUid),
    getSpaceIdsByOwnerField(db, "uid", teacherUid),
  ]);

  return Array.from(new Set(all.flat().filter(Boolean)));
}

export async function getTeacherActiveStudentUidsAdmin(
  db: FirebaseFirestore.Firestore,
  teacherUid: string
): Promise<Set<string>> {
  const spaceIds = await getTeacherSpaceIdsAdmin(db, teacherUid);
  const uidSet = new Set<string>();

  if (spaceIds.length === 0) return uidSet;

  const batches = chunkArray(spaceIds, 10);

  for (const batch of batches) {
    const snap = await db
      .collection("spaceMembers")
      .where("spaceId", "in", batch)
      .where("role", "==", "student")
      .get();

    for (const docSnap of snap.docs) {
      const data = docSnap.data() as SpaceMemberFields;
      const uid = asNonEmptyString(data.uid);
      const archived = asBoolean(data.archived);
      const status = asNonEmptyString(data.status)?.toLowerCase();

      if (!uid || archived || data.active === false || status === "removed") continue;
      uidSet.add(uid);
    }
  }

  return uidSet;
}

export async function getTeacherActiveStudentCountAdmin(
  db: FirebaseFirestore.Firestore,
  teacherUid: string
): Promise<number> {
  const uidSet = await getTeacherActiveStudentUidsAdmin(db, teacherUid);
  return uidSet.size;
}

export function getTeacherMemberLimit(role?: string, plan?: string): number {
  return getBucketLimit(safeRole(role), safePlan(plan), "members");
}
