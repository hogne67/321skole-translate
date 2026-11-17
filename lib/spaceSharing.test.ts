import assert from "node:assert/strict";
import test from "node:test";
import { canShareContentToSpace, isSpaceOpenForSharing } from "./spaceSharing";

test("sharing accepts open rooms, including legacy rooms without a status", () => {
  assert.equal(isSpaceOpenForSharing({ isOpen: true }), true);
  assert.equal(isSpaceOpenForSharing({ isOpen: true, status: "active", archived: false, deletedAt: null }), true);
});

test("sharing list excludes rooms where a teacher account only has a pupil or observer membership", () => {
  const room = { isOpen: true, ownerId: "another-teacher", ownerUid: "another-teacher" };
  for (const role of ["student", "observer", "parent", "school_admin"]) {
    assert.equal(canShareContentToSpace(room, "my-account", { role, status: "active", active: true, archived: false }), false);
  }
  assert.equal(canShareContentToSpace(room, "my-account"), false);
});

test("sharing list includes open owned rooms and active teaching memberships", () => {
  const room = { isOpen: true, ownerId: "owner", ownerUid: "owner" };
  assert.equal(canShareContentToSpace(room, "owner"), true);
  for (const membership of [
    { role: "teacher" }, { role: "co_teacher" }, { role: "staff", staffRole: "co_teacher" },
    { role: "staff", staffRole: "substitute" },
  ]) {
    assert.equal(canShareContentToSpace(room, "colleague", { ...membership, status: "active" }), true);
  }
});

test("closed rooms and revoked teaching or owner memberships never become sharing targets", () => {
  const room = { isOpen: true, ownerId: "owner" };
  for (const member of [{ role: "teacher", status: "removed" },
    { role: "teacher", status: "active", active: false }, { role: "teacher", status: "active", archived: true }]) {
    assert.equal(canShareContentToSpace(room, "owner", member), false);
    assert.equal(canShareContentToSpace(room, "colleague", member), false);
  }
  assert.equal(canShareContentToSpace({ ...room, isOpen: false }, "owner"), false);
  assert.equal(canShareContentToSpace({ ...room, ownerUid: "conflicting-owner" }, "owner"), false);
  assert.equal(canShareContentToSpace(room, ""), false);
});

test("sharing rejects closed, missing, archived, deleted and inactive rooms", () => {
  for (const room of [null, undefined, {}, { isOpen: false }, { isOpen: "true" },
    { isOpen: true, archived: true }, { isOpen: true, deletedAt: new Date() },
    { isOpen: true, active: false }, { isOpen: true, isActive: false },
    ...["closed", "inactive", "archived", "deleted", " ARCHIVED "].map(status => ({ isOpen: true, status })),
  ]) assert.equal(isSpaceOpenForSharing(room), false, JSON.stringify(room));
});
