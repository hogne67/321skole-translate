import assert from "node:assert/strict";
import { before, after, test, mock } from "node:test";
import { readFile } from "node:fs/promises";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { getBytes, getDownloadURL, ref } from "firebase/storage";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { beginSpaceFileUpload, finishSpaceFileUpload, readSpaceFile, deleteSpaceFile, saveGeneratedSpaceImage, SpaceFileError } from "../spaceFiles.server";
import { inventoryLegacyFileReferences, legacyAudioBinding } from "./legacyFileReferences";
import { fileRange, SPACE_FILE_CHUNK_BYTES, privateSpaceFileId } from "../spaceFiles";
import { NextRequest } from "next/server";
import { POST as uploadRoute } from "../../app/api/space-files/route";
import { GET as readRoute, POST as finishRoute, DELETE as deleteRoute } from "../../app/api/space-files/[id]/route";

const project = "demo-security-round1";
const app = initializeApp({ projectId: project });
const db = getFirestore(app);
let env: RulesTestEnvironment;
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8188");
  assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9199");
  process.env.FIREBASE_STORAGE_BUCKET = `${project}.appspot.com`;
  env = await initializeTestEnvironment({ projectId: project,
    firestore: { host: "127.0.0.1", port: 8188, rules: await readFile("firestore.rules", "utf8") },
    storage: { host: "127.0.0.1", port: 9199, rules: await readFile("storage.rules", "utf8") } });
  await env.clearFirestore();
  for (const [uid, profile] of Object.entries({ pupil: { role: "student" }, otherPupil: { role: "student" }, teacher: { role: "teacher" },
    foreign: { role: "teacher", plan: "plus" }, schooladmin: { role: "teacher", schoolId: "A", schoolRole: "school_admin", schoolStatus: "active" } })) await db.doc(`users/${uid}`).set(profile);
  await db.doc("spaces/room").set({ ownerId: "teacher", schoolId: "A" });
  await db.doc("spaces/room/lessons/task").set({ title: "Synthetic" });
  await db.doc("spaces/room/writingActivities/writing").set({ title: "Synthetic" });
  for (const uid of ["pupil", "otherPupil"]) await db.doc(`spaceMembers/room_${uid}`).set({ spaceId: "room", uid, participantId: uid, role: "student", status: "active" });
  mock.method(getAuth(app), "verifyIdToken", async (token: string) => { if (token === "invalid") throw new Error("invalid"); return { uid: token }; });
});
after(async () => { mock.restoreAll(); await env.cleanup(); await deleteApp(app); });
const ownScope = { spaceId: "room", activityId: "task", submissionId: "room_task_pupil", purpose: "audio_reading" as const };
let audioId = "", audioPath = "";
function denied(status: number) { return (error: unknown) => error instanceof SpaceFileError && error.status === status; }

