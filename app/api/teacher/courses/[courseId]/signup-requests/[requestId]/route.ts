import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { canAccessAcademy, hasAdminAccess } from "@/lib/courses/academyAccess";

type ActionBody = {
  action?: unknown;
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

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ courseId: string; requestId: string }> }
) {
  try {
    const { courseId, requestId } = await ctx.params;
    if (!courseId || !requestId) return json({ error: "Missing id" }, 400);

    const access = await requireCourseAccess(req, courseId);
    if ("error" in access) return access.error;

    const body = (await req.json().catch(() => ({}))) as ActionBody;
    const action = safeString(body.action);
    const requestRef = access.db
      .collection("courses")
      .doc(courseId)
      .collection("signupRequests")
      .doc(requestId);
    const requestSnap = await requestRef.get();

    if (!requestSnap.exists) return json({ error: "Request not found" }, 404);

    const request = requestSnap.data() ?? {};
    const now = new Date();

    if (action === "contacted") {
      await requestRef.set({ status: "contacted", updatedAt: now }, { merge: true });
      return json({ requestId }, 200);
    }

    if (action === "reject") {
      await requestRef.set({ status: "rejected", updatedAt: now }, { merge: true });
      return json({ requestId }, 200);
    }

    if (action === "accept") {
      const requestEmail = safeString(request.email).toLowerCase();
      const identity = requestEmail
        ? await resolveParticipantIdentity(access.auth, access.db, requestEmail)
        : { participantUid: "", roleSnapshot: "" };

      await access.db.runTransaction(async (tx) => {
        const freshSnap = await tx.get(requestRef);
        const fresh = freshSnap.data() ?? request;
        const email = safeString(fresh.email).toLowerCase();

        if (!email) {
          throw new Error("Request is missing email");
        }

        const participantRef = access.db
          .collection("courses")
          .doc(courseId)
          .collection("participants")
          .doc();

        tx.set(participantRef, {
          name: safeString(fresh.name),
          email,
          participantUid: identity.participantUid,
          roleSnapshot: identity.roleSnapshot,
          phone: safeString(fresh.phone),
          status: "enrolled",
          createdAt: now,
          updatedAt: now,
        });

        tx.set(requestRef, { status: "accepted", updatedAt: now }, { merge: true });
      });

      return json({ requestId }, 200);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update request";
    return json({ error: message }, 500);
  }
}
