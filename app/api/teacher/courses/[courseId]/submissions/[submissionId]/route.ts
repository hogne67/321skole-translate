import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { canAccessAcademy, hasAdminAccess } from "@/lib/courses/academyAccess";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTeacherOrAdmin(profile: unknown): boolean {
  if (!isRecord(profile)) return false;
  if (hasAdminAccess(profile)) return true;
  const roles = isRecord(profile.roles) ? profile.roles : null;
  return profile.role === "teacher" || roles?.teacher === true;
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

  return { db };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ courseId: string; submissionId: string }> }
) {
  try {
    const { courseId, submissionId } = await ctx.params;
    if (!courseId || !submissionId) return json({ error: "Missing id" }, 400);

    const access = await requireCourseAccess(req, courseId);
    if ("error" in access) return access.error;

    const snap = await access.db.collection("practiceSubmissions").doc(submissionId).get();
    if (!snap.exists) return json({ error: "Submission not found" }, 404);

    const data = snap.data() ?? {};
    if (safeString(data.courseId) !== courseId) return json({ error: "No access" }, 403);

    return json(
      {
        submission: {
          id: snap.id,
          uid: safeString(data.uid),
          lessonId: safeString(data.lessonId),
          publishedLessonId: safeString(data.publishedLessonId),
          courseSessionNumber: typeof data.courseSessionNumber === "number" ? data.courseSessionNumber : null,
          courseResourceId: safeString(data.courseResourceId),
          status: safeString(data.status) || "draft",
          answers: isRecord(data.answers) ? data.answers : {},
          feedback: safeString(data.feedback),
          instructorFeedback: safeString(data.instructorFeedback),
          reviewStatus: safeString(data.reviewStatus) || "none",
        },
      },
      200
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load submission";
    return json({ error: message }, 500);
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ courseId: string; submissionId: string }> }
) {
  try {
    const { courseId, submissionId } = await ctx.params;
    if (!courseId || !submissionId) return json({ error: "Missing id" }, 400);

    const access = await requireCourseAccess(req, courseId);
    if ("error" in access) return access.error;

    const body = (await req.json().catch(() => ({}))) as {
      instructorFeedback?: unknown;
      reviewStatus?: unknown;
    };
    const instructorFeedback = safeString(body.instructorFeedback).slice(0, 5000);
    const reviewStatus =
      body.reviewStatus === "approved" || body.reviewStatus === "needs_work"
        ? body.reviewStatus
        : "none";

    const ref = access.db.collection("practiceSubmissions").doc(submissionId);
    const snap = await ref.get();
    if (!snap.exists) return json({ error: "Submission not found" }, 404);

    const data = snap.data() ?? {};
    if (safeString(data.courseId) !== courseId) return json({ error: "No access" }, 403);

    await ref.set(
      {
        instructorFeedback,
        reviewStatus,
        instructorFeedbackUpdatedAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return json({ submissionId }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update submission";
    return json({ error: message }, 500);
  }
}
