import assert from "node:assert/strict";
import { before, after, test, mock } from "node:test";
import { readFile } from "node:fs/promises";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp as clientApp, deleteApp as deleteClientApp, type FirebaseApp } from "firebase/app";
import { getAuth as clientAuth, connectAuthEmulator, signInAnonymously, signInWithCredential, linkWithCredential, OAuthProvider, type User } from "firebase/auth";
import { getFirestore as clientFirestore, connectFirestoreEmulator, doc, getDoc, updateDoc } from "firebase/firestore";
import { getStorage as clientStorage, connectStorageEmulator, ref, uploadBytes, getBytes, getDownloadURL } from "firebase/storage";
import { getStorage } from "firebase-admin/storage";
import { initializeTestEnvironment, type RulesTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import OpenAI from "openai";

// Both Storage suites use the CLI demo project: the Storage emulator resolves
// cross-service Firestore checks against that project. Run suites sequentially.
const projectId = "demo-security-round1";
let app: ReturnType<typeof initializeApp>;
let db: ReturnType<typeof getFirestore>;
let env: RulesTestEnvironment;
let owner: User, otherTeacher: User, guest: User;
let guestApp: FirebaseApp;
const apps: FirebaseApp[] = [];
let aiCalls = 0;
const bucket = `${projectId}.appspot.com`;
const filePath = () => `spaces/room/assignments/task/submissions/${guest.uid}/audio/synthetic.webm`;
function client(name: string) {
  const app = clientApp({ apiKey: "synthetic-api-key", projectId, authDomain: "demo-security.invalid", storageBucket: bucket }, name);
  connectAuthEmulator(clientAuth(app), "http://127.0.0.1:9098", { disableWarnings: true });
  connectFirestoreEmulator(clientFirestore(app), "127.0.0.1", 8188);
  connectStorageEmulator(clientStorage(app), "127.0.0.1", 9199);
  apps.push(app);
  return app;
}
function credential(subject: string) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({ iss: "https://synthetic-idp.invalid", aud: "synthetic-client", sub: subject, email: `${subject}@synthetic.invalid`, email_verified: true, name: "Synthetic account" })).toString("base64url");
  return new OAuthProvider("oidc.feide").credential({ idToken: `${header}.${claims}.` });
}
async function request(user: User | null, body: unknown) {
  return new Request("http://localhost/api/synthetic", { method: "POST", headers: { "Content-Type": "application/json", ...(user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {}) }, body: JSON.stringify(body) });
}
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8188");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9098");
  assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9199");
  assert.equal(process.env.OPENAI_API_KEY, "isolated-test-no-network");
  const cleared = await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${projectId}/accounts`, { method: "DELETE" });
  assert.equal(cleared.status, 200);
  process.env.FIREBASE_STORAGE_BUCKET = bucket;
  process.env.GOOGLE_CLOUD_PROJECT = projectId;
  app = initializeApp({ projectId, storageBucket: bucket });
  db = getFirestore(app);
  env = await initializeTestEnvironment({ projectId,
    firestore: { host: "127.0.0.1", port: 8188, rules: await readFile("firestore.rules", "utf8") },
    storage: { host: "127.0.0.1", port: 9199, rules: await readFile("storage.rules", "utf8") } });
  await env.clearFirestore();
  owner = (await signInWithCredential(clientAuth(client("owner")), credential("owner"))).user;
  otherTeacher = (await signInWithCredential(clientAuth(client("foreign-teacher")), credential("foreign-teacher"))).user;
  guestApp = client("guest");
  guest = (await signInAnonymously(clientAuth(guestApp))).user;
  await db.doc(`users/${owner.uid}`).set({ role: "teacher", plan: "plus", schoolId: "schoolA" });
  await db.doc(`users/${otherTeacher.uid}`).set({ role: "teacher", plan: "plus", schoolId: "schoolB" });
  await db.doc("spaces/room").set({ ownerId: owner.uid, schoolId: "schoolA", title: "Synthetic class", code: "ROOMAA", isOpen: false });
  await db.doc("spaces/room/lessons/task").set({ title: "Synthetic assignment", sourceText: "Synthetic source", tasks: [{ id: "q", type: "open", prompt: "Synthetic question" }] });
  mock.method(OpenAI.Responses.prototype, "create", async () => { aiCalls++; return { output_text: "Synthetic feedback" }; });
});
after(async () => { mock.restoreAll(); await env?.cleanup(); for (const app of apps) await deleteClientApp(app); if (app) await deleteApp(app); });

test("OIDC Feide provider goes through Auth emulator and actual Admin SDK token verification", async () => {
  const decoded = await getAuth(app).verifyIdToken(await owner.getIdToken(), true);
  assert.equal(decoded.uid, owner.uid);
  assert.equal(decoded.firebase.sign_in_provider, "oidc.feide");
  await assert.rejects(getAuth(app).verifyIdToken("invalid-token", true));
});
let pupilCode = "";
test("teacher-created pupil identity, anonymous guest join and real-rule reads work in a closed Space", async () => {
  const roster = await import("../../app/api/teacher/spaces/[spaceId]/members/create-student/route");
  const created = await roster.POST(await request(owner, { displayName: "Synthetic pupil" }), { params: Promise.resolve({ spaceId: "room" }) });
  assert.equal(created.status, 200, created.status === 200 ? "" : await created.text());
  const data = await created.json();
  pupilCode = data.member.studentCode;
  assert.ok(pupilCode);
  const { POST } = await import("../../app/api/spaces/join/route");
  const { NextRequest } = await import("next/server");
  const joined = await POST(new NextRequest(await request(guest, { code: "ROOMAA", studentCode: pupilCode, confirm: true })));
  assert.equal(joined.status, 200, await joined.text());
  await assertSucceeds(getDoc(doc(clientFirestore(guestApp), "spaces/room/lessons/task")));
  await assertFails(updateDoc(doc(clientFirestore(guestApp), `spaceMembers/room_${guest.uid}`), { role: "co_teacher" }));
});
test("anonymous-to-Feide linking preserves the UID and Space membership", async () => {
  const uid = guest.uid;
  guest = (await linkWithCredential(guest, credential("synthetic-pupil"))).user;
  assert.equal(guest.uid, uid);
  assert.equal(guest.isAnonymous, false);
  const decoded = await getAuth(app).verifyIdToken(await guest.getIdToken(true), true);
  assert.equal(decoded.uid, uid);
  await assertSucceeds(getDoc(doc(clientFirestore(guestApp), "spaces/room/lessons/task")));
});
test("submission, audio upload/playback and AI feedback work; another school's teacher is denied", async () => {
  const member = (await db.doc(`spaceMembers/room_${guest.uid}`).get()).data()!;
  const submissionId = `room_task_${member.participantId}`;
  const save = await import("../../app/api/student/spaces/[spaceId]/lessons/[assignmentId]/submission/route");
  const response = await save.POST(await request(guest, { submissionId, payload: { uid: guest.uid, participantId: member.participantId, spaceId: "room", assignmentId: "task", answers: { q: "Synthetic answer" } } }), { params: Promise.resolve({ spaceId: "room", assignmentId: "task" }) });
  assert.equal(response.status, 200, await response.text());
  // Seed a historical file; new browser SDK uploads to legacy paths are closed.
  await getStorage(app).bucket(bucket).file(filePath()).save(Buffer.from([1, 2]), { resumable: false, contentType: "audio/webm" });
  await assertFails(uploadBytes(ref(clientStorage(guestApp), filePath()), new Uint8Array([1, 2]), { contentType: "audio/webm" }));
  const audio = await import("../../app/api/teacher/audio-url/route");
  const playback = await audio.POST(await request(owner, { storagePath: filePath(), mode: "bytes" }));
  assert.equal(playback.status, 200, playback.status === 200 ? "" : await playback.text());
  assert.deepEqual(new Uint8Array(await playback.arrayBuffer()), new Uint8Array([1, 2]));
  assert.equal((await audio.POST(await request(otherTeacher, { storagePath: filePath(), mode: "bytes" }))).status, 403);
  const feedback = await import("../../app/api/teacher/ai-feedback/route");
  const body = { spaceId: "room", assignmentId: "task", subId: submissionId };
  const before = aiCalls;
  assert.equal((await feedback.POST(await request(otherTeacher, body))).status, 403);
  assert.equal(aiCalls, before);
  const allowed = await feedback.POST(await request(owner, body));
  assert.equal(allowed.status, 200, await allowed.text());
  assert.equal(aiCalls, before + 1);
});
let privateFileId = "";
test("real Firebase guest tokens upload and read private audio, including teacher access and foreign-school denial", async () => {
  const member = (await db.doc(`spaceMembers/room_${guest.uid}`).get()).data()!;
  const submissionId = `room_task_${member.participantId}`;
  const upload = await import("../../app/api/space-files/route");
  const files = await import("../../app/api/space-files/[id]/route");
  const sessionResponse = await upload.POST(await request(guest, { spaceId: "room", activityId: "task", submissionId, purpose: "audio_reading", contentType: "audio/webm", size: 2 }));
  assert.equal(sessionResponse.status, 200, sessionResponse.status === 200 ? "" : await sessionResponse.text());
  const session = await sessionResponse.json();
  privateFileId = session.id;
  assert.equal((await fetch(session.uploadUrl, { method: "PUT", headers: { "Content-Type": "audio/webm" }, body: new Uint8Array([7, 8]) })).status, 200);
  const ctx = { params: Promise.resolve({ id: privateFileId }) };
  const finished = await files.POST(await request(guest, {}), ctx);
  assert.equal(finished.status, 200);
  const saved = await finished.json();
  const submission = await import("../../app/api/student/spaces/[spaceId]/lessons/[assignmentId]/submission/route");
  const attached = await submission.POST(await request(guest, { submissionId, payload: { uid: guest.uid, participantId: member.participantId, spaceId: "room", assignmentId: "task", answers: { q: "Synthetic answer" }, audioReading: { storagePath: saved.storagePath } } }), { params: Promise.resolve({ spaceId: "room", assignmentId: "task" }) });
  assert.equal(attached.status, 200);
  for (const user of [guest, owner]) {
    const playback = await files.GET(await request(user, {}), ctx);
    assert.equal(playback.status, 200);
    assert.deepEqual([...new Uint8Array(await playback.arrayBuffer())], [7, 8]);
  }
  assert.equal((await files.GET(await request(otherTeacher, {}), ctx)).status, 403);
  await assertFails(getDownloadURL(ref(clientStorage(guestApp), saved.storagePath)));
});
let oldTokenUrl = "";
test("Firebase bearer URL survives membership revocation until its download token is removed", async () => {
  oldTokenUrl = await getDownloadURL(ref(clientStorage(guestApp), filePath()));
  assert.equal((await fetch(oldTokenUrl)).status, 200);
  await db.doc(`spaceMembers/room_${guest.uid}`).update({ active: false, archived: true, status: "removed" });
  const files = await import("../../app/api/space-files/[id]/route");
  assert.equal((await files.GET(await request(guest, {}), { params: Promise.resolve({ id: privateFileId }) })).status, 403);
  await assertFails(getBytes(ref(clientStorage(guestApp), filePath())));
  await assertFails(getDoc(doc(clientFirestore(guestApp), "spaces/room/lessons/task")));
  const audio = await import("../../app/api/teacher/audio-url/route");
  assert.equal((await audio.POST(await request(guest, { storagePath: filePath(), mode: "bytes" }))).status, 403);
  assert.equal((await fetch(oldTokenUrl)).status, 200, "Rules cannot revoke a bearer download token");
  // Emulator 14.20 accumulates downloadTokens separately and does not emulate
  // GCS setMetadata(null) revocation. Exercise its explicit token-delete API;
  // production metadata revocation still requires a real isolated-project gate.
  const token = new URL(oldTokenUrl).searchParams.get("token")!;
  const revoke = await fetch(`http://127.0.0.1:9199/v0/b/${bucket}/o/${encodeURIComponent(filePath())}?delete_token=${encodeURIComponent(token)}`, {
    method: "POST", headers: { Authorization: "Bearer owner" },
  });
  assert.equal(revoke.status, 200);
  assert.notEqual((await fetch(oldTokenUrl)).status, 200);
});
test("removed guest cannot self-enrol again; authorized reactivation restores access without changing identity", async () => {
  const { POST } = await import("../../app/api/spaces/join/route");
  const { NextRequest } = await import("next/server");
  const body = { code: "ROOMAA", studentCode: pupilCode, confirm: true };
  assert.equal((await POST(new NextRequest(await request(guest, body)))).status, 403);
  const memberRef = db.doc(`spaceMembers/room_${guest.uid}`);
  const participantId = (await memberRef.get()).get("participantId");
  const ownerApp = apps.find(app => app.name === "owner")!;
  await assertSucceeds(updateDoc(doc(clientFirestore(ownerApp), memberRef.path), { active: true, archived: false, status: "active" }));
  assert.equal((await POST(new NextRequest(await request(guest, body)))).status, 200);
  assert.equal((await memberRef.get()).get("participantId"), participantId);
  await assertSucceeds(getDoc(doc(clientFirestore(guestApp), "spaces/room/lessons/task")));
  assert.notEqual((await fetch(oldTokenUrl)).status, 200, "Reactivation must not resurrect the old URL");
});
test("privileged authority fields remain blocked with a real OIDC Firebase ID token", async () => {
  for (const patch of [{ role: "admin" }, { schoolRole: "school_admin" }, { plan: "pro" }, { roles: { admin: true } }]) {
    await assertFails(updateDoc(doc(clientFirestore(guestApp), `users/${guest.uid}`), patch));
  }
  await assertSucceeds(updateDoc(doc(clientFirestore(guestApp), `users/${guest.uid}`), { displayName: "Synthetic safe change" }));
});
test("a server-written private namespace cannot issue Firebase SDK download URLs", async () => {
  const path = `private-space-files/room/${guest.uid}/synthetic.webm`;
  await getStorage(app).bucket(bucket).file(path).save(Buffer.from([3, 4]), { contentType: "audio/webm", resumable: false, metadata: { cacheControl: "private,no-store" } });
  await assertFails(getDownloadURL(ref(clientStorage(guestApp), path)));
  await assertFails(getBytes(ref(clientStorage(guestApp), path)));
  const [bytes] = await getStorage(app).bucket(bucket).file(path).download();
  assert.deepEqual([...bytes], [3, 4]);
});

test("Firebase Auth account deactivation denies an already-issued teacher token before AI processing", async () => {
  const feedback = await import("../../app/api/teacher/ai-feedback/route");
  const token = await owner.getIdToken();
  const member = (await db.doc(`spaceMembers/room_${guest.uid}`).get()).data()!;
  const body = { spaceId: "room", assignmentId: "task", subId: `room_task_${member.participantId}` };
  const before = aiCalls;
  await getAuth(app).updateUser(owner.uid, { disabled: true });
  try {
    await assert.rejects(getAuth(app).verifyIdToken(token, true), { code: "auth/user-disabled" });
    const response = await feedback.POST(new Request("http://localhost/api/synthetic", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
    assert.equal(response.status, 401);
    assert.equal(aiCalls, before);
  } finally { await getAuth(app).updateUser(owner.uid, { disabled: false }); }
});
