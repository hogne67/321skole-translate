import assert from "node:assert/strict";
import { after, afterEach, beforeEach, mock, test } from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { GET, POST } from "../../app/api/admin/schools/[schoolId]/administrators/route";

// All Auth and Firestore operations below are in-memory; no real roles are changed.
const app = initializeApp({ projectId: "school-administrator-tests" });
const auth = getAuth(app);
const db = getFirestore(app);
const context = { params: Promise.resolve({ schoolId: "school" }) };
const records = new Map<string, Record<string, unknown>>();
let disabledAccount = false;
let accountReads = 0;

function ref(path: string) {
  return { path, id: path.split("/").at(-1)!, collection: (name: string) => collection(`${path}/${name}`),
    get: async () => snapshot(path) };
}
function snapshot(path: string) {
  return { exists: records.has(path), id: path.split("/").at(-1)!, ref: ref(path),
    data: () => records.get(path), get: (key: string) => records.get(path)?.[key] };
}
function collection(path: string) {
  return { path, doc: (id = "audit-event") => ref(`${path}/${id}`) };
}
function request(method: string, token: string | null = "actor", input: Record<string, string> = {}) {
  const url = new URL("https://example.test/api/admin/schools/school/administrators");
  if (method === "GET") for (const [key, value] of Object.entries(input)) url.searchParams.set(key, value);
  return new Request(url, { method, headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(method === "POST" ? { body: JSON.stringify(input) } : {}) });
}

beforeEach(() => {
  records.clear(); disabledAccount = false; accountReads = 0;
  records.set("users/actor", { role: "admin", adminLevel: "superadmin" });
  records.set("schools/school", { name: "Test school" });
  records.set("users/teacher", { role: "teacher", roles: { teacher: true }, adminLevel: "none", displayName: "Test Teacher",
    schoolId: "school", schoolRole: "school_teacher", schoolStatus: "active", customPreference: "keep" });
  records.set("schools/school/members/teacher", { uid: "teacher", role: "school_teacher", status: "active", joinedAt: "original" });
  mock.method(auth, "verifyIdToken", async (token: string) => {
    if (token === "invalid") throw Object.assign(new Error("Invalid token"), { code: "auth/argument-error" });
    return { uid: token };
  });
  const account = () => { accountReads++; return { uid: "teacher", email: "teacher@example.test", displayName: "Test Teacher", disabled: disabledAccount }; };
  mock.method(auth, "getUser", async (uid: string) => {
    assert.equal(uid, "teacher"); return account();
  });
  mock.method(auth, "getUserByEmail", async (email: string) => {
    if (email !== "teacher@example.test") throw Object.assign(new Error("Not found"), { code: "auth/user-not-found" });
    return account();
  });
  mock.method(db, "collection", collection);
  mock.method(db, "runTransaction", async (fn: (tx: unknown) => Promise<void>) => {
    const pending: (() => void)[] = [];
    await fn({
      get: async (reference: { path: string; id?: string }) => reference.id ? snapshot(reference.path) : {
        docs: [...records.keys()].filter(path => path.startsWith(`${reference.path}/`)).map(snapshot),
      },
      set: (reference: { path: string }, value: Record<string, unknown>, options?: { merge: boolean }) => {
        pending.push(() => records.set(reference.path, { ...(options?.merge ? records.get(reference.path) : {}), ...value }));
      },
      delete: (reference: { path: string }) => pending.push(() => records.delete(reference.path)),
    });
    pending.forEach(write => write());
  });
});
afterEach(() => mock.restoreAll());
after(() => deleteApp(app));

test("lookup and assignment require an authenticated, enabled platform superadmin", async () => {
  for (const method of ["GET", "POST"]) {
    const handler = method === "GET" ? GET : POST;
    assert.equal((await handler(request(method, null), context)).status, 401);
    assert.equal((await handler(request(method, "invalid"), context)).status, 401);
    for (const profile of [
      { role: "teacher", schoolRole: "school_admin" }, { role: "admin", adminLevel: "admin" },
      { role: "teacher", adminLevel: "superadmin" }, { role: "admin", adminLevel: "superadmin", disabled: true },
    ]) {
      records.set("users/actor", profile);
      assert.equal((await handler(request(method), context)).status, 403);
    }
  }
  assert.equal(accountReads, 0);
  assert.equal(records.get("users/teacher")?.schoolRole, "school_teacher");
});

test("lookup previews the verified account without changing access", async () => {
  records.set("users/actor", { roles: { admin: true }, adminLevel: "superadmin" });
  const before = structuredClone([...records]);
  const response = await GET(request("GET", "actor", { email: "Teacher@Example.Test" }), context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual((await response.json()).administrator, {
    uid: "teacher", email: "teacher@example.test", displayName: "Test Teacher", alreadyAdministrator: false,
  });
  assert.deepEqual([...records], before);
  assert.equal((await GET(request("GET", "actor", { email: "missing@example.test" }), context)).status, 400);
});

test("assignment changes only school access, preserves the account's global roles and records the actor", async () => {
  const input = { adminUid: "teacher", adminEmail: "teacher@example.test", role: "admin", adminLevel: "superadmin" };
  assert.equal((await POST(request("POST", "actor", input), context)).status, 200);
  const profile = records.get("users/teacher")!;
  assert.equal(profile.schoolRole, "school_admin"); assert.equal(profile.schoolId, "school");
  assert.equal(profile.schoolStatus, "active"); assert.equal(profile.customPreference, "keep");
  assert.equal(profile.role, "teacher"); assert.deepEqual(profile.roles, { teacher: true }); assert.equal(profile.adminLevel, "none");
  const member = records.get("schools/school/members/teacher")!;
  assert.equal(member.role, "school_admin"); assert.equal(member.status, "active"); assert.equal(member.joinedAt, "original");
  const audit = records.get("adminAuditEvents/audit-event")!;
  assert.equal(audit.actorUid, "actor"); assert.equal(audit.targetUid, "teacher"); assert.equal(audit.schoolId, "school");
  const preview = await GET(request("GET", "actor", { uid: "teacher" }), context);
  assert.equal((await preview.json()).administrator.alreadyAdministrator, true);
});

test("saving rechecks school conflicts, disabled accounts and identity after preview", async () => {
  const input = { adminUid: "teacher", adminEmail: "teacher@example.test" };
  assert.equal((await GET(request("GET", "actor", { uid: "teacher" }), context)).status, 200);
  const profile = records.get("users/teacher")!;
  profile.schoolId = "another-school";
  assert.equal((await POST(request("POST", "actor", input), context)).status, 409);
  profile.schoolId = "school"; profile.disabled = true;
  assert.equal((await POST(request("POST", "actor", input), context)).status, 400);
  profile.disabled = false; disabledAccount = true;
  assert.equal((await POST(request("POST", "actor", input), context)).status, 400);
  disabledAccount = false;
  assert.equal((await POST(request("POST", "actor", { ...input, adminEmail: "wrong@example.test" }), context)).status, 400);
  assert.equal(profile.schoolRole, "school_teacher");
  assert.equal(records.has("adminAuditEvents/audit-event"), false);
});
