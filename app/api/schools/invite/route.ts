import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { sendEmail } from "@/lib/email/resend";
import { getAdmin } from "@/lib/firebaseAdmin";
import { isActiveSchoolAdminMember } from "@/lib/schools";
import { createSchoolInvite, getSchoolMember } from "@/lib/schools/server";

export const runtime = "nodejs";

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

function normalizeLocale(value: unknown): string {
  return value === "en" || value === "pt" || value === "nb" ? value : "nb";
}

function getBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildInviteUrl(locale: string, token: string): string {
  const baseUrl = getBaseUrl();
  const encodedToken = encodeURIComponent(token);

  return `${baseUrl}/${locale}/school/accept?token=${encodedToken}`;
}

function buildInviteEmailHtml(inviteUrl: string): string {
  const safeInviteUrl = escapeHtml(inviteUrl);

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
      <h2>Invitasjon til 321school</h2>
      <p>Du er invitert til å bli lærer i en skolekonto i 321school.</p>
      <p>Klikk på lenken for å godta invitasjonen.</p>
      <p>
        <a href="${safeInviteUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px">
          Godta invitasjon
        </a>
      </p>
      <p>Hvis knappen ikke virker, kan du kopiere denne lenken:</p>
      <p>${safeInviteUrl}</p>
    </div>
  `;
}

async function logSchoolInviteEmailAttempt(data: {
  email: string;
  locale: string;
  status: "sent" | "failed" | "not_configured";
  error?: string;
}) {
  try {
    const { db } = getAdmin();

    await db.collection("emailLogs").add({
      type: "school_invite",
      subject: "Invitasjon til 321school",
      provider: "resend",
      ...data,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("school invite email log error", error);
  }
}

export async function POST(req: Request) {
  try {
    const authToken = getBearerToken(req);
    if (!authToken) {
      return json({ ok: false, error: "Missing Authorization Bearer token" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const schoolId = readString(body.schoolId);
    const email = readString(body.email);
    const locale = normalizeLocale(body.locale);

    if (!schoolId) {
      return json({ ok: false, error: "Missing schoolId" }, 400);
    }

    if (!email) {
      return json({ ok: false, error: "Missing email" }, 400);
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

    const result = await createSchoolInvite({
      schoolId,
      email,
      invitedBy: uid,
    });

    if (!result.ok || !result.token) {
      return json(result, result.ok ? 200 : 400);
    }

    const inviteEmail = email.trim().toLowerCase();
    const inviteUrl = buildInviteUrl(locale, result.token);

    try {
      const emailResult = await sendEmail({
        to: inviteEmail,
        subject: "Invitasjon til 321school",
        html: buildInviteEmailHtml(inviteUrl),
      });

      if (!emailResult.ok) {
        await logSchoolInviteEmailAttempt({
          email: inviteEmail,
          locale,
          status: emailResult.reason === "email_not_configured" ? "not_configured" : "failed",
          error: emailResult.error ?? emailResult.reason,
        });

        return json({
          ...result,
          emailSent: false,
          warning: emailResult.reason,
        });
      }

      await logSchoolInviteEmailAttempt({
        email: inviteEmail,
        locale,
        status: "sent",
      });

      return json({
        ...result,
        emailSent: true,
      });
    } catch (emailError: unknown) {
      const warning = emailError instanceof Error ? emailError.message : "email_send_failed";

      await logSchoolInviteEmailAttempt({
        email: inviteEmail,
        locale,
        status: "failed",
        error: warning,
      });

      return json({
        ...result,
        emailSent: false,
        warning,
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    return json({ ok: false, error: message || "Failed to create school invite" }, 500);
  }
}
