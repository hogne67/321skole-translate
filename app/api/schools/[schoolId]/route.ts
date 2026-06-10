import "server-only";

import { NextResponse } from "next/server";

import { getAdmin } from "@/lib/firebaseAdmin";
import { isActiveSchoolAdminMember } from "@/lib/schools";
import {
  countActiveTeachers,
  getSchool,
  getSchoolMember,
  schoolInvitesCollectionRef,
  schoolMembersCollectionRef,
} from "@/lib/schools/server";
import {
  getTeacherActiveStudentUidsAdmin,
  getTeacherSpaceIdsAdmin,
} from "@/lib/server/teacherStudentSummary";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    schoolId?: string;
  }>;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);

  return match ? match[1] : null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function timestampToIso(value: unknown): string | null {
  if (!value) return null;

  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object" && value !== null && "toDate" in value) {
    const maybeDate = (value as { toDate?: unknown }).toDate;
    if (typeof maybeDate === "function") {
      const date = maybeDate.call(value);
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
    }
  }

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}

function timestampToMs(value: unknown): number | null {
  const iso = timestampToIso(value);
  if (!iso) return null;

  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function getMonthId(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readSubmissionUid(data: FirebaseFirestore.DocumentData): string {
  const directUid = readString(data.uid);
  if (directUid) return directUid;

  const auth = data.auth;
  if (auth && typeof auth === "object") {
    return readString((auth as Record<string, unknown>).uid);
  }

  return "";
}

async function getSchoolUsageStats(schoolId: string) {
  const { db } = getAdmin();
  const activeTeacherSnap = await schoolMembersCollectionRef(schoolId)
    .where("role", "==", "school_teacher")
    .where("status", "==", "active")
    .get();

  const teacherUids = activeTeacherSnap.docs
    .map((doc) => readString(doc.data().uid || doc.id))
    .filter(Boolean);

  if (teacherUids.length === 0) {
    return {
      activeTeachersLast30Days: 0,
      latestTeacherLoginAt: null,
      totalStudentCount: 0,
      activeStudentsLast30Days: 0,
      totalSpaceCount: 0,
      activeSpacesLast30Days: 0,
      assignmentsLast30Days: 0,
      submissionsLast30Days: 0,
      aiFeedbackThisMonth: 0,
      premiumGeneratorsThisMonth: 0,
      imageGenerationThisMonth: 0,
      downloadsThisMonth: 0,
    };
  }

  const userRefs = teacherUids.map((uid) => db.collection("users").doc(uid));
  const userSnaps = await db.getAll(...userRefs);
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  let activeTeachersLast30Days = 0;
  let latestTeacherLoginAt: string | null = null;
  let latestTeacherLoginMs = 0;

  for (const userSnap of userSnaps) {
    const data = userSnap.exists ? userSnap.data() : null;
    const lastLoginAt = timestampToIso(data?.lastLoginAt);
    if (!lastLoginAt) continue;

    const ms = new Date(lastLoginAt).getTime();
    if (Number.isNaN(ms)) continue;

    if (ms >= thirtyDaysAgo) activeTeachersLast30Days += 1;

    if (ms > latestTeacherLoginMs) {
      latestTeacherLoginMs = ms;
      latestTeacherLoginAt = lastLoginAt;
    }
  }

  const [spaceIdsNested, activeStudentUidSets, usageSnaps] = await Promise.all([
    Promise.all(teacherUids.map((uid) => getTeacherSpaceIdsAdmin(db, uid))),
    Promise.all(teacherUids.map((uid) => getTeacherActiveStudentUidsAdmin(db, uid))),
    db.getAll(
      ...teacherUids.map((uid) =>
        db.collection("users").doc(uid).collection("usage").doc(getMonthId())
      )
    ),
  ]);

  const spaceIds = Array.from(new Set(spaceIdsNested.flat().filter(Boolean)));
  const totalStudentUids = new Set<string>();

  for (const uidSet of activeStudentUidSets) {
    for (const uid of uidSet) totalStudentUids.add(uid);
  }

  const activeSpaceIds = new Set<string>();
  const activeStudentUidsLast30Days = new Set<string>();
  const seenSubmissionKeys = new Set<string>();
  let assignmentsLast30Days = 0;
  let submissionsLast30Days = 0;
  let aiFeedbackThisMonth = 0;
  let premiumGeneratorsThisMonth = 0;
  let imageGenerationThisMonth = 0;
  let downloadsThisMonth = 0;

  for (const usageSnap of usageSnaps) {
    const usage = usageSnap.exists ? usageSnap.data() : {};
    aiFeedbackThisMonth += safeNumber(usage?.ai_feedback);
    premiumGeneratorsThisMonth += safeNumber(usage?.premium_generators);
    imageGenerationThisMonth += safeNumber(usage?.image_generation);
    downloadsThisMonth += safeNumber(usage?.downloads);
  }

  await Promise.all(
    spaceIds.map(async (spaceId) => {
      try {
        const lessonsSnap = await db.collection("spaces").doc(spaceId).collection("lessons").get();

        for (const lessonDoc of lessonsSnap.docs) {
          const data = lessonDoc.data();
          const ms =
            timestampToMs(data.assignedAt) ??
            timestampToMs(data.createdAt) ??
            timestampToMs(data.updatedAt);

          if (ms !== null && ms >= thirtyDaysAgo) {
            assignmentsLast30Days += 1;
            activeSpaceIds.add(spaceId);
          }
        }
      } catch {
        // Keep overview available even if one room has unusual data.
      }
    })
  );

  async function collectSubmissionDoc(
    docSnap: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
  ) {
    const data = docSnap.data();
    const spaceId = readString(data.spaceId);
    if (!spaceId) return;

    const assignmentId = readString(data.assignmentId) || readString(data.lessonId);
    const uid = readSubmissionUid(data);
    const key = `${spaceId}:${assignmentId || "-"}:${uid || "-"}:${docSnap.id}`;
    if (seenSubmissionKeys.has(key)) return;
    seenSubmissionKeys.add(key);

    const ms =
      timestampToMs(data.createdAt) ??
      timestampToMs(data.submittedAt) ??
      timestampToMs(data.updatedAt);

    if (ms !== null && ms >= thirtyDaysAgo) {
      submissionsLast30Days += 1;
      activeSpaceIds.add(spaceId);
      if (uid) activeStudentUidsLast30Days.add(uid);
    }
  }

  for (const batch of chunkArray(spaceIds, 10)) {
    try {
      const topLevelSnap = await db
        .collection("spaceSubmissions")
        .where("spaceId", "in", batch)
        .get();

      for (const docSnap of topLevelSnap.docs) {
        await collectSubmissionDoc(docSnap);
      }
    } catch {
      // The index collection is best-effort for this summary.
    }

    try {
      const nestedSnap = await db.collectionGroup("submissions").where("spaceId", "in", batch).get();

      for (const docSnap of nestedSnap.docs) {
        await collectSubmissionDoc(docSnap);
      }
    } catch {
      // Some older submission docs may not support this query yet.
    }
  }

  return {
    activeTeachersLast30Days,
    latestTeacherLoginAt,
    totalStudentCount: totalStudentUids.size,
    activeStudentsLast30Days: activeStudentUidsLast30Days.size,
    totalSpaceCount: spaceIds.length,
    activeSpacesLast30Days: activeSpaceIds.size,
    assignmentsLast30Days,
    submissionsLast30Days,
    aiFeedbackThisMonth,
    premiumGeneratorsThisMonth,
    imageGenerationThisMonth,
    downloadsThisMonth,
  };
}

async function countPendingTeacherInvites(schoolId: string): Promise<number> {
  const snapshot = await schoolInvitesCollectionRef()
    .where("schoolId", "==", schoolId)
    .where("role", "==", "school_teacher")
    .where("status", "==", "pending")
    .get();

  return snapshot.size;
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const authToken = getBearerToken(req);
    if (!authToken) {
      return json({ ok: false, error: "Missing Authorization Bearer token" }, 401);
    }

    const { schoolId: rawSchoolId } = await context.params;
    const schoolId = readString(rawSchoolId);

    if (!schoolId) {
      return json({ ok: false, error: "Missing schoolId" }, 400);
    }

    const { auth } = getAdmin();
    const decoded = await auth.verifyIdToken(authToken);
    const uid = decoded.uid;

    if (!uid) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const adminMember = await getSchoolMember(schoolId, uid);

    if (!isActiveSchoolAdminMember(adminMember)) {
      return json({ ok: false, error: "Forbidden" }, 403);
    }

    const school = await getSchool(schoolId);

    if (!school) {
      return json({ ok: false, error: "School not found" }, 404);
    }

    const [activeTeacherCount, pendingTeacherInviteCount, usageStats] = await Promise.all([
      countActiveTeachers(schoolId),
      countPendingTeacherInvites(schoolId),
      getSchoolUsageStats(schoolId),
    ]);

    return json({
      ok: true,
      schoolId,
      school,
      activeTeacherCount,
      pendingTeacherInviteCount,
      teacherSeatLimit: school.teacherSeatLimit,
      usageStats,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    return json({ ok: false, error: message || "Failed to load school" }, 500);
  }
}
