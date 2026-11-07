import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, mock, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { getAuth } from "firebase-admin/auth";
import { DocumentSnapshot, Timestamp, type Firestore } from "firebase-admin/firestore";
import { collection, doc, getDocFromServer, getDocsFromServer, onSnapshot, query, setDoc, updateDoc, where } from "firebase/firestore";
import { setTimeout as delay } from "node:timers/promises";

const project = "demo-phase2-local";
const password = "synthetic-emulator-only-2026";
const tokens = new Map<string, string>();
const users = { adminA: ["A", "school_admin"], adminB: ["B", "school_admin"], owner: ["A", "school_teacher"],
  local: ["A", "school_teacher"], foreign: ["B", "school_teacher"], regular: ["A", "school_teacher"] };
const answer = "spaces/room/lessons/task/submissions/pupil";
let db: Firestore;
let env: RulesTestEnvironment;
let api: typeof import("../../app/api/schools/[schoolId]/substitutes/route");
let readAnswer: typeof import("../../app/api/spaces/[spaceId]/lessons/[assignmentId]/geometry-submission/[studentUid]/route");
let staff: typeof import("../../app/api/teacher/spaces/[spaceId]/staff/route");
let substituteRoom: typeof import("../../app/api/teacher/spaces/[spaceId]/substitute/route");

before(async () => {
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, project);
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8287");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9097");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" } });
  process.env.FIREBASE_ADMIN_SA_JSON = JSON.stringify({ project_id: project, client_email: "local@synthetic.invalid", private_key: privateKey });
  process.env.FIREBASE_STORAGE_BUCKET = `${project}.appspot.com`;
  const { getAdmin, getAdminApp } = await import("../firebaseAdmin");
  db = getAdmin().db;
  env = await initializeTestEnvironment({ projectId: project, firestore: { host: "127.0.0.1", port: 8287,
    rules: await readFile("firestore.rules", "utf8") } });
  await env.clearFirestore();
  [api, readAnswer, staff, substituteRoom] = await Promise.all([import("../../app/api/schools/[schoolId]/substitutes/route"),
    import("../../app/api/spaces/[spaceId]/lessons/[assignmentId]/geometry-submission/[studentUid]/route"),
    import("../../app/api/teacher/spaces/[spaceId]/staff/route"), import("../../app/api/teacher/spaces/[spaceId]/substitute/route")]);
  const batch = db.batch();
  for (const school of ["A", "B"]) batch.set(db.doc(`schools/${school}`), { status: "active" });
  for (const [uid, [schoolId, schoolRole]] of Object.entries(users)) {
    const email = `${uid.toLowerCase()}@synthetic.invalid`;
    await getAuth(getAdminApp()).createUser({ uid, email, password });
    const signIn = await fetch("http://127.0.0.1:9097/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic-api-key", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    assert.equal(signIn.status, 200);
    tokens.set(uid, (await signIn.json()).idToken);
    batch.set(db.doc(`users/${uid}`), { role: "teacher", schoolId, schoolRole, schoolStatus: "active" });
    batch.set(db.doc(`schools/${schoolId}/members/${uid}`), { uid, schoolId, role: schoolRole, status: "active" });
  }
  for (const [id, schoolId, kind] of [["room", "A", "class"], ["other", "A", "class"], ["abroad", "B", "class"], ["family", "A", "family"]]) {
    batch.set(db.doc(`spaces/${id}`), { ownerId: "owner", schoolId, kind, title: id, code: "must-stay-private" });
    batch.set(db.doc(`spaces/${id}/lessons/task`), { title: "Synthetic task" });
    batch.set(db.doc(`spaces/${id}/lessons/task/submissions/pupil`), { uid: "pupil", status: "submitted", answers: { text: "Synthetic only" } });
  }
  batch.set(db.doc("spaceSubmissions/pupil"), { uid: "pupil", spaceId: "room", assignmentId: "task" });
  batch.set(db.doc("spaceMembers/room_regular"), { uid: "regular", spaceId: "room", role: "teacher", status: "active" });
  await batch.commit();
});

