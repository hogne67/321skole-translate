// lib/dashboardSubmissionStats.ts
import {
  collection,
  getDocs,
  query,
  where,
  type Firestore,
} from "firebase/firestore";

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
  if (compact === "reviewed") return "reviewed";
  if (compact === "approved") return "approved";
  if (compact === "submitted") return "submitted";
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

  return {
    stats,
    hasSpaces: !memberSnap.empty,
    spaceCount: memberSnap.size,
  };
}

export async function getTeacherDashboardStats(
  db: Firestore,
  teacherUid: string
): Promise<TeacherDashboardStatsResult> {
  const stats = emptyStats();

  const spacesSnap = await getDocs(
    query(collection(db, "spaces"), where("ownerId", "==", teacherUid))
  );

  const spaceIds = spacesSnap.docs.map((docSnap) => docSnap.id);

  if (spaceIds.length === 0) {
    return {
      stats,
      spaceCount: 0,
    };
  }

  const submissionSnaps = await Promise.all(
    spaceIds.map((spaceId) =>
      getDocs(query(collection(db, "spaceSubmissions"), where("spaceId", "==", spaceId)))
    )
  );

  submissionSnaps.forEach((snap) => {
    snap.forEach((docSnap) => {
      const data = docSnap.data() as { status?: unknown };
      addStatus(stats, data.status);
    });
  });

  return {
    stats,
    spaceCount: spaceIds.length,
  };
}