import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { assertSubstituteExpiry } from "./spaceSubstituteExpiry.server";

const scope = { uid: "synthetic-vikar", spaceId: "synthetic-room", schoolId: "synthetic-school", grantId: "synthetic-grant", expiresAt: 1800000000000 };
const db = { projectId: "synthetic-project", databaseId: "synthetic-database" };
const fixture = () => ({ fields: {
  uid: { stringValue: scope.uid }, spaceId: { stringValue: scope.spaceId },
  role: { stringValue: "substitute" }, status: { stringValue: "substitute" },
  active: { booleanValue: true }, archived: { booleanValue: false },
  substituteSchoolId: { stringValue: scope.schoolId }, substituteGrantId: { stringValue: scope.grantId },
  substituteExpiresAt: { timestampValue: new Date(scope.expiresAt).toISOString() },
} });
const rejectsStatus = (promise: Promise<void>, status: number) => assert.rejects(promise, (error: { status?: number }) => error.status === status);
let emulator: string | undefined;
beforeEach(() => { emulator = process.env.FIRESTORE_EMULATOR_HOST; delete process.env.FIRESTORE_EMULATOR_HOST; });
afterEach(() => { mock.restoreAll(); if (emulator === undefined) delete process.env.FIRESTORE_EMULATOR_HOST; else process.env.FIRESTORE_EMULATOR_HOST = emulator; });

test("only the end user's ID token reaches the fixed Google origin and the actual named database", async () => {
  let requests = 0;
  mock.method(globalThis, "fetch", async (input: URL, options: RequestInit) => {
    requests++;
    assert.equal(input.origin, "https://firestore.googleapis.com");
    assert.equal(input.pathname, "/v1/projects/synthetic-project/databases/synthetic-database/documents/spaceMembers/synthetic-room_synthetic-vikar");
    assert.deepEqual(options.headers, { Authorization: "Bearer synthetic-id-token" });
    assert.equal(options.method, "GET");
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    assert(options.signal instanceof AbortSignal);
    assert.equal(input.searchParams.getAll("mask.fieldPaths").length, 9);
    return Response.json(fixture());
  });
  await assertSubstituteExpiry(db, "synthetic-id-token", scope);
  assert.equal(requests, 1);
});

test("missing, denied and invalid authentication never produce permission", async () => {
  for (const status of [401, 403, 404]) {
    const fetch = mock.method(globalThis, "fetch", async () => new Response(null, { status }));
    await rejectsStatus(assertSubstituteExpiry(db, "synthetic-id-token", scope), status === 401 ? 401 : 403);
    fetch.mock.restore();
  }
});

test("network, throttling and provider errors fail closed without retry or Admin fallback", async () => {
  for (const status of [204, 429, 500, 503]) {
    const fetch = mock.method(globalThis, "fetch", async () => new Response(null, { status }));
    await rejectsStatus(assertSubstituteExpiry(db, "synthetic-id-token", scope), 503);
    assert.equal(fetch.mock.callCount(), 1);
    fetch.mock.restore();
  }
  const fetch = mock.method(globalThis, "fetch", async () => { throw new Error("synthetic transport failure"); });
  await rejectsStatus(assertSubstituteExpiry(db, "synthetic-id-token", scope), 503);
  assert.equal(fetch.mock.callCount(), 1);
});

test("a substituted grant, changed expiry or ordinary teacher record is not accepted as the checked vikar grant", async () => {
  for (const [field, value] of [
    ["substituteGrantId", { stringValue: "another-grant" }],
    ["substituteExpiresAt", { timestampValue: new Date(scope.expiresAt + 1).toISOString() }],
    ["role", { stringValue: "teacher" }], ["active", { booleanValue: false }],
    ["substituteSchoolId", { stringValue: "another-school" }],
  ] as const) {
    const body = fixture();
    Object.assign(body.fields, { [field]: value });
    const fetch = mock.method(globalThis, "fetch", async () => Response.json(body));
    await rejectsStatus(assertSubstituteExpiry(db, "synthetic-id-token", scope), 403);
    fetch.mock.restore();
  }
});

test("malformed responses and unsafe emulator configuration are rejected", async () => {
  const fetch = mock.method(globalThis, "fetch", async () => new Response("not-json"));
  await rejectsStatus(assertSubstituteExpiry(db, "synthetic-id-token", scope), 503);
  fetch.mock.restore();
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8287";
  const unused = mock.method(globalThis, "fetch", async () => Response.json(fixture()));
  await rejectsStatus(assertSubstituteExpiry(db, "synthetic-id-token", scope), 503);
  assert.equal(unused.mock.callCount(), 0);
});
