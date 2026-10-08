import assert from "node:assert/strict";
import test from "node:test";
import { createAnonymousDirectoryHandler, findLinkedMemberUids, type AnonymousDirectoryDependencies, type DirectoryAccount } from "./anonymousUsers";

const account = (uid: string, extra: Partial<DirectoryAccount> = {}): DirectoryAccount => ({
  uid, providerData: [], disabled: false, metadata: { creationTime: "2026-10-01T12:00:00Z" }, ...extra,
});
function dependencies(extra: Partial<AnonymousDirectoryDependencies> = {}): AnonymousDirectoryDependencies {
  return {
    async verifyToken() { return { uid: "admin", anonymous: false }; },
    async getProfile() { return { roles: { admin: true } }; },
    async listAccounts() { return { users: [account("anon")], pageToken: "next-page" }; },
    async getAccount(uid) { return account(uid); },
    async getMemberships() { return {}; },
    ...extra,
  };
}
const request = (query = "", token = "valid") => new Request(`https://example.test/api/admin/users/anonymous${query}`, {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});

test("directory denies missing, revoked, anonymous, non-admin and disabled admin access before reading users", async () => {
  const never = async () => { assert.fail("must not list accounts"); };
  assert.equal((await createAnonymousDirectoryHandler(dependencies({ listAccounts: never }))(request("", ""))).status, 401);
  assert.equal((await createAnonymousDirectoryHandler(dependencies({ listAccounts: never, async verifyToken() { throw new Error("revoked"); } }))(request())).status, 401);
  for (const profile of [null, { role: "teacher" }, { role: "admin", disabled: true }, { roles: { admin: false } }]) {
    const handler = createAnonymousDirectoryHandler(dependencies({ listAccounts: never, async getProfile() { return profile; } }));
    assert.equal((await handler(request())).status, 403);
  }
  assert.equal((await createAnonymousDirectoryHandler(dependencies({ listAccounts: never, async verifyToken() { return { uid: "anon", anonymous: true }; } }))(request())).status, 403);
});

test("paged directory includes unprofiled anonymous candidates, excludes named login methods and exposes only selected fields", async () => {
  const handler = createAnonymousDirectoryHandler(dependencies({
    async listAccounts(token) {
      assert.equal(token, "first-page");
      return { users: [
        { ...account("anon"), passwordHash: "never-return-this" },
        account("email", { email: "a@example.test" }), account("phone", { phoneNumber: "123" }),
        account("google", { providerData: [{ providerId: "google.com" }] }),
      ], pageToken: "second-page" };
    },
    async getMemberships(uids) { assert.deepEqual(uids, ["anon"]); return {}; },
  }));
  const response = await handler(request("?pageToken=first-page"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const result = await response.json();
  assert.equal(result.nextPageToken, "second-page");
  assert.equal(result.scanned, 4);
  assert.deepEqual(result.rows.map((row: { uid: string }) => row.uid), ["anon"]);
  assert.deepEqual(result.rows[0].memberships, []);
  assert.ok(!JSON.stringify(result).includes("never-return-this"));
});

test("exact lookup can inspect a registered account and handles deleted and invalid UIDs without leaking errors", async () => {
  const handler = createAnonymousDirectoryHandler(dependencies({
    async getAccount(uid) {
      if (uid === "gone") throw Object.assign(new Error("private error details"), { code: "auth/user-not-found" });
      return account(uid, { email: "test@example.test", providerData: [{ providerId: "password" }] });
    },
  }));
  const result = await (await handler(request("?uid=registered"))).json();
  assert.equal(result.rows[0].anonymousCandidate, false);
  assert.equal(result.rows[0].uid, "registered");
  assert.equal((await handler(request("?uid=gone"))).status, 404);
  assert.equal((await handler(request("?uid=bad%2Fuid"))).status, 400);
});

test("same room and student code find separate account and anonymous UIDs despite different participant IDs", () => {
  const member = { uid: "guest", spaceId: "room", studentCode: "CODE", participantId: "old-participant" };
  assert.deepEqual(findLinkedMemberUids(member, [member,
    { uid: "registered", spaceId: "room", studentCode: "CODE", participantId: "different" },
    { userId: "second-guest", spaceId: "room", participantId: "old-participant" },
    { uid: "other-room", spaceId: "other", studentCode: "CODE" },
    { uid: "same-name", spaceId: "room", displayName: "Cynthia", studentCode: "OTHER" },
    { uid: "registered", spaceId: "room", studentCode: "CODE" },
  ]), ["registered", "second-guest"]);
});
