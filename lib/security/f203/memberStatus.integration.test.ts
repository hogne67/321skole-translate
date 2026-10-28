import assert from "node:assert/strict";
import { before, beforeEach, after, afterEach, test, mock } from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { initializeApp as clientApp, deleteApp as deleteClientApp, type FirebaseApp } from "firebase/app";
import { getAuth as clientAuth, connectAuthEmulator, signInWithCredential, OAuthProvider, type User } from "firebase/auth";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, getBytes } from "firebase/storage";
import { saveGeneratedSpaceImage } from "../../spaceFiles.server";
import { privateSpaceFileUrlId, type SpaceFileScope } from "../../spaceFiles";
import { isActiveSpaceMember, isSpaceTeachingMember } from "../spaceAccess";
import { getSpaceAccess, getActiveSpaceMembership } from "../spaceAccess.server";
import { isActivePupil, evaluatePupilJoin } from "../../spaceJoinPolicy";
import { getStudentSpaceMembership } from "../../studentSpaceMembership";
import { listMySpaceIds } from "../../spaceMembership";
import * as file from "../../../app/api/space-files/[id]/route";
import { NextRequest } from "next/server";
import OpenAI from "openai";

const project = "demo-phase2-local", bucketName = `${project}.appspot.com`;
const aliases = ["owner", "pupil", "peer", "co", "schooladmin", "foreign", "dual"] as const;
type Alias = typeof aliases[number];
const identities = {} as Record<Alias, { uid: string; user: User; app: FirebaseApp }>;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=", "base64");
let app: ReturnType<typeof initializeApp>, db: ReturnType<typeof getFirestore>, env: RulesTestEnvironment;
const uid = (alias: Alias) => identities[alias].uid;
const member = (alias: Alias) => `spaceMembers/room_${uid(alias)}`;
const submission = () => `room_writing_${uid("pupil")}`;
const submissionPath = () => `spaces/room/writingActivities/writing/submissions/${submission()}`;
const scope = (): SpaceFileScope => ({ spaceId: "room", activityId: "writing", submissionId: submission(), purpose: "writing_image" });
const observations: { check: string; details: unknown }[] = [];
let providerCalls = 0;

