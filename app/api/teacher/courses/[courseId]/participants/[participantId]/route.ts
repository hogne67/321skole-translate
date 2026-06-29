import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { canAccessAcademy, hasAdminAccess } from "@/lib/courses/academyAccess";
import { normalizeParticipantStatus, type ParticipantStatus } from "@/lib/courses/types";

type ParticipantBody = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  organization?: unknown;
  note?: unknown;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTeacherOrAdmin(profile: unknown): boolean {
  if (!isRecord(profile)) return false;
  if (hasAdminAccess(profile)) return true;
  const roles = isRecord(profile.roles) ? profile.roles : null;
  return profile.role === "teacher" || roles?.teacher === true;
}

async function resolveParticipantIdentity(
  auth: ReturnType<typeof getAdmin>["auth"],
  db: FirebaseFirestore.Firestore,
  email: string
) {
  try {
    const userRecord = await auth.getUserByEmail(email);
    const profileSnap = await db.collection("users").doc(userRecord.uid).get();
    const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
    return {
      participantUid: userRecord.uid,
      roleSnapshot: safeString(profile.role),
    };
  } catch {
    return {
      participantUid: "",
      roleSnapshot: "",
    };
  }
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

  return { auth, db };
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ courseId: string; participantId: string }> }
) {
  try {
    const { courseId, participantId } = await ctx.params;
    if (!courseId || !participantId) return json({ error: "Missing id" }, 400);

    const access = await requireCourseAccess(req, courseId);
    if ("error" in access) return access.error;

    const body = (await req.json().catch(() => ({}))) as ParticipantBody;
    const name = safeString(body.name);
    const email = safeString(body.email).toLowerCase();
    const phone = safeString(body.phone);
    const organization = safeString(body.organization).slice(0, 180);
    const note = safeString(body.note).slice(0, 500);
    const status: ParticipantStatus = normalizeParticipantStatus(body.status);

    if (!name) return json({ error: "Missing name" }, 400);
    if (!email) return json({ error: "Missing email" }, 400);

    const identity = await resolveParticipantIdentity(access.auth, access.db, email);
    await access.db
      .collection("courses")
      .doc(courseId)
      .collection("participants")
      .doc(participantId)
      .set(
        {
          name,
          email,
          participantUid: identity.participantUid,
          roleSnapshot: identity.roleSnapshot,
          phone,
          organization,
          note,
          status,
          updatedAt: new Date(),
        },
        { merge: true }
      );

    return json({ participantId }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update participant";
    return json({ error: message }, 500);
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ courseId: string; participantId: string }> }
) {
  try {
    const { courseId, participantId } = await ctx.params;
    if (!courseId || !participantId) return json({ error: "Missing id" }, 400);

    const access = await requireCourseAccess(req, courseId);
    if ("error" in access) return access.error;

    await access.db
      .collection("courses")
      .doc(courseId)
      .collection("participants")
      .doc(participantId)
      .delete();

    return json({ participantId }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete participant";
    return json({ error: message }, 500);
  }
}
