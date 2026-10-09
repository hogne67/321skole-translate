import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { canAccessAcademy, hasAdminAccess } from "@/lib/courses/academyAccess";

import { approveCourseSignup } from "@/lib/courses/signupApproval";
import { sendCourseConfirmation } from "@/lib/courses/confirmationEmail";
import { sendEmail } from "@/lib/email/resend";

type ActionBody = {
  locale?: unknown;
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
    const emailOrigin = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || new URL(req.url).origin;
    const requestRef = access.db
      .collection("courses")
      .doc(courseId)
      .collection("signupRequests")
      .doc(requestId);
    const requestSnap = await requestRef.get();

    if (!requestSnap.exists) return json({ error: "Request not found" }, 404);

    const request = requestSnap.data() ?? {};
    if (action === "contacted" || action === "reject") {
      const changed = await access.db.runTransaction(async (tx) => {
        const fresh = await tx.get(requestRef);
        if (!fresh.exists) throw new Error("Request not found");
        if (fresh.data()?.status === "accepted") return false;
        tx.update(requestRef, { status: action === "contacted" ? "contacted" : "rejected", updatedAt: new Date() });
        return true;
      });
      return changed ? json({ requestId }, 200) : json({ error: "Approved requests must be managed under Participants" }, 409);
    }

    if (action === "accept") {
      const requestEmail = safeString(request.email).toLowerCase();
      const identity = requestEmail
        ? await resolveParticipantIdentity(access.auth, access.db, requestEmail)
        : { participantUid: "", roleSnapshot: "" };
      const approval = await approveCourseSignup(access.db, courseId, requestId, identity);
      const confirmationEmailStatus = approval.alreadyAccepted
        ? safeString((await requestRef.get()).data()?.confirmationEmailStatus)
        : await sendCourseConfirmation({ db: access.db, courseId, requestId, origin: emailOrigin, locale: safeString(body.locale), send: sendEmail });
      return json({ requestId, ...approval, confirmationEmailStatus }, 200);
    }

    if (action === "sendConfirmation") {
      if (request.status !== "accepted") return json({ error: "Request must be approved first" }, 409);
      const confirmationEmailStatus = await sendCourseConfirmation({ db: access.db, courseId, requestId, origin: emailOrigin, locale: safeString(body.locale), send: sendEmail });
      return json({ requestId, confirmationEmailStatus }, 200);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update request";
    return json({ error: message }, 500);
  }
}