function oidc(subject: string) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: "https://synthetic-idp.invalid", aud: "synthetic", sub: subject, email: `${subject}@synthetic.invalid`, email_verified: true })).toString("base64url");
  return new OAuthProvider("oidc.feide").credential({ idToken: `${header}.${payload}.` });
}
function storage(alias: Alias | null, authTime?: number) {
  return (alias ? env.authenticatedContext(uid(alias), authTime === undefined ? {} : { auth_time: authTime }) : env.unauthenticatedContext()).storage(`gs://${bucketName}`);
}
async function sdkRead(alias: Alias | null, object: string, authTime?: number) {
  assert.deepEqual(Buffer.from(await getBytes(ref(storage(alias, authTime), object))), png);
}
async function legacy(kind: "writing-print-images" | "board-images" = "writing-print-images", owner = uid("pupil"), custom: Record<string, string> = {}) {
  const object = `${kind}/${owner}/room/${kind === "writing-print-images" ? "writing/" : ""}${randomUUID()}.png`;
  await getStorage(app).bucket(bucketName).file(object).save(png, { resumable: false, contentType: "image/png", metadata: { cacheControl: "private,no-store", metadata: custom } });
  return object;
}
async function request(alias: Alias | null, method = "GET", body?: unknown) {
  return new Request("http://127.0.0.1/api/synthetic", { method, headers: {
    ...(alias ? { Authorization: `Bearer ${await identities[alias].user.getIdToken()}` } : {}), "Content-Type": "application/json",
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
async function privateImage(purpose: "writing_image" | "board_image" = "writing_image") {
  const saved = await saveGeneratedSpaceImage(uid(purpose === "board_image" ? "owner" : "pupil"), purpose === "board_image"
    ? { spaceId: "room", activityId: "state", purpose } : scope(), png);
  if (purpose === "board_image") await db.doc("spaces/room/board/state").set({ data: { imageUrl: saved.imageUrl } });
  else await db.doc(submissionPath()).update({ "printProfile.imageUrl": saved.imageUrl });
  return { ...saved, id: privateSpaceFileUrlId(saved.imageUrl)! };
}
async function apiRead(alias: Alias | null, id: string, expected: number) {
  const response = await file.GET(await request(alias), ctx(id));
  assert.equal(response.status, expected);
  if (expected === 200) { assert.deepEqual(Buffer.from(await response.arrayBuffer()), png); assert.equal(response.headers.get("cache-control"), "private,no-store"); }
  return response;
}

before(async () => {
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, project);
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8287");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9097");
  assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9297");
  assert.ok(process.env.PHASE2_RESULT_DIR?.includes("security-f203-local"));
  for (const key of Object.keys(process.env)) assert.ok(!/^(GOOGLE_APPLICATION_CREDENTIALS|FIREBASE_ADMIN_|FIREBASE_TOKEN$)/.test(key));
  app = initializeApp({ projectId: project, storageBucket: bucketName }); db = getFirestore(app);
  env = await initializeTestEnvironment({ projectId: project, firestore: { host: "127.0.0.1", port: 8287, rules: await readFile("firestore.rules", "utf8") }, storage: { host: "127.0.0.1", port: 9297, rules: await readFile("storage.rules", "utf8") } });
  for (const alias of aliases) {
    const client = clientApp({ apiKey: "synthetic-api-key", projectId: project, authDomain: `${project}.invalid` }, `f203-${alias}`);
    connectAuthEmulator(clientAuth(client), "http://127.0.0.1:9097", { disableWarnings: true });
    identities[alias] = { uid: "", user: (await signInWithCredential(clientAuth(client), oidc(alias))).user, app: client };
    identities[alias].uid = identities[alias].user.uid;
  }
});
beforeEach(async () => {
  await env.clearFirestore();
  for (const alias of aliases) {
    await getAuth(app).updateUser(uid(alias), { disabled: false });
    identities[alias].user = (await signInWithCredential(clientAuth(identities[alias].app), oidc(alias))).user;
    await db.doc(`users/${uid(alias)}`).set({ role: ["pupil", "peer"].includes(alias) ? "student" : "teacher", plan: "plus", disabled: false,
      ...(["schooladmin", "dual"].includes(alias) ? { schoolId: "schoolA", schoolRole: "school_admin", schoolStatus: "active" } : {}) });
  }
  await db.doc("spaces/room").set({ ownerId: uid("owner"), schoolId: "schoolA", title: "Synthetic room" });
  await db.doc("spaces/foreign").set({ ownerId: uid("foreign"), schoolId: "schoolB", title: "Synthetic other school" });
  await db.doc("spaces/room/writingActivities/writing").set({ title: "Synthetic writing" });
  await db.doc("spaces/room/lessons/task").set({ title: "Synthetic lesson", sourceText: "Synthetic source", tasks: [{ id: "q", type: "open", prompt: "Synthetic question" }] });
  await db.doc(`spaces/room/lessons/task/submissions/room_task_${uid("pupil")}`).set({ uid:uid("pupil"), participantId:uid("pupil"), spaceId:"room", assignmentId:"task", status:"draft", answers:{q:"Synthetic only"} });
  for (const alias of ["pupil", "peer", "co"] as const) await db.doc(member(alias)).set({ uid: uid(alias), participantId: uid(alias), spaceId: "room", role: alias === "co" ? "co_teacher" : "student", status: "active", active: true, archived: false });
  await db.doc(member("schooladmin")).set({ uid: uid("schooladmin"), spaceId: "room", role: "school_admin", active: true });
  await db.doc(submissionPath()).set({ uid: uid("pupil"), studentUid: uid("pupil"), participantId: uid("pupil"), spaceId: "room", activityId: "writing", status: "draft", text: "Synthetic only", printProfile: { imageUrl: "" } });
  providerCalls = 0;
  mock.method(OpenAI.Responses.prototype, "create", async () => { providerCalls++; return { output_text: "Synthetic feedback" }; });
});
afterEach(() => mock.restoreAll());
after(async () => {
  await writeFile(path.join(process.env.PHASE2_RESULT_DIR!, "f203-results.json"), JSON.stringify({ project, syntheticOnly: true, observations }, null, 2), { flag: "wx" });
  await env?.cleanup(); for (const identity of Object.values(identities)) await deleteClientApp(identity.app); if (app) await deleteApp(app);
});

async function allowed(operation: Promise<unknown>) {
  try { await operation; return true; }
  catch (error) {
    const underlying = error instanceof Error && error.cause ? error.cause : error;
    if (["permission-denied", "storage/unauthorized"].includes(String((underlying as { code?: unknown }).code))) return false;
    throw error;
  }
}
const lessonPath = () => `spaces/room/lessons/task/submissions/room_task_${uid("pupil")}`;
async function saveLesson() {
  const { POST } = await import("../../../app/api/student/spaces/[spaceId]/lessons/[assignmentId]/submission/route");
  return POST(await request("pupil", "POST", { submissionId: `room_task_${uid("pupil")}`, payload: { uid: uid("pupil"), participantId: uid("pupil"), spaceId: "room", assignmentId: "task", status: "draft", answers: { q: "Synthetic revised" } } }), { params: Promise.resolve({ spaceId: "room", assignmentId: "task" }) });
}

const cases: { name: string; fields: Record<string, unknown>; expected: boolean }[] = [
  { name: "active", fields: { status: "active", active: true, archived: false }, expected: true },
  { name: "mixed case and surrounding spaces", fields: { status: " ACTIVE ", active: true, archived: false }, expected: true },
  { name: "ASCII tabs and newlines", fields: { status: "\tAcTiVe\r\n" }, expected: true },
  { name: "explicit active without optional flags", fields: { status: "active" }, expected: true },
  ...["removed", " removed ", "REMOVED", "disabled", " inactive ", "revoked", "linked", "archived", "pending", "pending_approval", "cancelled", "rejected", "unknown", "", "   "].map(status => ({ name: `status ${JSON.stringify(status)}`, fields: { status, active: true, archived: false }, expected: false })),
  ...[null, 17, true, [], {}].map(status => ({ name: `invalid type ${JSON.stringify(status)}`, fields: { status, active: true, archived: false }, expected: false })),
  { name: "missing status with true/false flags", fields: { active: true, archived: false }, expected: false },
  { name: "active status with active false", fields: { status: "active", active: false, archived: false }, expected: false },
  { name: "active status with archived true", fields: { status: "active", active: true, archived: true }, expected: false },
  ...[null, "true", 1].map(active => ({ name: `invalid active ${JSON.stringify(active)}`, fields: { status: "active", active, archived: false }, expected: false })),
  ...[null, "false", 0].map(archived => ({ name: `invalid archived ${JSON.stringify(archived)}`, fields: { status: "active", active: true, archived }, expected: false })),
];
for (const row of cases) test(`F203 pupil matrix: ${row.name}`, async () => {
  const individual = await legacy(), board = await legacy("board-images"), saved = await privateImage();
  const data = { uid: uid("pupil"), participantId: uid("pupil"), spaceId: "room", role: "student", ...row.fields };
  await db.doc(member("pupil")).set(data);
  const client = env.authenticatedContext(uid("pupil")).firestore();
  const privateRead = await file.GET(await request("pupil"), ctx(saved.id));
  if (privateRead.status === 200) assert.deepEqual(Buffer.from(await privateRead.arrayBuffer()), png); else assert.equal(privateRead.status, 403);
  const savedLesson = await saveLesson(); assert.ok([200, 403].includes(savedLesson.status));
  const actual = {
    shared: isActiveSpaceMember(data), joinPolicy: isActivePupil(data),
    serverScope: (await getSpaceAccess(db, "room", uid("pupil"))).canRead,
    serverMembership: (await getActiveSpaceMembership(db, "room", uid("pupil"))).ok,
    firestoreSpace: await allowed(getDoc(doc(client, "spaces/room"))),
    firestoreWriting: await allowed(getDoc(doc(client, submissionPath()))),
    firestoreWrite: await allowed(updateDoc(doc(client, lessonPath()), { answers: { q: "Synthetic direct SDK edit" } })),
    storageIndividual: await allowed(sdkRead("pupil", individual)), storageBoard: await allowed(sdkRead("pupil", board)),
    privateAPI: privateRead.status === 200, saveAPI: savedLesson.status === 200,
  };
  observations.push({ check: row.name, details: { expected: row.expected, actual } });
  // S02 C intentionally closes direct SDK access for these legacy namespaces.
  // Active users retain the authenticated API path, tested independently above.
  for (const [layer, value] of Object.entries(actual)) assert.equal(value, layer.startsWith("storage") ? false : row.expected, `${row.name}: ${layer}`);
});

for (const teaching of [{ role: "teacher" }, { role: "co_teacher" }, { role: "teacher", staffRole: "substitute" }]) {
  for (const status of [" ACTIVE ", " removed ", "unknown"]) test(`F203 teaching: ${JSON.stringify(teaching)} ${JSON.stringify(status)}`, async () => {
    const object = await legacy(), saved = await privateImage();
    await db.doc(member("co")).set({ uid: uid("co"), spaceId: "room", active: true, archived: false, status, ...teaching });
    const expected = status === " ACTIVE ";
    const data = (await db.doc(member("co")).get()).data()!;
    assert.equal(isSpaceTeachingMember(data), expected);
    assert.equal((await getSpaceAccess(db, "room", uid("co"))).canTeach, expected);
    assert.equal(await allowed(getDoc(doc(env.authenticatedContext(uid("co")).firestore(), submissionPath()))), expected);
    assert.equal(await allowed(sdkRead("co", object)), false);
    await apiRead("co", saved.id, expected ? 200 : 403);
    const { POST } = await import("../../../app/api/teacher/ai-feedback/route");
    const response = await POST(await request("co", "POST", { spaceId: "room", assignmentId: "task", subId: `room_task_${uid("pupil")}` }));
    assert.equal(response.status, expected ? 200 : 403);
    assert.equal(providerCalls, expected ? 1 : 0);
  });
}

test("F203 canonical inactive status cannot be overridden by a stale active legacy row", async () => {
  await db.doc(member("pupil")).update({ status: "unknown" });
  await db.doc("spaceMembers/legacy-pupil").set({ uid: uid("pupil"), spaceId: "room", participantId: uid("pupil"), role: "student", status: "active" });
  assert.equal((await getActiveSpaceMembership(db, "room", uid("pupil"))).ok, false); assert.equal((await getSpaceAccess(db, "room", uid("pupil"))).canRead, false);
});
test("F203 noncanonical legacy membership never grants server access when canonical row is absent", async () => {
  await db.doc(member("pupil")).delete();
  await db.doc("spaceMembers/legacy-pupil").set({ uid: uid("pupil"), spaceId: "room", participantId: uid("pupil"), role: "student", status: "active" });
  assert.equal((await getActiveSpaceMembership(db, "room", uid("pupil"))).ok, false);
  assert.equal((await saveLesson()).status, 403);
});
test("F203 canonical explicit active status is authoritative over historical legacy rows", async () => {
  await db.doc("spaceMembers/legacy-pupil").set({ uid: uid("pupil"), spaceId: "room", status: "removed" });
  assert.equal((await getActiveSpaceMembership(db, "room", uid("pupil"))).ok, true);
  assert.equal((await getSpaceAccess(db, "room", uid("pupil"))).canRead, true);
});
test("F203 admission rejects an unknown personal-code record without rewriting it", async () => {
  await db.doc("spaces/room").update({ code: "SYNTHETIC" });
  await db.doc(member("pupil")).update({ status: "unknown", studentCodeKey: "room:ABCDE", studentCode: "ABCDE", displayName: "Synthetic pupil" });
  const before = (await db.doc(member("pupil")).get()).data();
  const { POST } = await import("../../../app/api/spaces/join/route");
  const response = await POST(new NextRequest(await request("peer", "POST", { code: "SYNTHETIC", studentCode: "ABCDE", confirm: true })));
  assert.equal(response.status, 403); assert.deepEqual((await db.doc(member("pupil")).get()).data(), before);
});
test("F203 removed caller cannot use another active pupil's code to reactivate itself", async () => {
  await db.doc("spaces/room").update({ code: "SYNTHETIC" });
  await db.doc(member("pupil")).update({ status: " removed " });
  await db.doc(member("peer")).update({ studentCodeKey: "room:ABCDE", studentCode: "ABCDE", displayName: "Synthetic peer" });
  const before = (await db.doc(member("pupil")).get()).data();
  const { POST } = await import("../../../app/api/spaces/join/route");
  assert.equal((await POST(new NextRequest(await request("pupil", "POST", { code: "SYNTHETIC", studentCode: "ABCDE", confirm: true })))).status, 403);
  assert.deepEqual((await db.doc(member("pupil")).get()).data(), before);
});
test("F203 invalid source pupil cannot be linked into a new room by roster's legacy status filter", async () => {
  await db.doc("spaces/second").set({ ownerId: uid("owner"), title: "Synthetic second room" });
  await db.doc(member("pupil")).update({ status: "unknown", displayName: "Synthetic source", teacherStudentId: "synthetic-teacher-pupil" });
  const { POST } = await import("../../../app/api/teacher/spaces/[spaceId]/members/create-student/route");
  const response = await POST(await request("owner", "POST", { sourceMemberId: `room_${uid("pupil")}` }), { params: Promise.resolve({ spaceId: "second" }) });
  assert.equal(response.status, 403);
  assert.equal((await db.collection("spaceMembers").where("spaceId", "==", "second").get()).size, 0);
});
test("F203 deliberate owner reactivation restores access; active membership cannot undo global disable", async () => {
  const object = await legacy(), saved = await privateImage();
  await db.doc(member("pupil")).update({ status: " removed ", active: true, archived: false });
  assert.equal(await allowed(sdkRead("pupil", object)), false); await apiRead("pupil", saved.id, 403);
  await updateDoc(doc(env.authenticatedContext(uid("owner")).firestore(), member("pupil")), { status: "active", active: true, archived: false });
  assert.equal(await allowed(sdkRead("pupil", object)), false); await apiRead("pupil", saved.id, 200);
  await db.doc(`users/${uid("pupil")}`).update({ disabled: true });
  assert.equal(await allowed(sdkRead("pupil", object)), false); await apiRead("pupil", saved.id, 403);
});
test("F203 Space membership rejection does not globally disable the account or change its school licence", async () => {
  const before = (await db.doc(`users/${uid("pupil")}`).get()).data();
  await db.doc(member("pupil")).update({ status: "removed" });
  assert.equal((await getActiveSpaceMembership(db, "room", uid("pupil"))).ok, false);
  assert.equal((await getAuth(app).verifyIdToken(await identities.pupil.user.getIdToken(), true)).uid, uid("pupil"));
  assert.deepEqual((await db.doc(`users/${uid("pupil")}`).get()).data(), before);
});
test("F203 school licence removal retains ownership, but an explicit owner tombstone revokes it", async () => {
  await db.doc(`users/${uid("owner")}`).update({ schoolStatus: "disabled" });
  assert.equal((await getSpaceAccess(db, "room", uid("owner"))).canTeach, true);
  await db.doc(member("owner")).set({ uid: uid("owner"), spaceId: "room", role: "teacher", status: "removed", active: false, archived: true });
  const access = await getSpaceAccess(db, "room", uid("owner")); assert.equal(access.active, false); assert.equal(access.canTeach, false);
  assert.equal(await allowed(sdkRead("owner", await legacy())), false);
});
test("F203 school administration alone is never a Space teaching or individual-content grant", async () => {
  await db.doc(member("schooladmin")).update({ status: "active", archived: false, active: true });
  assert.equal((await getSpaceAccess(db, "room", uid("schooladmin"))).canRead, false);
  assert.equal(await allowed(sdkRead("schooladmin", await legacy())), false);
});
test("F203 pure join policy rejects missing/unknown/linked status and accepts explicit normalized active", () => {
  const pupil = { role: "student", participantId: "synthetic-pupil", displayName: "Synthetic pupil" };
  for (const fields of [{}, { status: "unknown" }, { status: "linked" }, { status: "active", active: "true" }]) assert.deepEqual(evaluatePupilJoin(null, [{ ...pupil, ...fields }]), { error: "invalid_student_code" });
  assert.ok(!("error" in evaluatePupilJoin(null, [{ ...pupil, status: " ACTIVE " }])));
});
test("F203 client membership discovery agrees with canonical server policy without legacy repair", async () => {
  // Rules testing supplies a compat instance; modular SDK helpers unwrap it at runtime.
  const client = env.authenticatedContext(uid("pupil")).firestore() as unknown as Parameters<typeof getStudentSpaceMembership>[0];
  assert.equal((await getStudentSpaceMembership(client, "room", uid("pupil"))).isMember, true);
  assert.deepEqual(await listMySpaceIds(client, uid("pupil")), ["room"]);
  await db.doc(member("pupil")).update({ status: "unknown" });
  assert.equal((await getStudentSpaceMembership(client, "room", uid("pupil"))).isMember, false);
  assert.deepEqual(await listMySpaceIds(client, uid("pupil")), []);
  await db.doc(member("pupil")).delete();
  await db.doc("spaceMembers/legacy-pupil").set({ uid: uid("pupil"), spaceId: "room", role: "student", status: "active" });
  assert.equal((await getStudentSpaceMembership(client, "room", uid("pupil"))).isMember, false);
  assert.deepEqual(await listMySpaceIds(client, uid("pupil")), []);
  assert.equal((await db.doc(member("pupil")).get()).exists, false);
});
test("F203 pupil cannot repair its own revoked membership flags", async () => {
  await db.doc(member("pupil")).update({ status: " removed ", active: true, archived: false });
  const client = env.authenticatedContext(uid("pupil")).firestore();
  assert.equal(await allowed(updateDoc(doc(client, member("pupil")), { status: "active", active: true, archived: false })), false);
  assert.equal((await db.doc(member("pupil")).get()).get("status"), " removed ");
});
test("F203 content feed preserves valid room when another membership is invalid", async () => {
  await db.doc("spaces/bad-room").set({ ownerId: uid("owner"), title: "Synthetic inaccessible room" });
  await db.doc(`spaceMembers/bad-room_${uid("pupil")}`).set({ uid: uid("pupil"), spaceId: "bad-room", role: "student", status: " removed ", active: true, archived: false });
  const { loadMyContent } = await import("../../contentFeed");
  const actualFetch = globalThis.fetch;
  mock.method(globalThis, "fetch", (input: RequestInfo | URL, init?: RequestInit) => typeof input === "string" && input.startsWith("/api/student/submissions")
    ? Promise.resolve(Response.json({ documents: [] })) : actualFetch(input, init));
  const client = env.authenticatedContext(uid("pupil")).firestore() as unknown as Parameters<typeof loadMyContent>[0]["db"];
  const feed = await loadMyContent({ db: client, uid: uid("pupil"), mode: "student", locale: "no" });
  assert.deepEqual(feed.items.filter(item => item.type === "space").map(item => item.id), ["room"]);
});