test("private resumable upload and server-side copy produce a token-free, scope-bound recording", async () => {
  const session = await beginSpaceFileUpload("pupil", ownScope, "audio/webm", 3);
  assert.match(session.uploadUrl, /^http:\/\/127\.0\.0\.1:9199\//);
  assert.equal((await fetch(session.uploadUrl, { method: "PUT", body: new Uint8Array([1, 2, 3]), headers: { "Content-Type": "audio/webm" } })).status, 200);
  const completed = await finishSpaceFileUpload("pupil", session.id);
  audioId = session.id; audioPath = completed.storagePath;
  assert.equal(privateSpaceFileId(audioPath), audioId);
  assert.equal((await db.doc(`privateSpaceFiles/${audioId}`).get()).get("status"), "ready");
  assert.deepEqual(await finishSpaceFileUpload("pupil", audioId), completed);
  await db.doc("spaces/room/lessons/task/submissions/room_task_pupil").set({ uid: "pupil", participantId: "pupil", spaceId: "room", assignmentId: "task", audioReading: { storagePath: audioPath } });
  assert.deepEqual([...new Uint8Array(await (await readSpaceFile("teacher", audioId, null)).arrayBuffer())], [1, 2, 3]);
});

test("private file SDK reads, token creation and direct metadata access are denied", async () => {
  const client = env.authenticatedContext("pupil");
  await assertFails(getBytes(ref(client.storage(`gs://${project}.appspot.com`), audioPath)));
  await assertFails(getDownloadURL(ref(client.storage(`gs://${project}.appspot.com`), audioPath)));
  await assertFails(getDoc(doc(client.firestore(), `privateSpaceFiles/${audioId}`)));
  await assertFails(updateDoc(doc(client.firestore(), `privateSpaceFiles/${audioId}`), { ownerUid: "otherPupil" }));
});

test("other pupils, unrelated paid teachers and school administrators cannot read or finalize pupil files", async () => {
  for (const uid of ["otherPupil", "foreign", "schooladmin"]) {
    await assert.rejects(readSpaceFile(uid, audioId, null), denied(403));
    await assert.rejects(finishSpaceFileUpload(uid, audioId), denied(403));
    await assert.rejects(beginSpaceFileUpload(uid, ownScope, "audio/webm", 3), denied(403));
  }
});

test("revoked membership denies reads and finalization; owner-authorized restoration preserves ordinary access", async () => {
  await db.doc("spaceMembers/room_pupil").update({ status: "removed" });
  await assert.rejects(readSpaceFile("pupil", audioId, null), denied(403));
  await assert.rejects(finishSpaceFileUpload("pupil", audioId), denied(403));
  await db.doc("spaceMembers/room_pupil").update({ status: "active" });
  assert.equal((await readSpaceFile("pupil", audioId, null)).status, 200);
});

test("teacher access requires the concrete attachment; deleted references cannot leave a teacher download path", async () => {
  await db.doc("spaces/room/lessons/task/submissions/room_task_pupil").update({ audioReading: {} });
  await assert.rejects(readSpaceFile("teacher", audioId, null), denied(403));
  await db.doc("spaces/room/lessons/task/submissions/room_task_pupil").update({ audioReading: { storagePath: audioPath } });
});

test("range reads stay below function payload limits and validate range bounds", async () => {
  assert.deepEqual(fileRange(null, SPACE_FILE_CHUNK_BYTES + 1), { start: 0, end: SPACE_FILE_CHUNK_BYTES - 1, partial: true });
  assert.throws(() => fileRange("bytes=0-1,3-4", 5));
  const response = await readSpaceFile("teacher", audioId, "bytes=1-2");
  assert.equal(response.status, 206); assert.equal(response.headers.get("content-range"), "bytes 1-2/3");
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [2, 3]);
  assert.equal((await readSpaceFile("teacher", audioId, "bytes=4-9")).status, 416);
});

test("generated writing images and board images use private URLs with the correct pupil visibility", async () => {
  const writingScope = { spaceId: "room", activityId: "writing", submissionId: "room_writing_pupil", purpose: "writing_image" as const };
  const saved = await saveGeneratedSpaceImage("pupil", writingScope, Buffer.from([1, 2]));
  const id = privateSpaceFileId(saved.storagePath)!;
  await db.doc("spaces/room/writingActivities/writing/submissions/room_writing_pupil").set({ uid: "pupil", participantId: "pupil", printProfile: { imageUrl: saved.imageUrl } });
  assert.equal((await readSpaceFile("teacher", id, null)).status, 200);
  await assert.rejects(readSpaceFile("otherPupil", id, null), denied(403));
  const board = await saveGeneratedSpaceImage("teacher", { spaceId: "room", activityId: "state", purpose: "board_image" }, Buffer.from([3]));
  await db.doc("spaces/room/board/state").set({ data: { imageUrl: board.imageUrl } });
  assert.equal((await readSpaceFile("pupil", privateSpaceFileId(board.storagePath)!, null)).status, 200);
  await assert.rejects(saveGeneratedSpaceImage("pupil", { spaceId: "room", activityId: "state", purpose: "board_image" }, Buffer.from([3])), denied(403));
});

