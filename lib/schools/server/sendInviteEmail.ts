import "server-only";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { getAdmin } from "../../firebaseAdmin";
import { getEmailConfiguration } from "../../email/configuration";
import { sendEmail, type SendEmailInput, type SendEmailResult } from "../../email/resend";
import { buildInviteEmail, type InviteEmailDetails } from "../inviteEmail";
import { schoolInviteOrigin } from "../inviteOrigin";

export class InviteEmailError extends Error {
  constructor(public reason: string, public status = 400) { super(reason); }
}

type Dependencies = {
  db: Firestore; configured: boolean; baseUrl: string;
  createPdf: (data: InviteEmailDetails) => Promise<Buffer>;
  send: (input: SendEmailInput) => Promise<SendEmailResult>;
};

export async function sendSchoolInviteEmail(input: { uid: string; schoolId: string; inviteId: string; locale: string }, dependencies?: Dependencies) {
  const deps = dependencies ?? {
    db: getAdmin().db, configured: getEmailConfiguration().configured,
    baseUrl: process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://321school.com",
    createPdf: async (data: InviteEmailDetails) => (await import("../../pdf/SchoolInvitePdf")).createSchoolInvitePdf(data),
    send: sendEmail,
  };
  if (!input.uid) throw new InviteEmailError("unauthorized", 401);
  const locale = input.locale === "en" || input.locale === "pt" ? input.locale : "nb";
  const origin = schoolInviteOrigin(deps.baseUrl);
  const schoolRef = deps.db.collection("schools").doc(input.schoolId);
  const inviteRef = deps.db.collection("schoolInvites").doc(input.inviteId);
  const data = await deps.db.runTransaction(async tx => {
    const [member, school, invite] = await Promise.all([
      tx.get(schoolRef.collection("members").doc(input.uid)), tx.get(schoolRef), tx.get(inviteRef),
    ]);
    if (member.get("role") !== "school_admin" || member.get("status") !== "active") throw new InviteEmailError("forbidden", 403);
    if (!school.exists) throw new InviteEmailError("school_not_found", 404);
    if (school.get("status") !== "active") throw new InviteEmailError("school_not_active");
    if (!invite.exists || invite.get("schoolId") !== input.schoolId) throw new InviteEmailError("invite_not_found", 404);
    if (invite.get("status") !== "pending" || invite.get("role") !== "school_teacher") throw new InviteEmailError("invite_not_pending");
    const expiresAt = invite.get("expiresAt")?.toMillis?.();
    if (!expiresAt || expiresAt <= Date.now()) throw new InviteEmailError("invite_expired");
    const email = String(invite.get("email") || "").trim();
    const token = invite.get("inviteToken");
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new InviteEmailError("invalid_email");
    if (typeof token !== "string" || !token) throw new InviteEmailError("missing_invite_link");
    if (!deps.configured) throw new InviteEmailError("email_not_configured", 503);
    const lastAttempt = invite.get("emailLastAttemptAt")?.toMillis?.() ?? 0;
    // Atomic reservation prevents duplicate sends from double-clicks or concurrent tabs.
    if (Date.now() - lastAttempt < 60_000) throw new InviteEmailError("email_recently_sent", 429);
    tx.update(inviteRef, { emailLastAttemptAt: Timestamp.now() });
    return {
      locale, email, displayName: String(invite.get("displayName") || ""),
      schoolName: String(school.get("name") || "321school"), adminName: String(member.get("displayName") || ""),
      inviteUrl: `${origin}/${locale}/school/accept?token=${encodeURIComponent(token)}`,
      inviteCode: String(invite.get("inviteCode") || ""), expiresAt,
    };
  });
  const mail = buildInviteEmail(data);
  let result: SendEmailResult;
  try {
    const pdf = await deps.createPdf(data);
    result = await deps.send({ to: data.email, ...mail,
      attachments: [{ filename: "321school-invitation.pdf", content: pdf.toString("base64"), contentType: "application/pdf" }],
    });
  } catch { result = { ok: false, reason: "send_failed" }; }
  try {
    await deps.db.collection("emailLogs").add({ type: "school_invite", uid: input.uid,
      schoolId: input.schoolId, inviteId: input.inviteId, email: data.email, locale,
      subject: mail.subject, provider: "resend", status: result.ok ? "sent" : "failed",
      ...(result.ok ? {} : { error: result.reason }), createdAt: FieldValue.serverTimestamp() });
  } catch { console.error("school_invite_email_log_failed"); }
  if (!result.ok) throw new InviteEmailError(result.reason, 502);
  // Provider acceptance is the send result. A metadata failure must not invite an immediate duplicate send.
  try {
    await inviteRef.update({ emailSentAt: FieldValue.serverTimestamp(), emailSentByUid: input.uid });
  } catch { console.error("school_invite_email_status_update_failed"); }
  return { ok: true, emailSent: true, email: data.email };
}