after(async () => { await env?.cleanup(); });

const context = (schoolId: string) => ({ params: Promise.resolve({ schoolId }) });
function request(uid: string, path = "/", body?: unknown, method = body === undefined ? "GET" : "POST") {
  return new Request(`http://localhost${path}`, { method, headers: { Authorization: `Bearer ${tokens.get(uid)}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const expiry = () => Date.now() + 60 * 60 * 1000;
function grant(overrides = {}, actor = "adminA", schoolId = "A") {
  return api.POST(request(actor, "/", { action: "grant", spaceId: "room", teacherUid: "local", expiresAt: expiry(), ...overrides }), context(schoolId));
}
const read = (uid: string, spaceId = "room") => readAnswer.GET(request(uid), { params: Promise.resolve({ spaceId, assignmentId: "task", studentUid: "pupil" }) });
const roomContext = (spaceId = "room") => ({ params: Promise.resolve({ spaceId }) });
const vikar = (uid: string, path = "/?assignmentId=task", spaceId = "room") => substituteRoom.GET(request(uid, path), roomContext(spaceId));
const pupilDoc = (uid: string, path = answer) => doc(env.authenticatedContext(uid).firestore(), path);

test("administrative choices only expose room metadata and only to the assigned school administrator", async () => {
  const response = await api.GET(request("adminA"), context("A"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { rooms: [{ id: "other", title: "other" }, { id: "room", title: "room" }] });
  assert.equal((await api.GET(request("adminB"), context("A"))).status, 403);
  assert.equal((await api.GET(request("adminA", "/?spaceId=abroad"), context("A"))).status, 404);
  assert.equal((await read("adminA")).status, 403);
  await assertFails(getDocFromServer(pupilDoc("adminA")));
});

test("grant scope and expiry are validated and ordinary co-teacher access is preserved", async () => {
  assert.equal((await grant({}, "owner")).status, 403);
  assert.equal((await grant({}, "adminB", "B")).status, 404);
  assert.equal((await grant({ teacherUid: "foreign" })).status, 403);
  assert.equal((await grant({ spaceId: "family" })).status, 404);
  assert.equal((await grant({ teacherUid: "owner" })).status, 409);
  assert.equal((await grant({ teacherUid: "regular" })).status, 409);
  assert.equal((await grant({ expiresAt: Date.now() - 1 })).status, 400);
  assert.equal((await grant({ expiresAt: Date.now() + 32 * 86_400_000 })).status, 400);
  assert.equal((await read("regular")).status, 200);
});

test("one room grants access through the app while blocking direct pupil reads, elevation and staff management", async () => {
  const results = await Promise.all([grant(), grant()]);
  assert.deepEqual(results.map(response => response.status).sort(), [200, 409]);
  assert.equal((await read("local")).status, 403);
  assert.equal((await read("local", "other")).status, 403);
  assert.equal((await read("adminA")).status, 403);
  await assertFails(getDocFromServer(pupilDoc("local")));
  await assertSucceeds(getDocFromServer(pupilDoc("regular")));
  await assertFails(getDocFromServer(pupilDoc("local", "spaces/other/lessons/task/submissions/pupil")));
  await assertFails(updateDoc(pupilDoc("local", "spaces/room"), { ownerId: "local" }));
  await assertFails(updateDoc(pupilDoc("owner", "spaceMembers/room_local"), { status: "active", role: "teacher" }));
  await assertFails(setDoc(pupilDoc("owner", "spaceMembers/other_local"), { spaceId: "other", uid: "local", role: "substitute" }));
  const params = { params: Promise.resolve({ spaceId: "room" }) };
  assert.equal((await staff.POST(request("local", "/", { email: "foreign@synthetic.invalid" }), params)).status, 403);
  assert.equal((await staff.POST(request("owner", "/", { email: "local@synthetic.invalid" }), params)).status, 409);
  assert.equal((await staff.DELETE(request("owner", "/?uid=local", undefined, "DELETE"), params)).status, 409);
  const permitted = await vikar("local");
  assert.equal(permitted.status, 200);
  assert.equal(permitted.headers.get("cache-control"), "private, no-store");
  const view = await permitted.json();
  assert.deepEqual(view.submissions.map((row: { answers: unknown }) => row.answers), [{ text: "Synthetic only" }]);
  assert(!JSON.stringify(view).includes("must-stay-private"));
  assert.equal((await vikar("local", "/", "other")).status, 403);
  assert.equal((await vikar("adminA")).status, 403);
  assert.equal((await substituteRoom.POST(request("local", "/", { assignmentId: "task", submissionId: "pupil", feedback: "Synthetic feedback" }), roomContext())).status, 200);
  assert.equal((await db.doc(answer).get()).get("teacherFeedback.text"), "Synthetic feedback");
  assert.equal((await db.doc("spaceSubmissions/pupil").get()).get("teacherFeedback.teacherUid"), "local");
});

test("current school membership and expiry are enforced on each new read", async () => {
  const schoolMember = db.doc("schools/A/members/local");
  await schoolMember.update({ status: "disabled" });
  assert.equal((await vikar("local")).status, 403);
  await assertFails(getDocFromServer(pupilDoc("local")));
  await schoolMember.update({ status: "active" });
  assert.equal((await vikar("local")).status, 200);
  await db.doc("schools/A").update({ status: "inactive" });
  assert.equal((await vikar("local")).status, 403);
  await assertFails(getDocFromServer(pupilDoc("local")));
  await db.doc("schools/A").update({ status: "active" });
  await db.doc("spaceMembers/room_local").update({ substituteExpiresAt: Timestamp.fromMillis(Date.now() - 1000) });
  assert.equal((await vikar("local")).status, 403);
  await assertFails(getDocFromServer(pupilDoc("local")));
});

test("revocation applies to the displayed grant and records the actor and room", async () => {
  const expiresAt = expiry();
  assert.equal((await grant({ expiresAt })).status, 200);
  const list = async () => {
    const response = await api.GET(request("adminA", "/?spaceId=room"), context("A"));
    assert.equal(response.status, 200);
    return (await response.json()).grants;
  };
  const [first] = await list();
  const payload = { action: "revoke", spaceId: "room", teacherUid: "local", grantId: first.grantId };
  assert.equal((await api.POST(request("adminA", "/", { ...payload, grantId: "stale" }), context("A"))).status, 409);
  assert.equal((await api.POST(request("adminA", "/", payload), context("A"))).status, 200);
  assert.equal((await api.POST(request("adminA", "/", payload), context("A"))).status, 200);
  assert.equal((await vikar("local")).status, 403);
  await assertFails(getDocFromServer(pupilDoc("local")));
  const audits = await db.collection("adminAuditEvents").get();
  assert.equal(audits.docs.filter(row => row.get("type") === "space_substitute_granted").length, 2);
  const revocations = audits.docs.filter(row => row.get("type") === "space_substitute_revoked");
  assert.equal(revocations.length, 1);
  assert.equal(revocations[0].get("actorUid"), "adminA");
  assert.equal(revocations[0].get("spaceId"), "room");
  assert.equal(revocations[0].get("grantId"), first.grantId);
  assert.equal((await grant({ expiresAt })).status, 200);
  const [second] = await list();
  assert.notEqual(second.grantId, first.grantId);
  assert.equal(second.expiresAt, first.expiresAt);
  assert.equal((await api.POST(request("adminA", "/", payload), context("A"))).status, 409);
  assert.equal((await vikar("local")).status, 200);
  assert.equal((await api.POST(request("adminA", "/", { ...payload, grantId: second.grantId }), context("A"))).status, 200);
  assert.equal((await read("regular")).status, 200);
});

test("the vikar cannot open a pupil listener and the server checks the time on each request", async () => {
  const expiresAt = Date.now() + 3500;
  assert.equal((await grant({ expiresAt })).status, 200);
  assert.equal((await vikar("local")).status, 200);
  let denied: (result: string) => void = () => {};
  const result = new Promise<string>(resolve => { denied = resolve; });
  const stop = onSnapshot(pupilDoc("local"), () => denied("delivered"), error => denied(error.code));
  try {
    assert.equal(await Promise.race([result, delay(3000, "timeout")]), "permission-denied");
    await delay(Math.max(0, expiresAt - Date.now()) + 200);
    assert.equal((await vikar("local")).status, 403);
    assert.equal((await substituteRoom.POST(request("local", "/", { assignmentId: "task", submissionId: "pupil", feedback: "Too late" }), roomContext())).status, 403);
  } finally { stop(); }
});

test("expired list, pupil read and feedback are denied even when the function clock is 30 seconds slow", async () => {
  assert.equal((await grant()).status, 200);
  const ref = db.doc("spaceMembers/room_local");
  const before = await ref.get();
  const expiresAt = before.readTime.toMillis() - 2000;
  await ref.update({ substituteExpiresAt: Timestamp.fromMillis(expiresAt) });
  const saved = await ref.get();
  assert.equal(saved.get("substituteExpiresAt").toMillis(), expiresAt);
  assert(saved.readTime.toMillis() > expiresAt);
  const originalFeedback = (await db.doc(answer).get()).get("teacherFeedback");
  const wallNow = Date.now.bind(Date);
  const clock = mock.method(Date, "now", () => wallNow() - 30000);
  let statuses: number[];
  try {
    statuses = [
      (await vikar("local", "/")).status,
      (await vikar("local")).status,
      (await substituteRoom.POST(request("local", "/", {
        assignmentId: "task", submissionId: "pupil", feedback: "Must never be saved after expiry",
      }), roomContext())).status,
    ];
    console.log(JSON.stringify({ diagnostic: "synthetic-slow-function-clock", expiresAt,
      firestoreReadAt: saved.readTime.toMillis(), functionNow: Date.now(), wallNow: wallNow(),
      listStatus: statuses[0], pupilReadStatus: statuses[1], writeStatus: statuses[2] }));
  } finally { clock.mock.restore(); }
  const after = await db.doc(answer).get();
  assert.deepEqual(statuses, [403, 403, 403]);
  assert.deepEqual(after.get("teacherFeedback"), originalFeedback);
});

test("a valid grant and ordinary co-teacher access still work with a slow wall clock", async () => {
  assert.equal((await grant()).status, 200);
  const wallNow = Date.now.bind(Date);
  const clock = mock.method(Date, "now", () => wallNow() - 30000);
  try {
    assert.equal((await vikar("local")).status, 200);
    assert.equal((await read("regular")).status, 200);
    assert.equal((await substituteRoom.POST(request("local", "/", {
      assignmentId: "task", submissionId: "pupil", feedback: "Valid synthetic feedback with slow clock",
    }), roomContext())).status, 200);
  } finally { clock.mock.restore(); }
});

test("feedback that starts before expiry but reaches the write after expiry is denied with a slow clock", async () => {
  assert.equal((await vikar("local")).status, 200);
  const saved = await db.doc("spaceMembers/room_local").get();
  const expiresAt = saved.readTime.toMillis() + 1800;
  await saved.ref.update({ substituteExpiresAt: Timestamp.fromMillis(expiresAt) });
  const before = (await db.doc(answer).get()).get("teacherFeedback");
  const original = db.runTransaction.bind(db);
  let pausedAfterAccess = false;
  const transaction = mock.method(db, "runTransaction", (callback: Parameters<typeof db.runTransaction>[0]) =>
    original(async tx => callback(new Proxy(tx, {
      get(target, key) {
        if (key === "get") return async (...args: Parameters<typeof tx.get>) => {
          const snapshot = await Reflect.apply(target.get, target, args);
          if ((args[0] as { path?: string }).path === answer) {
            pausedAfterAccess = true;
            await delay(2200);
          }
          return snapshot;
        };
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }))));
  const wallNow = Date.now.bind(Date);
  const clock = mock.method(Date, "now", () => wallNow() - 30000);
  try {
    assert.equal((await substituteRoom.POST(request("local", "/", {
      assignmentId: "task", submissionId: "pupil", feedback: "Delayed feedback must never be saved",
    }), roomContext())).status, 403);
    assert(pausedAfterAccess, "The request must reach the read after access validation");
  } finally { clock.mock.restore(); transaction.mock.restore(); }
  assert.deepEqual((await db.doc(answer).get()).get("teacherFeedback"), before);
});

test("old Admin readTime plus a slow function clock cannot bypass expiry in any vikar API", async () => {
  assert.equal((await grant()).status, 200);
  const ref = db.doc("spaceMembers/room_local");
  const snapshot = await ref.get();
  const reference = snapshot.readTime.toMillis();
  await ref.update({ substituteExpiresAt: Timestamp.fromMillis(reference - 2000) });
  const before = (await db.doc(answer).get()).get("teacherFeedback");
  const descriptor = Object.getOwnPropertyDescriptor(DocumentSnapshot.prototype, "readTime")!;
  let substitutedReadTimes = 0;
  Object.defineProperty(DocumentSnapshot.prototype, "readTime", { ...descriptor, get() {
    if (this.ref.path === "spaceMembers/room_local") {
      substitutedReadTimes++;
      return Timestamp.fromMillis(reference - 9400);
    }
    return descriptor.get!.call(this);
  } });
  const wallNow = Date.now.bind(Date);
  const clock = mock.method(Date, "now", () => wallNow() - 30000);
  try {
    const statuses = [
      (await vikar("local", "/")).status,
      (await vikar("local")).status,
      (await substituteRoom.POST(request("local", "/", {
        assignmentId: "task", submissionId: "pupil", feedback: "Old readTime must not extend access",
      }), roomContext())).status,
    ];
    assert.deepEqual(statuses, [403, 403, 403]);
    // The Admin SDK encountered the substituted old timestamps, while the
    // independent Rules-authorized REST gets still rejected all three calls.
    assert(substitutedReadTimes >= 3);
  } finally { clock.mock.restore(); Object.defineProperty(DocumentSnapshot.prototype, "readTime", descriptor); }
  assert.deepEqual((await db.doc(answer).get()).get("teacherFeedback"), before);
});

test("own expired grant get is denied by service time while metadata lists and ordinary members still work", async () => {
  const client = env.authenticatedContext("local").firestore();
  await assertFails(getDocFromServer(doc(client, "spaceMembers/room_local")));
  const listed = await assertSucceeds(getDocsFromServer(query(collection(client, "spaceMembers"), where("uid", "==", "local"))));
  assert.equal(listed.docs.length, 1);
  await assertSucceeds(getDocFromServer(pupilDoc("owner", "spaceMembers/room_local")));
  await assertSucceeds(getDocFromServer(pupilDoc("regular", "spaceMembers/room_regular")));
  assert.equal((await read("regular")).status, 200);
});

test("an unavailable service-time check returns 503 without reading or saving pupil content", async () => {
  assert.equal((await grant()).status, 200);
  const before = (await db.doc(answer).get()).get("teacherFeedback");
  const originalFetch = globalThis.fetch;
  let checks = 0;
  const failedCheck = mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], options?: RequestInit) => {
    if (String(input).includes("/documents/spaceMembers/room_local")) {
      checks++;
      return new Response(null, { status: 503 });
    }
    return originalFetch(input, options);
  });
  try {
    assert.equal((await vikar("local")).status, 503);
    assert.equal((await substituteRoom.POST(request("local", "/", {
      assignmentId: "task", submissionId: "pupil", feedback: "Unavailable check must not permit a write",
    }), roomContext())).status, 503);
    assert.equal(checks, 2);
  } finally { failedCheck.mock.restore(); }
  assert.deepEqual((await db.doc(answer).get()).get("teacherFeedback"), before);
});
