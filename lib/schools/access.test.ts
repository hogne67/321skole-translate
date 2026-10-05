import assert from "node:assert/strict";
import test from "node:test";
import { canAccessSchoolAdmin, type SchoolProfileLike } from "./access";

test("school administration requires an active administrator profile", () => {
  const profile: SchoolProfileLike = { schoolId: "creators", schoolRole: "school_admin", schoolStatus: "active" };
  assert.equal(canAccessSchoolAdmin(profile), true);
  assert.equal(canAccessSchoolAdmin({ ...profile, schoolStatus: "disabled" }), false);
  assert.equal(canAccessSchoolAdmin({ ...profile, schoolStatus: undefined }), false);
  assert.equal(canAccessSchoolAdmin({ ...profile, schoolRole: "school_teacher" }), false);
  assert.equal(canAccessSchoolAdmin({ ...profile, disabled: true }), false);
  assert.equal(canAccessSchoolAdmin({ ...profile, schoolId: "" }), false);
  assert.equal(canAccessSchoolAdmin(null), false);
});
