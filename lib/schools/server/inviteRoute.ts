import "server-only";
import { NextResponse } from "next/server";
import { getAdmin } from "../../firebaseAdmin";
import { isActiveSchoolAdminMember } from "../../schools";
import { validateInviteRecipients } from "../inviteBatch";
import { createSchoolInvites } from "./createSchoolInvite";
import { getSchoolMember } from "./getSchoolMember";
import { InviteEmailError, sendSchoolInviteEmail } from "./sendInviteEmail";

type Dependencies = {
  authenticate: (token: string) => Promise<string>;
  getMember: typeof getSchoolMember;
  createInvites: typeof createSchoolInvites;
  sendInvite: typeof sendSchoolInviteEmail;
};

const readString = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function handleSchoolInvite(req: Request, dependencies?: Dependencies) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const deps = dependencies ?? {
    authenticate: async (value: string) => (await getAdmin().auth.verifyIdToken(value, true)).uid,
    getMember: getSchoolMember, createInvites: createSchoolInvites, sendInvite: sendSchoolInviteEmail,
  };
  let uid: string;
  try {
    uid = await deps.authenticate(token);
    if (!uid) throw new Error("Unauthorized");
  } catch { return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }); }

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, reason: "invalid_batch" }, { status: 400 });
  }
  const data = body as Record<string, unknown>;
  const schoolId = readString(data.schoolId);
  if (!schoolId) return NextResponse.json({ ok: false, error: "Missing schoolId" }, { status: 400 });
  const locale = data.locale === "en" || data.locale === "pt" ? data.locale : "nb";
  let recipients;
  try {
    recipients = validateInviteRecipients(data.recipients ?? [{ email: readString(data.email), displayName: data.displayName }]);
  } catch (error) {
    return NextResponse.json({ ok: false, reason: error instanceof Error ? error.message : "invalid_batch" }, { status: 400 });
  }
  try {
    if (!isActiveSchoolAdminMember(await deps.getMember(schoolId, uid))) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    const result = await deps.createInvites({ schoolId, recipients, invitedBy: uid });
    if (!result.ok || !result.invites) return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    const results = [];
    for (const invite of result.invites) {
      if (data.sendEmail === false) {
        results.push({ ...invite, emailSent: false, emailSkipped: true });
        continue;
      }
      try {
        // Automatic invitations and the manual button use the same stored invitation, PDF and email.
        await deps.sendInvite({ uid, schoolId, inviteId: invite.inviteId, locale });
        results.push({ ...invite, emailSent: true });
      } catch (error) {
        // Keep the created invitation available for printout or retry if email delivery fails.
        results.push({ ...invite, emailSent: false,
          warning: error instanceof InviteEmailError ? error.reason : "email_send_failed" });
      }
    }
    return NextResponse.json(data.recipients ? { ok: true, invites: results } : { ok: true, ...results[0] });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to create school invite" }, { status: 500 });
  }
}
