import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { canAccessAcademy, hasAdminAccess } from "@/lib/courses/academyAccess";
import { buildCoursePublishChecklist } from "@/lib/courses/publishChecklist";
import {
  normalizeCourse,
  normalizeCourseMarketing,
  normalizeCourseSalesSettings,
  normalizeCoursePlan,
  normalizeSessionStatus,
  normalizeSessionResources,
  normalizeSessionResourceType,
  normalizeSessionResourceVisibility,
  syncCoursePlanSessionCount,
  type CoursePlanSession,
  type CourseStatus,
} from "@/lib/courses/types";

type CourseBody = {
  title?: unknown;
  description?: unknown;
  learningGoals?: unknown;
  targetAudience?: unknown;
  language?: unknown;
  level?: unknown;
  priceText?: unknown;
  maxParticipants?: unknown;
  numberOfSessions?: unknown;
  numberOfWeeks?: unknown;
  status?: unknown;
  coursePlan?: unknown;
  marketing?: unknown;
  sales?: unknown;
};

type CourseActionBody = {
  action?: unknown;
  locale?: unknown;
};

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

function safeNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function isCourseStatus(value: unknown): value is CourseStatus {
  return value === "draft" || value === "published" || value === "active" || value === "completed";
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

function serializeCourse(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    ownerUid: safeString(data.ownerUid),
    title: safeString(data.title),
    description: safeString(data.description),
    learningGoals: safeString(data.learningGoals),
    targetAudience: safeString(data.targetAudience),
    language: safeString(data.language),
    level: safeString(data.level),
    priceText: safeString(data.priceText),
    maxParticipants: safeNumber(data.maxParticipants),
    numberOfSessions: safeNumber(data.numberOfSessions),
    numberOfWeeks: safeNumber(data.numberOfWeeks),
    status: isCourseStatus(data.status) ? data.status : "draft",
    slug: safeString(data.slug),
    publicUrl: safeString(data.publicUrl),
    marketing: normalizeCourseMarketing(data.marketing),
    sales: normalizeCourseSalesSettings(data.sales),
    publishedAt: data.publishedAt?.toDate ? data.publishedAt.toDate().toISOString() : null,
    coursePlan: normalizeCoursePlan(data.coursePlan),
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null,
  };
}

function serializePlanForFirestore(plan: CoursePlanSession[]) {
  return plan.map((session, index) => ({
    sessionNumber:
      typeof session.sessionNumber === "number" && Number.isFinite(session.sessionNumber)
        ? session.sessionNumber
        : index + 1,
    title: safeString(session.title),
    description: safeString(session.description),
    contentSuggestions: safeString(session.contentSuggestions),
    resources: normalizeSessionResources(session.resources).map((resource) => ({
      id: safeString(resource.id),
      type: normalizeSessionResourceType(resource.type),
      visibility: normalizeSessionResourceVisibility(resource.visibility),
      sourceId: safeString(resource.sourceId),
      sourceType: safeString(resource.sourceType),
      title: safeString(resource.title),
      url: safeString(resource.url),
      description: safeString(resource.description),
    })),
    startsAt: safeString(session.startsAt),
    durationMinutes:
      typeof session.durationMinutes === "number" && Number.isFinite(session.durationMinutes)
        ? Math.max(0, session.durationMinutes)
        : 120,
    meetingUrl: safeString(session.meetingUrl),
    homework: safeString(session.homework),
    status: normalizeSessionStatus(session.status),
  }));
}

