import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { sendEmail } from "@/lib/email/resend";
import { getAdmin } from "@/lib/firebaseAdmin";
import { isActiveSchoolAdminMember } from "@/lib/schools";
import { createSchoolInvites, getSchoolMember } from "@/lib/schools/server";
import { validateInviteRecipients } from "@/lib/schools/inviteBatch";

export const runtime = "nodejs";
export const maxDuration = 60;

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

function buildInviteEmailHtml(inviteUrl: string, locale: string, displayName?: string): string {
  const safeInviteUrl = escapeHtml(inviteUrl);
  const title = locale === "en" ? "Invitation to 321school" : locale === "pt" ? "Convite para 321school" : "Invitasjon til 321school";
  const hello = locale === "en" ? "Hello" : locale === "pt" ? "Olá" : "Hei";
  const intro = locale === "en" ? "You are invited to join your school as a teacher. Sign in or create an account using this email address." : locale === "pt" ? "Você foi convidado para entrar na escola como professor. Entre ou crie uma conta usando este e-mail." : "Du er invitert til å bli med på skolen som lærer. Logg inn eller opprett konto med denne e-postadressen.";
  const action = locale === "en" ? "Open invitation" : locale === "pt" ? "Abrir convite" : "Åpne invitasjonen";

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
      <h2>${title}</h2>
      ${displayName ? `<p>${hello} ${escapeHtml(displayName)}!</p>` : ""}
      <p>${intro}</p>
      <p>
        <a href="${safeInviteUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px">
          ${action}
        </a>
      </p>
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

    let recipients;
    try {
      recipients = validateInviteRecipients(body.recipients ?? [{ email, displayName: body.displayName }]);
    } catch (error) {
      return json({ ok: false, reason: error instanceof Error ? error.message : "invalid_batch" }, 400);
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

    const result = await createSchoolInvites({
      schoolId,
      recipients,
      invitedBy: uid,
    });

    if (!result.ok || !result.invites) {
      return json(result, result.ok ? 200 : 400);
    }

    const results = [];
    for (const invite of result.invites) {
    const inviteEmail = invite.email;
    const inviteUrl = buildInviteUrl(locale, invite.token);
    if (body.sendEmail === false) {
      results.push({ ...invite, emailSent: false, emailSkipped: true });
      continue;
    }

    try {
      const emailResult = await sendEmail({
        to: inviteEmail,
        subject: "Invitasjon til 321school",
        html: buildInviteEmailHtml(inviteUrl, locale, invite.displayName),
      });

      if (!emailResult.ok) {
        await logSchoolInviteEmailAttempt({
          email: inviteEmail,
          locale,
          status: emailResult.reason === "email_not_configured" ? "not_configured" : "failed",
          error: emailResult.error ?? emailResult.reason,
        });

        results.push({
          ...invite,
          emailSent: false,
          warning: emailResult.reason,
        });
        continue;
      }

      await logSchoolInviteEmailAttempt({
        email: inviteEmail,
        locale,
        status: "sent",
      });

      results.push({
        ...invite,
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

      results.push({
        ...invite,
        emailSent: false,
        warning,
      });
    }
    }
    return json(body.recipients ? { ok: true, invites: results } : { ok: true, ...results[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    return json({ ok: false, error: message || "Failed to create school invite" }, 500);
  }
}
