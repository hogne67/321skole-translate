import assert from "node:assert/strict";
import test from "node:test";
import { handleSchoolInvite } from "./inviteRoute";
import { InviteEmailError, type sendSchoolInviteEmail } from "./sendInviteEmail";
import type { createSchoolInvites } from "./createSchoolInvite";

function fixture() {
  const created: Parameters<typeof createSchoolInvites>[0][] = [];
  const sent: Parameters<typeof sendSchoolInviteEmail>[0][] = [];
  const deps = {
    authenticate: async () => "admin",
    getMember: async () => ({ uid: "admin", role: "school_admin" as const, status: "active" as const }),
    createInvites: async (input: Parameters<typeof createSchoolInvites>[0]) => {
      created.push(input);
      return { ok: true, invites: input.recipients.map((recipient, i) => ({
        ...recipient, inviteId: `invite-${i}`, token: `stored-token-${i}`, inviteCode: `stored-code-${i}`,
      })) };
    },
    sendInvite: async (input: Parameters<typeof sendSchoolInviteEmail>[0]) => {
      sent.push(input); return { ok: true, emailSent: true, email: "teacher@example.com" };
    },
  };
  const request = (body: unknown, token = "test-token") => new Request("https://321school.com/api/schools/invite", {
    method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const body = { schoolId: "school", email: "teacher@example.com", displayName: "Lærer", locale: "nb" };
  return { created, sent, deps, request, body };
}

test("single teacher invitation automatically uses the same email service as the manual button", async () => {
  const f = fixture();
  const response = await handleSchoolInvite(f.request({ ...f.body, uid: "untrusted-client-uid" }), f.deps);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.ok, true); assert.equal(result.emailSent, true);
  assert.equal(result.token, "stored-token-0"); assert.equal(result.inviteCode, "stored-code-0");
  assert.deepEqual(f.sent, [{ uid: "admin", schoolId: "school", inviteId: "invite-0", locale: "nb" }]);
  assert.equal(f.created[0].invitedBy, "admin");
});

test("batch print-only creates invitations without sending; enabled email sends each stored invitation", async () => {
  for (const sendEmail of [false, true]) {
    const f = fixture();
    const recipients = [{ email: "one@example.com" }, { email: "two@example.com" }];
    const response = await handleSchoolInvite(f.request({ schoolId: "school", recipients, sendEmail, locale: "en" }), f.deps);
    const result = await response.json();
    assert.equal(result.invites.length, 2); assert.equal(f.created.length, 1);
    assert.equal(f.sent.length, sendEmail ? 2 : 0);
    assert.ok(result.invites.every((invite: { emailSent: boolean; emailSkipped?: boolean }) =>
      invite.emailSent === sendEmail && (sendEmail || invite.emailSkipped === true)));
    if (sendEmail) assert.deepEqual(f.sent.map(input => [input.inviteId, input.locale]), [["invite-0", "en"], ["invite-1", "en"]]);
  }
});

test("send failure preserves the created invitation for retry and reports unsent correctly", async () => {
  const f = fixture();
  const response = await handleSchoolInvite(f.request(f.body), { ...f.deps,
    sendInvite: async () => { throw new InviteEmailError("send_failed", 502); } });
  const result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.ok, true);
  assert.equal(result.emailSent, false); assert.equal(result.warning, "send_failed");
  assert.equal(result.inviteId, "invite-0"); assert.equal(result.token, "stored-token-0");
  assert.equal(f.created.length, 1);
});

test("authentication, school administrator membership and capacity checks run before sending", async () => {
  const f = fixture();
  assert.equal((await handleSchoolInvite(f.request(f.body, ""), f.deps)).status, 401);
  assert.equal((await handleSchoolInvite(f.request(f.body), { ...f.deps, authenticate: async () => { throw new Error("invalid"); } })).status, 401);
  assert.equal((await handleSchoolInvite(f.request(f.body), { ...f.deps, getMember: async () => null })).status, 403);
  assert.equal(f.created.length, 0); assert.equal(f.sent.length, 0);
  const response = await handleSchoolInvite(f.request(f.body), { ...f.deps,
    createInvites: async () => ({ ok: false, reason: "seat_limit_reached" }) });
  assert.equal(response.status, 400); assert.equal(f.sent.length, 0);
});