export async function GET(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { courseId } = await ctx.params;
    if (!courseId) return json({ error: "Missing courseId" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const profileSnap = await db.collection("users").doc(uid).get();
    const profile = profileSnap.exists ? (profileSnap.data() ?? {}) : {};
    const isAdmin = hasAdminAccess(profile);

    if (!isTeacherOrAdmin(profile) || !canAccessAcademy(profile)) {
      return json({ error: "No academy access" }, 403);
    }

    const courseSnap = await db.collection("courses").doc(courseId).get();
    if (!courseSnap.exists) return json({ error: "Course not found" }, 404);

    const data = courseSnap.data() ?? {};
    if (!isAdmin && data.ownerUid !== uid) return json({ error: "No access" }, 403);

    return json({ course: serializeCourse(courseSnap.id, data) }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load course";
    return json({ error: message }, 500);
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { courseId } = await ctx.params;
    if (!courseId) return json({ error: "Missing courseId" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const profileSnap = await db.collection("users").doc(uid).get();
    const profile = profileSnap.exists ? (profileSnap.data() ?? {}) : {};

    if (!isTeacherOrAdmin(profile) || !canAccessAcademy(profile)) {
      return json({ error: "No academy access" }, 403);
    }

    const courseRef = db.collection("courses").doc(courseId);
    const courseSnap = await courseRef.get();
    if (!courseSnap.exists) return json({ error: "Course not found" }, 404);

    const current = courseSnap.data() ?? {};
    if (current.ownerUid !== uid) {
      return json({ error: "Only the course owner can edit this course" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as CourseBody;
    const title = safeString(body.title);
    if (!title) return json({ error: "Missing title" }, 400);

    const numberOfSessions = safeNumber(body.numberOfSessions);
    const rawPlan =
      Array.isArray(body.coursePlan) && body.coursePlan.length > 0
        ? normalizeCoursePlan(body.coursePlan)
        : normalizeCoursePlan(current.coursePlan);
    const coursePlan = syncCoursePlanSessionCount(rawPlan, numberOfSessions);
    const marketing =
      body.marketing === undefined
        ? normalizeCourseMarketing(current.marketing)
        : normalizeCourseMarketing(body.marketing);
    const sales =
      body.sales === undefined
        ? normalizeCourseSalesSettings(current.sales)
        : normalizeCourseSalesSettings(body.sales);

    await courseRef.set(
      {
        title,
        description: safeString(body.description),
        learningGoals: safeString(body.learningGoals),
        targetAudience: safeString(body.targetAudience),
        language: safeString(body.language),
        level: safeString(body.level),
        priceText: safeString(body.priceText),
        maxParticipants: safeNumber(body.maxParticipants),
        numberOfSessions,
        numberOfWeeks: safeNumber(body.numberOfWeeks),
        status: isCourseStatus(body.status) ? body.status : "draft",
        coursePlan: serializePlanForFirestore(coursePlan),
        slug: safeString(current.slug),
        publicUrl: safeString(current.publicUrl),
        publishedAt: current.publishedAt ?? null,
        marketing,
        sales,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return json({ courseId }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update course";
    return json({ error: message }, 500);
  }
}

function slugifyTitle(title: string): string {
  const normalized = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "course";
}

async function createUniqueSlug(db: FirebaseFirestore.Firestore, courseId: string, title: string) {
  const base = slugifyTitle(title);
  let candidate = base;
  let index = 2;

  while (true) {
    const snap = await db.collection("courses").where("slug", "==", candidate).limit(5).get();
    const taken = snap.docs.some((doc) => doc.id !== courseId);
    if (!taken) return candidate;

    candidate = `${base}-${index}`;
    index += 1;
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { courseId } = await ctx.params;
    if (!courseId) return json({ error: "Missing courseId" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const profileSnap = await db.collection("users").doc(uid).get();
    const profile = profileSnap.exists ? (profileSnap.data() ?? {}) : {};
    const isAdmin = hasAdminAccess(profile);

    if (!isTeacherOrAdmin(profile) || !canAccessAcademy(profile)) {
      return json({ error: "No academy access" }, 403);
    }

    const courseRef = db.collection("courses").doc(courseId);
    const courseSnap = await courseRef.get();
    if (!courseSnap.exists) return json({ error: "Course not found" }, 404);

    const current = courseSnap.data() ?? {};
    if (!isAdmin && current.ownerUid !== uid) {
      return json({ error: "No access" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as CourseActionBody;
    const action = safeString(body.action);
    const locale = safeString(body.locale) || "nb";
    const origin = new URL(req.url).origin;

    if (action === "publish") {
      const checklist = buildCoursePublishChecklist(
        normalizeCourse(courseId, current as Record<string, unknown>)
      );

      if (!checklist.canPublish) {
        return json(
          {
            error: "Course is missing required information",
            missing: checklist.missingCriticalLabels,
            checklist,
          },
          400
        );
      }

      const slug = safeString(current.slug) || (await createUniqueSlug(db, courseId, safeString(current.title)));
      const publicUrl = `${origin}/${locale}/courses/${slug}`;
      const publishedAt = current.publishedAt ?? new Date();

      await courseRef.set(
        {
          status: "published",
          slug,
          publicUrl,
          publishedAt,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      return json({ courseId, slug, publicUrl }, 200);
    }

    if (action === "unpublish") {
      await courseRef.set(
        {
          status: "draft",
          updatedAt: new Date(),
        },
        { merge: true }
      );

      return json({ courseId }, 200);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update publish status";
    return json({ error: message }, 500);
  }
}
