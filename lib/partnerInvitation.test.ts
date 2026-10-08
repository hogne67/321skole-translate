import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPartnerInvitation, readPartnerContact, invitationId } from "./partnerInvitation";
import { isPartnerInvitationPath } from "./partnerInvitationPaths";

const invite = { email: "partner@example.com", status: "invited" };
const user = { uid: "partner", email: "partner@example.com", email_verified: true };

test("admin only needs name and email; contacts are normalized", () => {
  assert.deepEqual(readPartnerContact({ name: " Partner ", email: " PARTNER@EXAMPLE.COM " }), { name: "Partner", email: "partner@example.com", address: "", phone: "" });
  assert.throws(() => readPartnerContact({ name: "Partner", email: "invalid" }));
  assert.throws(() => readPartnerContact({ email: user.email }));
});
test("invitation must belong to the verified email account", () => {
  assert.equal(checkPartnerInvitation(invite, user, {}), "accept");
  assert.throws(() => checkPartnerInvitation(invite, { ...user, email: "another@example.com" }, {}));
  assert.throws(() => checkPartnerInvitation(invite, { ...user, email_verified: false }, {}));
  assert.throws(() => checkPartnerInvitation(undefined, user, {}));
});
test("admin accounts and cancelled invitations cannot gain partner access", () => {
  assert.throws(() => checkPartnerInvitation(invite, user, { role: "admin" }));
  assert.throws(() => checkPartnerInvitation(invite, user, { roles: { admin: true } }));
  assert.throws(() => checkPartnerInvitation({ ...invite, status: "rejected" }, user, {}));
});
test("acceptance is idempotent only for the account that claimed it", () => {
  const accepted = { ...invite, status: "approved", uid: user.uid };
  assert.equal(checkPartnerInvitation(accepted, user, {}), "accepted");
  assert.throws(() => checkPartnerInvitation(accepted, { ...user, uid: "different" }, {}));
});
test("tokens resolve to distinct stable document IDs", () => {
  assert.equal(invitationId("a".repeat(64)), invitationId("a".repeat(64)));
  assert.notEqual(invitationId("a".repeat(64)), invitationId("b".repeat(64)));
});
test("login can return to an invitation without allowing external redirects", () => {
  assert.equal(isPartnerInvitationPath(`/nb/partner-invitation/${"a".repeat(64)}`, "nb"), true);
  assert.equal(isPartnerInvitationPath(`//example.com/nb/partner-invitation/${"a".repeat(64)}`, "nb"), false);
  assert.equal(isPartnerInvitationPath(`/en/partner-invitation/${"a".repeat(64)}`, "nb"), false);
});
