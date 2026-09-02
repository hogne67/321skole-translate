// lib/dashboardSubmissionStats.ts
import {
  collection,
  getDocs,
  query,
  where,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getTeacherUidFromSpaceData } from "@/lib/teacherStudentLimit";

export type SubmissionDashboardStats = {
  total: number;
  draft: number;
  submitted: number;
  needsWork: number;
  approved: number;
  other: number;
};

export type StudentDashboardStatsResult = {
  stats: SubmissionDashboardStats;
  hasSpaces: boolean;
  spaceCount: number;
};

export type TeacherDashboardStatsResult = {
  stats: SubmissionDashboardStats;
  spaceCount: number;
};

function emptyStats(): SubmissionDashboardStats {
  return {
    total: 0,
    draft: 0,
    submitted: 0,
    needsWork: 0,
    approved: 0,
    other: 0,
  };
}

function normalizeStatus(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";

  const compact = raw.replace(/[\s_-]+/g, "");

  if (compact === "needswork") return "needs_work";
  if (compact === "needwork") return "needs_work";
  if (compact === "reviewed") return "reviewed";
  if (compact === "approved") return "approved";
  if (compact === "ok") return "approved";
  if (compact === "submitted") return "submitted";
  if (compact === "planningsubmitted") return "submitted";
  if (compact === "planningreviewed") return "approved";
  if (compact === "draft") return "draft";
  if (compact === "rejected") return "rejected";

  return raw;
}

function addStatus(stats: SubmissionDashboardStats, status: unknown) {
  const normalized = normalizeStatus(status);

  stats.total += 1;

  if (normalized === "draft") {
    stats.draft += 1;
    return;
  }

  if (normalized === "submitted") {
    stats.submitted += 1;
    return;
  }

  if (normalized === "needs_work") {
    stats.needsWork += 1;
    return;
  }

  if (normalized === "reviewed" || normalized === "approved") {
    stats.approved += 1;
    return;
  }

  stats.other += 1;
}

function isActiveMembership(data: { archived?: unknown; active?: unknown; status?: unknown }): boolean {
  const status = typeof data.status === "string" ? data.status.trim().toLowerCase() : "";
  return data.archived !== true && data.active !== false && status !== "removed";
}

function isActiveSpace(data: DocumentData): boolean {
  const status = typeof data.status === "string" ? data.status.trim().toLowerCase() : "";
  return data.archived !== true && data.isOpen !== false && status !== "archived" && status !== "removed";
}

function isActiveAssignment(data: DocumentData): boolean {
  const status = normalizeStatus(data.status);
  return status !== "archived" && status !== "draft" && data.archived !== true;
}

function isVisibleSubmission(data: { status?: unknown; archived?: unknown; studentArchived?: unknown }): boolean {
  return normalizeStatus(data.status) !== "draft" && data.archived !== true && data.studentArchived !== true;
}

async function getSpacesByOwnerField(
  db: Firestore,
  field: string,
  teacherUid: string
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  try {
    const snap = await getDocs(query(collection(db, "spaces"), where(field, "==", teacherUid)));
    return snap.docs;
  } catch {
    return [];
  }
}

async function getActiveTeacherSpaces(
  db: Firestore,
  teacherUid: string
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const batches = await Promise.all([
    getSpacesByOwnerField(db, "ownerId", teacherUid),
    getSpacesByOwnerField(db, "ownerUid", teacherUid),
    getSpacesByOwnerField(db, "teacherId", teacherUid),
    getSpacesByOwnerField(db, "createdByUid", teacherUid),
    getSpacesByOwnerField(db, "createdBy", teacherUid),
    getSpacesByOwnerField(db, "uid", teacherUid),
  ]);

  const byId = new Map<string, QueryDocumentSnapshot<DocumentData>>();
  for (const docSnap of batches.flat()) {
    const data = docSnap.data();
    if (getTeacherUidFromSpaceData(data) !== teacherUid) continue;
    if (!isActiveSpace(data)) continue;
    byId.set(docSnap.id, docSnap);
  }

  return Array.from(byId.values());
}

async function countNestedSubmissionsForTask(
  db: Firestore,
  stats: SubmissionDashboardStats,
  path: [string, string, string, string]
) {
  const snap = await getDocs(collection(db, path[0], path[1], path[2], path[3], "submissions"));
  snap.forEach((docSnap) => {
    const data = docSnap.data() as { status?: unknown; archived?: unknown; studentArchived?: unknown };
    if (!isVisibleSubmission(data)) return;
    addStatus(stats, data.status);
  });
}

export async function getStudentDashboardStats(
  db: Firestore,
  uid: string
): Promise<StudentDashboardStatsResult> {
  const stats = emptyStats();

  const [submissionsSnap, memberSnap] = await Promise.all([
    getDocs(query(collection(db, "spaceSubmissions"), where("uid", "==", uid))),
    getDocs(query(collection(db, "spaceMembers"), where("uid", "==", uid))),
  ]);

  submissionsSnap.forEach((docSnap) => {
    const data = docSnap.data() as { status?: unknown };
    addStatus(stats, data.status);
  });

  const activeMembershipCount = memberSnap.docs.filter((docSnap) => isActiveMembership(docSnap.data())).length;

  return {
    stats,
    hasSpaces: activeMembershipCount > 0,
    spaceCount: activeMembershipCount,
  };
}

export async function getTeacherDashboardStats(
  db: Firestore,
  teacherUid: string
): Promise<TeacherDashboardStatsResult> {
  const stats = emptyStats();

  const spaces = await getActiveTeacherSpaces(db, teacherUid);

  if (spaces.length === 0) {
    return {
      stats,
      spaceCount: 0,
    };
  }

  await Promise.all(
    spaces.map(async (spaceSnap) => {
      const spaceId = spaceSnap.id;
      const [lessonsSnap, writingSnap] = await Promise.all([
        getDocs(collection(db, "spaces", spaceId, "lessons")),
        getDocs(collection(db, "spaces", spaceId, "writingActivities")),
      ]);

      const tasks = [
        ...lessonsSnap.docs
          .filter((docSnap) => isActiveAssignment(docSnap.data()))
          .map((docSnap) => ["spaces", spaceId, "lessons", docSnap.id] as [string, string, string, string]),
        ...writingSnap.docs
          .filter((docSnap) => isActiveAssignment(docSnap.data()))
          .map((docSnap) => ["spaces", spaceId, "writingActivities", docSnap.id] as [string, string, string, string]),
      ];

      await Promise.all(tasks.map((path) => countNestedSubmissionsForTask(db, stats, path)));
    })
  );

  return {
    stats,
    spaceCount: spaces.length,
  };
}
