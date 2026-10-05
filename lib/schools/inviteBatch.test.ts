import assert from "node:assert/strict";
import test from "node:test";
import { inviteCapacityReason, validateInviteRecipients } from "./inviteBatch";
import { createInviteCode, createInviteToken, hashInviteToken, inviteLookupField, normalizeInviteCode } from "./server/tokens";
import { isSchoolInvitationPath } from "./invitePaths";

test("normalize recipients without requiring an existing account or name", () => {
  assert.deepEqual(validateInviteRecipients([{ email:" Teacher@Test.No ", displayName:" Harriet " }, { email:"new@test.no" }]), [
    { email:"teacher@test.no", displayName:"Harriet" }, { email:"new@test.no", displayName:"" },
  ]);
});
test("reject duplicates, missing emails and excessively large batches", () => {
  assert.throws(() => validateInviteRecipients([{email:"x@test.no"},{email:"X@test.no"}]), /duplicate_email/);
  assert.throws(() => validateInviteRecipients([{displayName:"Name only"}]), /invalid_email/);
  assert.throws(() => validateInviteRecipients([]), /invalid_batch/);
  assert.throws(() => validateInviteRecipients(Array.from({length:51},(_,i)=>({email:`${i}@test.no`}))), /invalid_batch/);
  assert.throws(() => validateInviteRecipients([{email:"test@test.no",displayName:"x".repeat(121)}]), /invalid_name/);
});
test("reserve seats for every pending invitation and reject oversized batches", () => {
  assert.equal(inviteCapacityReason(25,10,5,10), null);
  assert.equal(inviteCapacityReason(25,10,5,11), "seat_limit_reached");
  assert.equal(inviteCapacityReason(25,25,0,1), "seat_limit_reached");
  assert.equal(inviteCapacityReason(0,0,0,1), "invalid_seat_limit");
});
test("manual codes tolerate case, spaces and separators while preserving old QR links", () => {
  const code=createInviteCode();
  assert.match(code,/^[A-F0-9]{5}(-[A-F0-9]{5}){3}$/);
  const lookup=inviteLookupField(code.toLowerCase().replaceAll('-',' '));
  assert.equal(lookup.field,"inviteCodeHash");
  assert.equal(lookup.hash,hashInviteToken(normalizeInviteCode(code)));
  const token=createInviteToken();
  assert.deepEqual(inviteLookupField(token),{field:"inviteTokenHash",hash:hashInviteToken(token)});
  assert.notEqual(createInviteCode(),code);
});

test("school invitation return paths stay available after sign-in without opening unrelated school routes", () => {
  assert.equal(isSchoolInvitationPath("/nb/school/accept?token=original-token", "nb"), true);
  assert.equal(isSchoolInvitationPath("/en/school/accept?token=original-token", "en"), true);
  assert.equal(isSchoolInvitationPath("/nb/school/teachers", "nb"), false);
  assert.equal(isSchoolInvitationPath("//other.site/nb/school/accept", "nb"), false);
  assert.equal(isSchoolInvitationPath("/nb/school/accept-other", "nb"), false);
});
