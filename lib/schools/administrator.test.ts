import assert from "node:assert/strict";
import test from "node:test";
import { assertSchoolAssignmentAvailable, resolveSchoolAdministrator, SchoolAdministratorError } from "./administrator";

const account = { uid: "real-user", email: "english@test.no", disabled: false };
const lookup = {
  async getUser(uid: string) { assert.equal(uid, account.uid); return account; },
  async getUserByEmail(email: string) { assert.equal(email, account.email); return account; },
};

test("copied UID labels resolve to the real account", async () => {
  assert.equal((await resolveSchoolAdministrator(lookup, { adminUid: " uid: real-user ", adminEmail: "English@Test.No" })).uid, account.uid);
});
test("administrators can be resolved by email without a UID", async () => {
  assert.equal((await resolveSchoolAdministrator(lookup, { adminEmail: " english@test.no " })).uid, account.uid);
});
test("mismatched UID and email cannot assign access", async () => {
  await assert.rejects(resolveSchoolAdministrator(lookup, { adminUid: account.uid, adminEmail: "other@test.no" }), SchoolAdministratorError);
});
test("missing and disabled accounts cannot assign access", async () => {
  await assert.rejects(resolveSchoolAdministrator(lookup, {}), SchoolAdministratorError);
  await assert.rejects(resolveSchoolAdministrator({ ...lookup, async getUser() { return { ...account, disabled: true }; } }, { adminUid: account.uid }), SchoolAdministratorError);
  await assert.rejects(resolveSchoolAdministrator({ ...lookup, async getUser() { throw Object.assign(new Error(), { code: "auth/user-not-found" }); } }, { adminUid: account.uid }), SchoolAdministratorError);
});
test("an active membership cannot be overwritten by another school", () => {
  assert.throws(() => assertSchoolAssignmentAvailable({ schoolId: "other-school", schoolStatus: "active" }, "creators"), SchoolAdministratorError);
  assert.doesNotThrow(() => assertSchoolAssignmentAvailable({ schoolId: "other-school", schoolStatus: "disabled" }, "creators"));
  assert.doesNotThrow(() => assertSchoolAssignmentAvailable({ schoolId: "creators", schoolStatus: "active" }, "creators"));
});
