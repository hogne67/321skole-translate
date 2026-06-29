import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { canAccessAcademy, hasAdminAccess } from "@/lib/courses/academyAccess";
import { normalizeMessageStatus, normalizeParticipantStatus, normalizeSignupRequestStatus } from "@/lib/courses/types";
import { sendEmail } from "@/lib/email/resend";

type MessageBody = {
  subject?: unknown;
  body?: unknown;
  recipients?: unknown;
};

type RecipientMode = "all" | "active_enrolled" | "signup_new" | "signup_contacted";

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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bodyToHtml(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br />");
}

function normalizeRecipientMode(value: unknown): RecipientMode {
  if (
    value === "active_enrolled" ||
    value === "signup_new" ||
    value === "signup_contacted"
  ) {
    return value;
  }

  return "all";
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

function serializeMessage(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    subject: safeString(data.subject),
    body: safeString(data.body),
    recipientsCount:
      typeof data.recipientsCount === "number" && Number.isFinite(data.recipientsCount)
        ? data.recipientsCount
        : 0,
    recipientEmails: Array.isArray(data.recipientEmails)
      ? data.recipientEmails.filter((email): email is string => typeof email === "string")
      : [],
    sentByUid: safeString(data.sentByUid),
    status: normalizeMessageStatus(data.status),
    errorMessage: safeString(data.errorMessage),
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
  };
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

  return { db, uid, course };
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
      .collection("messages")
      .get();

    const messages = snap.docs.map((doc) => serializeMessage(doc.id, doc.data()));
    messages.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    return json({ messages }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load messages";
    return json({ error: message }, 500);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  try {
    const { courseId } = await ctx.params;
    if (!courseId) return json({ error: "Missing courseId" }, 400);

    const access = await requireCourseAccess(req, courseId);
    if ("error" in access) return access.error;

    const body = (await req.json().catch(() => ({}))) as MessageBody;
    const subject = safeString(body.subject).slice(0, 180);
    const messageBody = safeString(body.body).slice(0, 5000);
    const recipientsMode = normalizeRecipientMode(body.recipients);

    if (!subject) return json({ error: "Missing subject" }, 400);
    if (!messageBody) return json({ error: "Missing body" }, 400);

    let recipientEmails: string[] = [];

    if (recipientsMode === "signup_new" || recipientsMode === "signup_contacted") {
      const targetStatus = recipientsMode === "signup_new" ? "new" : "contacted";
      const requestsSnap = await access.db
        .collection("courses")
        .doc(courseId)
        .collection("signupRequests")
        .get();

      recipientEmails = requestsSnap.docs
        .map((doc) => doc.data())
        .filter((request) => normalizeSignupRequestStatus(request.status) === targetStatus)
        .map((request) => safeString(request.email).toLowerCase())
        .filter(Boolean);
    } else {
      const participantsSnap = await access.db
        .collection("courses")
        .doc(courseId)
        .collection("participants")
        .get();

      recipientEmails = participantsSnap.docs
        .map((doc) => doc.data())
        .filter((participant) => {
          if (recipientsMode === "all") return true;
          const status = normalizeParticipantStatus(participant.status);
          return status === "active" || status === "enrolled";
        })
        .map((participant) => safeString(participant.email).toLowerCase())
        .filter(Boolean);
    }

    const uniqueEmails = Array.from(new Set(recipientEmails)).slice(0, 100);
    if (uniqueEmails.length === 0) {
      return json({ error: "No recipients found" }, 400);
    }

    const courseTitle = safeString(access.course.title) || "321Academy";
    const footer = [
      `Denne e-posten gjelder kurset: ${courseTitle}`,
      "Du mottar denne fordi du er deltaker eller har meldt interesse.",
    ];
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
        <div>${bodyToHtml(messageBody)}</div>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
        <p style="font-size:13px;color:#475569;margin:0">${escapeHtml(footer[0])}</p>
        <p style="font-size:13px;color:#475569;margin:6px 0 0">${escapeHtml(footer[1])}</p>
      </div>
    `;

    const errors: string[] = [];
    for (const email of uniqueEmails) {
      const result = await sendEmail({ to: email, subject, html });
      if (!result.ok) {
        const detail = result.error ? `: ${result.error}` : "";
        errors.push(`${email}: ${result.reason}${detail}`);
      }
    }

    const status = errors.length > 0 ? "failed" : "sent";
    const errorMessage =
      errors.length > 0
        ? `${errors.length} of ${uniqueEmails.length} email(s) failed. ${errors.join(" | ")}`.slice(0, 1000)
        : "";

    const docRef = await access.db
      .collection("courses")
      .doc(courseId)
      .collection("messages")
      .add({
        subject,
        body: messageBody,
        recipientsCount: uniqueEmails.length,
        recipientEmails: uniqueEmails,
        createdAt: new Date(),
        sentByUid: access.uid,
        status,
        errorMessage,
      });

    return json({ messageId: docRef.id, recipientsCount: uniqueEmails.length, status }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create message";
    return json({ error: message }, 500);
  }
}
