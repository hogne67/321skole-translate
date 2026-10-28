import assert from "node:assert/strict";
import { before, after, afterEach, test, mock } from "node:test";
import { createHash } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { beginSpaceFileUpload, finishSpaceFileUpload } from "../../spaceFiles.server";
import { GET as privateReader } from "../../../app/api/space-files/[id]/route";
import { POST as legacyReader } from "../../../app/api/teacher/audio-url/route";
const project = "demo-phase2-local", app = initializeApp({ projectId: project }), db = getFirestore(app);
const bytes = Buffer.from(Uint8Array.from({ length: 1024 * 1024 + 111 }, (_, i) => i % 251));
const md5 = (b: Buffer) => createHash("md5").update(b).digest("hex");
const legacyPath = "spaces/room/assignments/task/submissions/pupil/audio/legacy.wav";
let firebase: typeof import("../../firebase"), audio: typeof import("../../audio/studentAudio"), privatePath = "";
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8287");
  assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9297");
  process.env.FIREBASE_STORAGE_BUCKET = `${project}.appspot.com`;
  firebase = await import("../../firebase"); await firebase.auth.authStateReady(); audio = await import("../../audio/studentAudio");
  for (const [uid, role] of Object.entries({ pupil: "student", peer: "student", teacher: "teacher", foreign: "teacher", schooladmin: "school_admin" })) await db.doc(`users/${uid}`).set({ role });
  await db.doc("spaces/room").set({ ownerId: "teacher", schoolId: "one" });
  await db.doc("spaces/room/lessons/task").set({ title: "Synthetic" });
  for (const uid of ["pupil", "peer", "teacher"]) await db.doc(`spaceMembers/room_${uid}`).set({ uid, spaceId: "room", participantId: uid, role: uid === "teacher" ? "teacher" : "student", status: "active" });
  const scope = { spaceId: "room", activityId: "task", submissionId: "room_task_pupil", segmentId: "one", purpose: "podcast" as const };
  const session = await beginSpaceFileUpload("pupil", scope, "audio/wav", bytes.length);
  assert.equal((await fetch(session.uploadUrl, { method: "PUT", body: bytes, headers: { "Content-Type": "audio/wav" } })).status, 200);
  privatePath = (await finishSpaceFileUpload("pupil", session.id)).storagePath;
  await db.doc("spaces/room/lessons/task/submissions/room_task_pupil").set({ uid: "pupil", participantId: "pupil", spaceId: "room", assignmentId: "task", podcastWorkshop: { productionSegments: { one: { voice: { storagePath: privatePath } } } } });
  await getStorage(app).bucket(`${project}.appspot.com`).file(legacyPath).save(bytes, { contentType: "audio/wav" });
});
afterEach(() => mock.restoreAll());
after(async () => { await (await import("firebase/app")).deleteApp(firebase.appMaybe!); await deleteApp(app); });
function actor(uid: string | null) {
  Object.defineProperty(firebase.auth, "currentUser", { configurable: true, writable: true, value: uid ? { uid, getIdToken: async () => uid } : null });
  // Synthetic identity verification only. Server profile/resource checks and real Storage/Firestore run unchanged.
  mock.method(getAuth(app), "verifyIdToken", async (token: string) => ({ uid: token, auth_time: 2000 }) as never);
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    const req = new Request(`http://127.0.0.1${url}`, init);
    if (url.startsWith("/api/space-files/")) return privateReader(req, { params: Promise.resolve({ id: url.split("/").at(-1)! }) });
    assert.equal(url, "/api/teacher/audio-url"); return legacyReader(req);
  });
}
const asset = (path: string) => ({ version: 1 as const, activityType: "podcast", storagePath: path, durationSeconds: 1, recordedAt: 1, mimeType: "audio/wav" });
for (const uid of ["pupil", "teacher"]) for (const kind of ["private", "legacy"]) test(`${uid} gets complete ${kind} podcast through client + actual API + emulator`, async () => {
  actor(uid); const blob = await audio.readStudentAudioBlob(asset(kind === "private" ? privatePath : legacyPath));
  assert.equal(md5(Buffer.from(await blob.arrayBuffer())), md5(bytes));
});
for (const uid of ["peer", "foreign", "schooladmin"]) test(`${uid} cannot download individual private or legacy podcast`, async () => {
  actor(uid); for (const path of [privatePath, legacyPath]) await assert.rejects(audio.readStudentAudioBlob(asset(path)), /No access/);
});
test("logged-out reader cannot start transport", async () => { actor(null); await assert.rejects(audio.readStudentAudioBlob(asset(privatePath)), /Sign in/); });
test("removed pupil loses both podcast readers while bytes are preserved", async () => {
  actor("pupil"); await db.doc("spaceMembers/room_pupil").update({ status: "removed" });
  try { for (const path of [privatePath, legacyPath]) await assert.rejects(audio.readStudentAudioBlob(asset(path)), /No access/); }
  finally { await db.doc("spaceMembers/room_pupil").update({ status: "active" }); }
  assert.equal((await getStorage(app).bucket(`${project}.appspot.com`).file(legacyPath).exists())[0], true);
});
test("detached private segment fails instead of returning a previous preview", async () => {
  actor("teacher"); await db.doc("spaces/room/lessons/task/submissions/room_task_pupil").update({ podcastWorkshop: {} });
  await assert.rejects(audio.readStudentAudioBlob(asset(privatePath)), /No access/);
});
