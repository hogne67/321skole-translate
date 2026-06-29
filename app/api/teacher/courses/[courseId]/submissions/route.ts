import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { canAccessAcademy, hasAdminAccess } from "@/lib/courses/academyAccess";
import { normalizeCoursePlan } from "@/lib/courses/types";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTeacherOrAdmin(profile: unknown): boolean {
  if (!isRecord(profile)) return false;
  if (hasAdminAccess(profile)) return true;
  const roles = isRecord(profile.roles) ? profile.roles : null;
  return profile.role === "teacher" || roles?.teacher === true;
}

function dateIso(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value) {
    const candidate = value as { toDate?: unknown };
    if (typeof candidate.toDate === "function") {
      const date = candidate.toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : "";
    }
  }

  return "";
}

async function requireCourseAccess(req: Request, courseId: string) {
  const token = getBearerToken(req);
  if (!token) return { error: json({ error: "Missing Authorization Bearer token" }, 401) };

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(token);
  const uid = decoded.uid;

  const [profileSnap, courseSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("courses").doc(courseId).get(),
  ]);

  if (!courseSnap.exists) return { error: json({ error: "Course not found" }, 404) };

  const profile = profileSnap.exists ? (profileSnap.data() ?? {}) : {};
  const course = courseSnap.data() ?? {};
  const isAdmin = hasAdminAccess(profile);

  if (!isTeacherOrAdmin(profile) || !canAccessAcademy(profile)) {
    return { error: json({ error: "No academy access" }, 403) };
  }

  if (!isAdmin && course.ownerUid !== uid) {
    return { error: json({ error: "No access" }, 403) };
  }

  return { db, course };
}

export async function GET(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  try {
    const { courseId } = await ctx.params;
    if (!courseId) return json({ error: "Missing courseId" }, 400);

    const access = await requireCourseAccess(req, courseId);
    if ("error" in access) return access.error;

    const coursePlan = normalizeCoursePlan(access.course.coursePlan);
    const resourceById = new Map<
      string,
      { title: string; sessionTitle: string; sessionNumber: number }
    >();
    for (const session of coursePlan) {
      for (const resource of session.resources) {
        resourceById.set(resource.id, {
          title: resource.title || resource.type,
          sessionTitle: session.title,
          sessionNumber: session.sessionNumber,
        });
      }
    }

    const participantsSnap = await access.db
      .collection("courses")
      .doc(courseId)
      .collection("participants")
      .get();
    const participantByUid = new Map<string, { name: string; email: string; organization: string }>();
    for (const doc of participantsSnap.docs) {
      const data = doc.data() ?? {};
      const uid = safeString(data.participantUid);
      if (!uid) continue;
      participantByUid.set(uid, {
        name: safeString(data.name),
        email: safeString(data.email),
        organization: safeString(data.organization),
      });
    }

    const snap = await access.db
      .collection("practiceSubmissions")
      .where("courseId", "==", courseId)
      .limit(200)
      .get();

    const submissions = snap.docs
      .map((doc) => {
        const data = doc.data() ?? {};
        const uid = safeString(data.uid);
        const resourceId = safeString(data.courseResourceId);
        const resourceInfo = resourceById.get(resourceId);
        const participantInfo = participantByUid.get(uid);

        return {
          id: doc.id,
          uid,
          participantName: participantInfo?.name ?? "",
          participantEmail: participantInfo?.email ?? "",
          participantOrganization: participantInfo?.organization ?? "",
          lessonId: safeString(data.lessonId),
          publishedLessonId: safeString(data.publishedLessonId),
          courseSessionNumber: safeNumber(data.courseSessionNumber) ?? resourceInfo?.sessionNumber ?? null,
          courseSessionTitle: resourceInfo?.sessionTitle ?? "",
          courseResourceId: resourceId,
          courseResourceTitle: resourceInfo?.title ?? "",
          status: safeString(data.status) || "draft",
          source: safeString(data.source),
          kind: safeString(data.kind),
          feedback: safeString(data.feedback),
          instructorFeedback: safeString(data.instructorFeedback),
          reviewStatus: safeString(data.reviewStatus) || "none",
          updatedAt: dateIso(data.updatedAt),
          createdAt: dateIso(data.createdAt),
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return json({ submissions }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load course submissions";
    return json({ error: message }, 500);
  }
}
