import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { InviteEmailError, sendSchoolInviteEmail } from "./sendInviteEmail";
import type { SendEmailInput } from "../../email/resend";

function fixture() {
  const records = new Map<string, Record<string, unknown>>([
    ["schools/school", { status: "active", name: "Eksempelskolen" }],
    ["schools/school/members/admin", { role: "school_admin", status: "active", displayName: "Skoleleder" }],
    ["schoolInvites/invite", { schoolId: "school", role: "school_teacher", status: "pending", email: "teacher@example.com",
      displayName: "Lærer Ærlig", inviteToken: "existing-secret-token", inviteCode: "AAAA-BBBB-CCCC-DDDD",
      expiresAt: Timestamp.fromMillis(Date.now() + 86400000) }],
  ]);
  const ref = (path: string): { path: string; collection: (name: string) => { doc: (id: string) => ReturnType<typeof ref> }; update: (data: Record<string, unknown>) => Promise<void> } => ({
    path, collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }),
    update: async data => { Object.assign(records.get(path)!, data); },
  });
  let queue = Promise.resolve();
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: <T>(fn: (tx: unknown) => Promise<T>) => {
      const run = queue.then(() => fn({
        get: async (reference: { path: string }) => ({ exists: records.has(reference.path), get: (key: string) => records.get(reference.path)?.[key] }),
        update: (reference: { path: string }, value: Record<string, unknown>) => Object.assign(records.get(reference.path)!, value),
      }));
      queue = run.then(() => undefined, () => undefined);
      return run;
    },
  } as unknown as Firestore;
  const sent: SendEmailInput[] = [];
  const pdfInputs: string[] = [];
  const deps = { db, configured: true, baseUrl: "https://321school.com", createPdf: async (data: { inviteUrl: string }) => {
    pdfInputs.push(data.inviteUrl); return Buffer.from("%PDF-test");
  }, send: async (mail: SendEmailInput) => { sent.push(mail); return { ok: true as const }; } };
  const input = { uid: "admin", schoolId: "school", inviteId: "invite", locale: "nb" };
  return { records, sent, pdfInputs, deps, input };
}

test("sends stored recipient and existing link with real attachment payload; preserves invitation identity and expiry", async () => {
  const f = fixture(); const before = { ...f.records.get("schoolInvites/invite") };
  const result = await sendSchoolInviteEmail(f.input, f.deps);
  assert.equal(result.emailSent, true);
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].to, "teacher@example.com");
  assert.match(f.sent[0].html, /Hei Lærer Ærlig!/); assert.match(f.sent[0].subject, /Eksempelskolen/);
  assert.ok(f.sent[0].text?.includes(f.pdfInputs[0]));
  assert.equal(f.sent[0].attachments?.[0].content, Buffer.from("%PDF-test").toString("base64"));
  assert.equal(f.sent[0].attachments?.[0].contentType, "application/pdf");
  const after = f.records.get("schoolInvites/invite")!;
  for (const key of ["inviteToken", "inviteCode", "expiresAt", "email", "status"]) assert.equal(after[key], before[key]);
  assert.ok(after.emailSentAt); assert.equal(after.emailSentByUid, "admin");
});

test("foreign invitations, non-admins, inactive members/schools and unusable invitations cannot send", async () => {
  for (const [path, changes, reason] of [
    ["schools/school/members/admin", { role: "school_teacher" }, "forbidden"],
    ["schools/school/members/admin", { status: "disabled" }, "forbidden"],
    ["schools/school", { status: "inactive" }, "school_not_active"],
    ["schoolInvites/invite", { schoolId: "foreign" }, "invite_not_found"],
    ["schoolInvites/invite", { status: "accepted" }, "invite_not_pending"],
    ["schoolInvites/invite", { expiresAt: Timestamp.fromMillis(1) }, "invite_expired"],
    ["schoolInvites/invite", { inviteToken: "" }, "missing_invite_link"],
    ["schoolInvites/invite", { email: "invalid" }, "invalid_email"],
  ] as const) {
    const f = fixture(); Object.assign(f.records.get(path)!, changes);
    await assert.rejects(sendSchoolInviteEmail(f.input, f.deps), error => error instanceof InviteEmailError && error.reason === reason);
    assert.equal(f.sent.length, 0); assert.equal(f.pdfInputs.length, 0);
  }
});

test("concurrent requests send once; provider failure never reports success or marks sent", async () => {
  const f = fixture();
  const results = await Promise.allSettled([sendSchoolInviteEmail(f.input, f.deps), sendSchoolInviteEmail(f.input, f.deps)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1); assert.equal(f.sent.length, 1);
  const failed = fixture();
  await assert.rejects(sendSchoolInviteEmail(failed.input, { ...failed.deps, send: async () => ({ ok: false, reason: "send_failed" }) }), /send_failed/);
  assert.equal(failed.records.get("schoolInvites/invite")!.emailSentAt, undefined);
  const missing = fixture();
  await assert.rejects(sendSchoolInviteEmail(missing.input, { ...missing.deps, configured: false }), /email_not_configured/);
  assert.equal(missing.records.get("schoolInvites/invite")!.emailLastAttemptAt, undefined);
});
