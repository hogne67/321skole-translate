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
  participants?: unknown;
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

function serializeParticipant(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    participantUid: safeString(data.participantUid),
    roleSnapshot: safeString(data.roleSnapshot),
    source: safeString(data.source),
    orderId: safeString(data.orderId),
    signupRequestId: safeString(data.signupRequestId),
    name: safeString(data.name),
    email: safeString(data.email),
    phone: safeString(data.phone),
    organization: safeString(data.organization),
    note: safeString(data.note),
    status: normalizeParticipantStatus(data.status),
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null,
  };
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

  return { auth, db, uid, isAdmin };
}

export async function GET(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  try {
    const { courseId } = await ctx.params;
    if (!courseId) return json({ error: "Missing courseId" }, 400);

    const access = await requireCourseAccess(req, courseId);
    if ("error" in access) return access.error;

    const snap = await access.db
      .collection("courses")
      .doc(courseId)
      .collection("participants")
      .get();

    const participants = snap.docs.map((doc) => serializeParticipant(doc.id, doc.data()));
    participants.sort((a, b) => a.name.localeCompare(b.name));

    return json({ participants }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load participants";
    return json({ error: message }, 500);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  try {
    const { courseId } = await ctx.params;
    if (!courseId) return json({ error: "Missing courseId" }, 400);

    const access = await requireCourseAccess(req, courseId);
    if ("error" in access) return access.error;

    const body = (await req.json().catch(() => ({}))) as ParticipantBody;
    const status: ParticipantStatus = normalizeParticipantStatus(body.status);
    const organization = safeString(body.organization).slice(0, 180);
    const note = safeString(body.note).slice(0, 500);

    if (Array.isArray(body.participants)) {
      const rows = body.participants
        .map((item) => (isRecord(item) ? item : {}))
        .map((item) => ({
          name: safeString(item.name).slice(0, 180),
          email: safeString(item.email).toLowerCase().slice(0, 180),
          phone: safeString(item.phone).slice(0, 60),
          organization: safeString(item.organization).slice(0, 180) || organization,
          note: safeString(item.note).slice(0, 500) || note,
          status: normalizeParticipantStatus(item.status ?? status),
        }))
        .filter((item) => item.name && item.email);

      if (rows.length === 0) return json({ error: "No valid participants" }, 400);
      if (rows.length > 100) return json({ error: "Max 100 participants per import" }, 400);

      const now = new Date();
      const batch = access.db.batch();
      const participantsRef = access.db.collection("courses").doc(courseId).collection("participants");
      const seenEmails = new Set<string>();
      let createdCount = 0;

      for (const row of rows) {
        if (seenEmails.has(row.email)) continue;
        seenEmails.add(row.email);
        const identity = await resolveParticipantIdentity(access.auth, access.db, row.email);
        const participantRef = participantsRef.doc();
        batch.set(participantRef, {
          name: row.name,
          email: row.email,
          participantUid: identity.participantUid,
          roleSnapshot: identity.roleSnapshot,
          source: "manual_import",
          phone: row.phone,
          organization: row.organization,
          note: row.note,
          status: row.status,
          createdAt: now,
          updatedAt: now,
        });
        createdCount += 1;
      }

      await batch.commit();
      return json({ createdCount }, 200);
    }

    const name = safeString(body.name);
    const email = safeString(body.email).toLowerCase();
    const phone = safeString(body.phone);

    if (!name) return json({ error: "Missing name" }, 400);
    if (!email) return json({ error: "Missing email" }, 400);

    const now = new Date();
    const identity = await resolveParticipantIdentity(access.auth, access.db, email);
    const docRef = await access.db
      .collection("courses")
      .doc(courseId)
      .collection("participants")
      .add({
        name,
        email,
        participantUid: identity.participantUid,
        roleSnapshot: identity.roleSnapshot,
        source: "manual",
        phone,
        organization,
        note,
        status,
        createdAt: now,
        updatedAt: now,
      });

    return json({ participantId: docRef.id }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create participant";
    return json({ error: message }, 500);
  }
}
