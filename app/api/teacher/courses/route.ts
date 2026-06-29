import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { canAccessAcademy, hasAdminAccess } from "@/lib/courses/academyAccess";
import {
  createEmptyCoursePlan,
  normalizeCourseMarketing,
  normalizeCoursePlan,
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
  sessionDurationMinutes?: unknown;
  coursePlan?: unknown;
  marketing?: unknown;
  status?: unknown;
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

async function requireCourseAccess(req: Request) {
  const token = getBearerToken(req);
  if (!token) return { error: json({ error: "Missing Authorization Bearer token" }, 401) };

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(token);
  const uid = decoded.uid;

  const profileSnap = await db.collection("users").doc(uid).get();
  const profile = profileSnap.exists ? (profileSnap.data() ?? {}) : {};

  if (!isTeacherOrAdmin(profile) || !canAccessAcademy(profile)) {
    return { error: json({ error: "No academy access" }, 403) };
  }

  return {
    auth,
    db,
    uid,
    profile,
    isAdmin: hasAdminAccess(profile),
  };
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
    publishedAt: data.publishedAt?.toDate ? data.publishedAt.toDate().toISOString() : null,
    coursePlan: normalizeCoursePlan(data.coursePlan),
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null,
  };
}

export async function GET(req: Request) {
  try {
    const access = await requireCourseAccess(req);
    if ("error" in access) return access.error;

    const snap = access.isAdmin
      ? await access.db.collection("courses").get()
      : await access.db.collection("courses").where("ownerUid", "==", access.uid).get();

    const courses = snap.docs.map((doc) => serializeCourse(doc.id, doc.data()));
    return json({ courses }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load courses";
    return json({ error: message }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const access = await requireCourseAccess(req);
    if ("error" in access) return access.error;

    const body = (await req.json().catch(() => ({}))) as CourseBody;
    const title = safeString(body.title);
    if (!title) return json({ error: "Missing title" }, 400);

    const now = new Date();
    const status = isCourseStatus(body.status) ? body.status : "draft";
    const sessionDurationMinutes = safeNumber(body.sessionDurationMinutes) || 120;
    const generatedPlan =
      Array.isArray(body.coursePlan) && body.coursePlan.length > 0
        ? normalizeCoursePlan(body.coursePlan)
        : createEmptyCoursePlan(safeNumber(body.numberOfSessions));
    const coursePlan = generatedPlan.map((session) => ({
      ...session,
      durationMinutes: session.durationMinutes || sessionDurationMinutes,
    }));

    const payload = {
      ownerUid: access.uid,
      title,
      description: safeString(body.description),
      learningGoals: safeString(body.learningGoals),
      targetAudience: safeString(body.targetAudience),
      language: safeString(body.language),
      level: safeString(body.level),
      priceText: safeString(body.priceText),
      maxParticipants: safeNumber(body.maxParticipants),
      numberOfSessions: safeNumber(body.numberOfSessions),
      numberOfWeeks: safeNumber(body.numberOfWeeks),
      status,
      slug: "",
      publicUrl: "",
      marketing: normalizeCourseMarketing(body.marketing),
      publishedAt: null,
      coursePlan,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await access.db.collection("courses").add(payload);
    return json({ courseId: docRef.id }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create course";
    return json({ error: message }, 500);
  }
}