test("file HTTP routes reject absent and invalid authentication, forged scope and unsupported uploads", async () => {
  const ctx = { params: Promise.resolve({ id: audioId }) };
  for (const route of [readRoute, finishRoute, deleteRoute]) {
    assert.equal((await route(new Request("http://localhost/api/space-files/test"), ctx)).status, 401);
    assert.equal((await route(new Request("http://localhost/api/space-files/test", { headers: { Authorization: "Bearer invalid" } }), ctx)).status, 401);
    assert.equal((await route(new Request("http://localhost/api/space-files/test", { headers: { Authorization: "Bearer schooladmin" } }), ctx)).status, 403);
  }
  const request = (body: unknown, uid = "pupil") => new Request("http://localhost/api/space-files", { method: "POST", headers: { Authorization: `Bearer ${uid}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await uploadRoute(new Request("http://localhost/api/space-files", { method: "POST" }))).status, 401);
  for (const body of [{ ...ownScope, spaceId: "../foreign" }, { ...ownScope, contentType: "image/svg+xml", size: 5 }, { ...ownScope, contentType: "audio/webm", size: 26 * 1024 * 1024 }]) {
    assert.equal((await uploadRoute(request(body))).status, 400);
  }
  assert.equal((await uploadRoute(request({ ...ownScope, contentType: "audio/webm", size: 3 }, "foreign"))).status, 403);
  const allowed = await readRoute(new Request("http://localhost/api/space-files/test", { headers: { Authorization: "Bearer teacher" } }), ctx);
  assert.equal(allowed.status, 200);
  await allowed.arrayBuffer();
});

test("a recording larger than the Vercel body limit uses direct provider upload and bounded authenticated reads", async () => {
  const size = 5 * 1024 * 1024;
  const response = await uploadRoute(new Request("http://localhost/api/space-files", { method: "POST", headers: { Authorization: "Bearer pupil", "Content-Type": "application/json" }, body: JSON.stringify({ ...ownScope, contentType: "audio/webm", size }) }));
  assert.equal(response.status, 200);
  const session = await response.json();
  assert.equal((await fetch(session.uploadUrl, { method: "PUT", body: new Uint8Array(size), headers: { "Content-Type": "audio/webm" } })).status, 200);
  const ctx = { params: Promise.resolve({ id: session.id }) };
  assert.equal((await finishRoute(new Request("http://localhost", { headers: { Authorization: "Bearer pupil" } }), ctx)).status, 200);
  const read = await readRoute(new Request("http://localhost", { headers: { Authorization: "Bearer pupil" } }), ctx);
  assert.equal(read.status, 206);
  assert.equal((await read.arrayBuffer()).byteLength, SPACE_FILE_CHUNK_BYTES);
  await deleteSpaceFile("pupil", session.id);
});

test("revoked uploaders cannot finalize but may clean up only their own pending upload", async () => {
  const session = await beginSpaceFileUpload("pupil", ownScope, "audio/webm", 3);
  await db.doc("spaceMembers/room_pupil").update({ status: "removed" });
  await assert.rejects(finishSpaceFileUpload("pupil", session.id), denied(403));
  await assert.rejects(deleteSpaceFile("otherPupil", session.id), denied(403));
  await deleteSpaceFile("pupil", session.id);
  assert.equal((await db.doc(`privateSpaceFiles/${session.id}`).get()).get("status"), "deleted");
  await db.doc("spaceMembers/room_pupil").update({ status: "active" });
});

test("private image generation and PDF export reject school administrators before obtaining pupil media", async () => {
  const { POST: generate } = await import("../../app/api/images/generate/route");
  const image = await generate(new NextRequest("http://localhost/api/images/generate", { method: "POST", headers: { Authorization: "Bearer schooladmin", "Content-Type": "application/json" }, body: JSON.stringify({ context: "student_writing_print", spaceId: "room", activityId: "writing", submissionId: "room_writing_pupil" }) }));
  assert.equal(image.status, 403);
  assert.match((await image.json()).error, /Space access/);
  const { POST: pdf } = await import("../../app/api/pdf/board-image/route");
  const imageUrl = (await db.doc("spaces/room/writingActivities/writing/submissions/room_writing_pupil").get()).get("printProfile.imageUrl");
  for (const [token, status] of [[null, 401], ["invalid", 401], ["schooladmin", 403]] as const) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const result = await pdf(new Request("http://localhost/api/pdf/board-image", { method: "POST", headers, body: JSON.stringify({ data: { title: "Synthetic", prompt: "Synthetic", labels: {}, sentences: [], imageUrl } }) }));
    assert.equal(result.status, status);
  }
});

test("ordinary pupil image generation returns a private reference with a synthetic AI response", async () => {
  const { default: OpenAI } = await import("openai");
  const { default: sharp } = await import("sharp");
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).webp().toBuffer();
  const provider = mock.method(OpenAI.Images.prototype, "generate", async () => ({ data: [{ b64_json: bytes.toString("base64") }] }));
  const { POST } = await import("../../app/api/images/generate/route");
  try {
    const response = await POST(new NextRequest("http://localhost/api/images/generate", { method: "POST", headers: { Authorization: "Bearer pupil", "Content-Type": "application/json" }, body: JSON.stringify({ context: "student_writing_print", spaceId: "room", activityId: "writing", submissionId: "room_writing_pupil", lessonId: "writing-room-writing", promptMode: "custom", customPrompt: "Synthetic triangle" }) }));
    assert.equal(response.status, 200, response.status === 200 ? "" : await response.text());
    const result = await response.json();
    assert.match(result.imageUrl, /^\/api\/space-files\//);
    assert.match(result.storagePath, /^private-space-files\/room\//);
    assert.equal(provider.mock.callCount(), 1);
    await db.doc("spaces/room/writingActivities/writing/submissions/room_writing_pupil").update({ "printProfile.imageUrl": result.imageUrl });
    const image = await readSpaceFile("teacher", privateSpaceFileId(result.storagePath)!, null);
    assert.equal(image.status, 200);
    assert.ok((await image.arrayBuffer()).byteLength > 0);
  } finally { provider.mock.restore(); }
});

test("deletion denies further reads and cannot be performed by another pupil", async () => {
  await assert.rejects(deleteSpaceFile("otherPupil", audioId), denied(403));
  await deleteSpaceFile("teacher", audioId);
  await assert.rejects(readSpaceFile("pupil", audioId, null), denied(404));
});

test("podcast metadata inventory projects segment leaf references and excludes scripts and inline audio", async () => {
  const path = "spaces/room/assignments/task/submissions/pupil/audio/room_task_pupil-podcast-segment-1.webm";
  const binding = legacyAudioBinding(path)!;
  assert.equal(binding.segmentId, "segment-1");
  await db.doc("spaces/room/lessons/task/submissions/room_task_pupil").set({ podcastWorkshop: { script: "DO_NOT_READ_SCRIPT", productionSegments: {
    "segment-1": { scriptText: "DO_NOT_READ_SCRIPT", voice: { storagePath: path, audioDataUrl: "data:audio/webm;base64,DO_NOT_DOWNLOAD" } },
  } } });
  const result = await inventoryLegacyFileReferences(db, `${project}.appspot.com`, [{ path, protectedFile: true }]);
  assert.equal(result.summary.filesWithReferences, 1);
  assert.equal(result.mediaDownloaded, false);
  assert.equal(result.references[0].document, "spaces/room/lessons/task/submissions/room_task_pupil");
  assert.doesNotMatch(JSON.stringify(result), /DO_NOT_|data:audio|scriptText/);
  assert.equal(legacyAudioBinding("unknown/recording.webm"), null);
  const updateTime = (await db.doc(result.references[0].document).get()).updateTime!;
  assert.deepEqual(result.references[0].updateTime, { seconds: updateTime.seconds, nanoseconds: updateTime.nanoseconds }, "Projection keeps precise update-time preconditions");
});
