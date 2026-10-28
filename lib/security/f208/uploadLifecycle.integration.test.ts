/* eslint-disable @typescript-eslint/no-explicit-any -- local protocol doubles and deliberate malformed inputs */
import assert from "node:assert/strict";
import { before, beforeEach, after, afterEach, test, mock } from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { ref, getBytes } from "firebase/storage";
import { beginSpaceFileUpload, finishSpaceFileUpload, readSpaceFile, deleteSpaceFile, SpaceFileError } from "../../spaceFiles.server";
import { SPACE_FILE_UPLOAD_LIFETIME_MS, type SpaceFileScope } from "../../spaceFiles";
import { POST as beginRoute } from "../../../app/api/space-files/route";
import { POST as finishRoute, GET as readRoute, DELETE as deleteRoute } from "../../../app/api/space-files/[id]/route";

const project = "demo-phase2-local", bucketName = `${project}.appspot.com`;
const app = initializeApp({ projectId: project }), db = getFirestore(app);
const scope: SpaceFileScope = { spaceId: "room", activityId: "task", submissionId: "room_task_pupil", purpose: "audio_reading" };
const submission = "spaces/room/lessons/task/submissions/room_task_pupil";
const bytes = Buffer.from([1, 2, 3]);
const chunkBytes = 256 * 1024;
const resumableBytes = Buffer.alloc(chunkBytes + 2, 42);
const reproduction = process.env.F208_REPRODUCTION === "true";
let env: RulesTestEnvironment;
const observations: unknown[] = [];
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (uid = "pupil", method = "POST", body?: unknown) => new Request("http://localhost/synthetic", { method,
  headers: { Authorization: `Bearer ${uid}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const denied = (status: number) => (error: unknown) => error instanceof SpaceFileError && error.status === status;
const put = (url: string, body = bytes, extra: Record<string, string> = {}) => fetch(url, { method: "PUT", headers: { "Content-Type": "audio/wav", ...extra }, body });
async function start(s = scope, actor = "pupil", type = "audio/wav", size = bytes.length) {
  const session = await beginSpaceFileUpload(actor, s, type, size);
  assert.match(session.uploadUrl, /^http:\/\/127\.0\.0\.1:/);
  return { ...session, ref: db.doc(`privateSpaceFiles/${session.id}`) };
}
before(async () => {
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, project);
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8287");
  assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9297");
  assert.ok(process.env.PHASE2_RESULT_DIR?.includes("security-f208-local"));
  for (const key of Object.keys(process.env)) assert.ok(!/^(GOOGLE_APPLICATION_CREDENTIALS|FIREBASE_ADMIN_|FIREBASE_TOKEN$)/.test(key));
  env = await initializeTestEnvironment({ projectId: project,
    firestore: { host: "127.0.0.1", port: 8287, rules: await readFile("firestore.rules", "utf8") },
    storage: { host: "127.0.0.1", port: 9297, rules: await readFile("storage.rules", "utf8") } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await db.doc("users/pupil").set({ role: "student" }); await db.doc("users/teacher").set({ role: "teacher" });
  await db.doc("users/peer").set({ role: "student" }); await db.doc("users/schooladmin").set({ role: "teacher", schoolRole: "school_admin", schoolId: "schoolA", schoolStatus: "active" });
  await db.doc("spaces/room").set({ ownerId: "teacher" });
  await db.doc("spaces/room/lessons/task").set({ title: "Synthetic" });
  await db.doc("spaces/room/writingActivities/writing").set({ title: "Synthetic" });
  for (const uid of ["pupil", "peer"]) await db.doc(`spaceMembers/room_${uid}`).set({ uid, spaceId: "room", participantId: uid, role: "student", status: "active" });
  await db.doc(submission).set({ uid: "pupil", participantId: "pupil", spaceId: "room", assignmentId: "task" });
  await db.doc("spaces/room/writingActivities/writing/submissions/room_writing_pupil").set({ studentUid: "pupil", participantId: "pupil" });
  mock.method(getAuth(app), "verifyIdToken", async (token: string) => ({ uid: token, auth_time: 2000 }) as never);
});
afterEach(() => mock.restoreAll());
after(async () => {
  await writeFile(path.join(process.env.PHASE2_RESULT_DIR!, "lifecycle-results.json"), JSON.stringify({ project, reproduction, syntheticOnly: true, observations }, null, 2), { flag: "wx" });
  await env.cleanup(); await deleteApp(app);
});

test("app deadline does not expire an issued emulator URI: staging succeeds but publish/read fail", async () => {
  const session = await start();
  assert.ok(session.expiresAt > Date.now());
  await session.ref.update({ createdAt: Date.now() - SPACE_FILE_UPLOAD_LIFETIME_MS - 100 });
  assert.equal((await put(session.uploadUrl)).status, 200);
  await assert.rejects(finishSpaceFileUpload("pupil", session.id), denied(410));
  await assert.rejects(readSpaceFile("pupil", session.id, null), denied(404));
  const record = (await session.ref.get()).data()!;
  await assertFails(getBytes(ref(env.authenticatedContext("pupil").storage(`gs://${bucketName}`), record.uploadPath)));
  await assertFails(getBytes(ref(env.unauthenticatedContext().storage(`gs://${bucketName}`), record.uploadPath)));
  assert.equal(record.status, "pending");
  observations.push({ test: "expired-application-record", bytes: 200, publish: 410, read: 404, providerElapsedTimeMeasured: false });
});
for (const kind of ["member", "profile", "authDisabled", "tokenCutoff"] as const) test(`${kind} revocation does not cancel staging capability but API publication is denied`, async () => {
  const session = await start();
  if (kind === "member") await db.doc("spaceMembers/room_pupil").update({ status: "removed" });
  if (kind === "profile") await db.doc("users/pupil").update({ disabled: true });
  if (kind === "authDisabled") await db.doc("users/pupil").update({ authDisabled: true });
  if (kind === "tokenCutoff") await db.doc("users/pupil").update({ authRevokedBefore: 2001 });
  assert.equal((await put(session.uploadUrl)).status, 200);
  assert.equal((await finishRoute(req(), ctx(session.id))).status, kind === "tokenCutoff" ? 401 : 403);
  assert.equal((await beginRoute(req("pupil", "POST", { ...scope, contentType: "audio/wav", size: 3 }))).status, kind === "tokenCutoff" ? 401 : 403);
  assert.equal((await session.ref.get()).get("status"), "pending");
  assert.notEqual((await readRoute(req("pupil", "GET"), ctx(session.id))).status, 200);
});
test("explicit application cancellation blocks publication but cannot cancel a URI it does not store", async () => {
  const session = await start();
  assert.equal((await deleteRoute(req("pupil", "DELETE"), ctx(session.id))).status, 200);
  assert.equal((await session.ref.get()).get("status"), "deleted");
  assert.equal((await put(session.uploadUrl)).status, 200);
  assert.equal((await finishRoute(req(), ctx(session.id))).status, 404);
  observations.push({ test: "application-delete-before-provider-completion", bytesAfterDelete: 200, publish: 404, orphanStagingPossible: true });
});
test("peer and school administrator cannot cancel or publish another pupil's session", async () => {
  const session = await start();
  for (const uid of ["peer", "schooladmin"]) for (const route of [deleteRoute, finishRoute]) assert.equal((await route(req(uid), ctx(session.id))).status, 403);
  assert.equal((await session.ref.get()).get("status"), "pending");
});
for (const purpose of ["audio_reading", "writing_image", "podcast"] as const) test(`submission deleted after start cannot be published: ${purpose}`, async () => {
  const s: SpaceFileScope = purpose === "writing_image" ? { spaceId: "room", activityId: "writing", submissionId: "room_writing_pupil", purpose }
    : { ...scope, purpose, ...(purpose === "podcast" ? { segmentId: "segment-1" } : {}) };
  const p = purpose === "writing_image" ? "spaces/room/writingActivities/writing/submissions/room_writing_pupil" : submission;
  const session = await start(s, "pupil", purpose === "writing_image" ? "image/png" : "audio/wav");
  await db.doc(p).delete(); assert.equal((await put(session.uploadUrl)).status, 200);
  if (reproduction) {
    await finishSpaceFileUpload("pupil", session.id); assert.equal((await session.ref.get()).get("status"), "ready");
    observations.push({ test: "deleted-submission-fallback", purpose, readyAfterDeletion: true });
  } else {
    await assert.rejects(finishSpaceFileUpload("pupil", session.id), denied(410)); assert.equal((await session.ref.get()).get("status"), "pending");
  }
});
test("delete/recreate with same identity is a different submission generation", async () => {
  const session = await start(), old = (await db.doc(submission).get()).createTime!;
  await db.doc(submission).delete(); await db.doc(submission).set({ uid: "pupil", participantId: "pupil", spaceId: "room", assignmentId: "task" });
  assert.ok(!(await db.doc(submission).get()).createTime!.isEqual(old));
  assert.equal((await put(session.uploadUrl)).status, 200);
  if (reproduction) await finishSpaceFileUpload("pupil", session.id);
  else await assert.rejects(finishSpaceFileUpload("pupil", session.id), denied(410));
});

// Protocol fixture models Google's documented JSON resumable contract. It is
// deliberately distinct from the Firebase emulator's incomplete JSON protocol.
// Only completed synthetic bytes are saved into the real local Storage emulator.
async function protocol() {
  type Session = { path: string; size: number; type: string; bytes: Buffer; started: number; state: "active" | "cancelled" | "complete" };
  const sessions = new Map<string, Session>(), events: { method: string; status: number }[] = [];
  const server = createServer(async (request, response) => {
    const id = new URL(request.url!, "http://127.0.0.1").pathname.slice(1), session = sessions.get(id);
    let status = 400; let range: string | undefined;
    try {
      if (!session || Date.now() - session.started >= 7 * 24 * 60 * 60_000) status = 404;
      else if (session.state === "cancelled") status = 410;
      else if (request.method === "DELETE") { if (session.state === "active") { session.state = "cancelled"; status = 499; } }
      else if (request.method === "PUT") {
        const chunks: Buffer[] = []; for await (const c of request) chunks.push(Buffer.from(c)); const body = Buffer.concat(chunks);
        const header = request.headers["content-range"];
        if (session.state === "complete") status = 200;
        else if (header === `bytes */${session.size}`) { status = 308; if (session.bytes.length) range = `bytes=0-${session.bytes.length - 1}`; }
        else {
          const match = typeof header === "string" ? /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header) : null;
          const offset = match ? Number(match[1]) : 0, total = match ? Number(match[3]) : body.length;
          if (total !== session.size || offset > session.bytes.length || (match && Number(match[2]) - offset + 1 !== body.length)) status = 400;
          else {
            const skip = Math.max(0, session.bytes.length - offset);
            session.bytes = Buffer.concat([session.bytes, body.subarray(skip)]);
            if (session.bytes.length > session.size || (session.bytes.length < session.size && body.length % chunkBytes !== 0)) status = 400;
            else if (session.bytes.length === session.size) {
              await getStorage(app).bucket(bucketName).file(session.path).save(session.bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, contentType: session.type, metadata: { cacheControl: "private,no-store" } });
              session.state = "complete"; status = 200;
            } else { status = 308; range = `bytes=0-${session.bytes.length - 1}`; }
          }
        }
      }
    } catch { status = 500; }
    events.push({ method: request.method!, status });
    response.writeHead(status, range ? { Range: range } : {}); response.end();
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const file = getStorage(app).bucket(bucketName).file("synthetic");
  mock.method(Object.getPrototypeOf(file), "createResumableUpload", async function (this: any, options: any) {
    assert.equal(options.preconditionOpts.ifGenerationMatch, 0);
    const id = randomUUID(); sessions.set(id, { path: this.name, size: options.metadata.contentLength, type: options.metadata.contentType,
      bytes: Buffer.alloc(0), started: Date.now(), state: "active" });
    return [`http://127.0.0.1:${address.port}/${id}`];
  });
  return { sessions, events, close: () => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())) };
}
for (const purpose of ["audio_reading", "podcast", "writing_image", "board_image"] as const) test(`documented protocol fixture permits pause/status/resume, then real app finalize: ${purpose}`, async () => {
  const model = await protocol();
  try {
    const s: SpaceFileScope = purpose === "board_image" ? { spaceId: "room", activityId: "state", purpose }
      : purpose === "writing_image" ? { spaceId: "room", activityId: "writing", submissionId: "room_writing_pupil", purpose }
        : { ...scope, purpose, ...(purpose === "podcast" ? { segmentId: "segment-1" } : {}) };
    const actor = purpose === "board_image" ? "teacher" : "pupil";
    const session = await start(s, actor, purpose.endsWith("image") ? "image/png" : "audio/wav", resumableBytes.length);
    assert.equal((await put(session.uploadUrl, resumableBytes.subarray(0, chunkBytes), { "Content-Range": `bytes 0-${chunkBytes - 1}/${resumableBytes.length}` })).status, 308);
    await assert.rejects(finishSpaceFileUpload(actor, session.id));
    const status = await put(session.uploadUrl, Buffer.alloc(0), { "Content-Range": `bytes */${resumableBytes.length}` });
    assert.equal(status.status, 308); assert.equal(status.headers.get("range"), `bytes=0-${chunkBytes - 1}`);
    assert.equal((await put(session.uploadUrl, resumableBytes.subarray(chunkBytes), { "Content-Range": `bytes ${chunkBytes}-${resumableBytes.length - 1}/${resumableBytes.length}` })).status, 200);
    await finishSpaceFileUpload(actor, session.id);
    assert.deepEqual(Buffer.from(await (await readSpaceFile(actor, session.id, null)).arrayBuffer()), resumableBytes);
  } finally { await model.close(); }
});
test("documented cancellation fixture returns 499 and rejects status/resume; no ready file", async () => {
  const model = await protocol();
  try {
    const session = await start(scope, "pupil", "audio/wav", resumableBytes.length);
    assert.equal((await put(session.uploadUrl, resumableBytes.subarray(0, chunkBytes), { "Content-Range": `bytes 0-${chunkBytes - 1}/${resumableBytes.length}` })).status, 308);
    assert.equal((await fetch(session.uploadUrl, { method: "DELETE" })).status, 499);
    assert.equal((await put(session.uploadUrl, Buffer.alloc(0), { "Content-Range": `bytes */${resumableBytes.length}` })).status, 410);
    assert.equal((await put(session.uploadUrl)).status, 410);
    await assert.rejects(finishSpaceFileUpload("pupil", session.id));
    assert.equal((await session.ref.get()).get("status"), "pending");
  } finally { await model.close(); }
});
test("provider fixture's week-long expiry is separate from application expiry (model, not cloud measurement)", async () => {
  const model = await protocol();
  try {
    const session = await start();
    [...model.sessions.values()][0].started -= 8 * 24 * 60 * 60_000;
    assert.equal((await put(session.uploadUrl)).status, 404);
    assert.equal((await session.ref.get()).get("status"), "pending");
  } finally { await model.close(); }
});
test("real Firebase Auth deactivation blocks an existing session's API but issued staging URI can still receive bytes", async () => {
  mock.restoreAll();
  const signup = await fetch("http://127.0.0.1:9097/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic-api-key", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${randomUUID()}@synthetic.invalid`, password: "synthetic-password-only", returnSecureToken: true }) });
  assert.equal(signup.status, 200); const account = await signup.json();
  await db.doc(`users/${account.localId}`).set({ role: "student" });
  await db.doc(`spaceMembers/room_${account.localId}`).set({ spaceId: "room", uid: account.localId, participantId: account.localId, role: "student", status: "active" });
  const response = await beginRoute(req(account.idToken, "POST", { ...scope, submissionId: `room_task_${account.localId}`, contentType: "audio/wav", size: 3 }));
  assert.equal(response.status, 200); const session = await response.json();
  await getAuth(app).updateUser(account.localId, { disabled: true });
  assert.equal((await put(session.uploadUrl)).status, 200);
  assert.equal((await finishRoute(req(account.idToken), ctx(session.id))).status, 401);
  assert.equal((await readRoute(req(account.idToken, "GET"), ctx(session.id))).status, 401);
  assert.equal((await beginRoute(req(account.idToken, "POST", { ...scope, submissionId: `room_task_${account.localId}`, contentType: "audio/wav", size: 3 }))).status, 401);
});
for (const offset of [-1, 0, 1]) test(`publication deadline boundary offset ${offset}ms`, async () => {
  const session = await start(); assert.equal((await put(session.uploadUrl)).status, 200);
  mock.method(Date, "now", () => session.expiresAt + offset);
  if (offset < 0) await finishSpaceFileUpload("pupil", session.id);
  else await assert.rejects(finishSpaceFileUpload("pupil", session.id), denied(410));
  assert.equal((await session.ref.get()).get("status"), offset < 0 ? "ready" : "pending");
});
for (const change of ["delete", "recreate", "deadline"] as const) test(`publication transaction rechecks ${change} after copying`, async () => {
  const session = await start(); assert.equal((await put(session.uploadUrl)).status, 200);
  const run = db.runTransaction.bind(db);
  mock.method(db, "runTransaction", async (...args: any[]) => {
    if (change !== "deadline") await db.doc(submission).delete();
    if (change === "recreate") await db.doc(submission).set({ uid: "pupil", participantId: "pupil", spaceId: "room", assignmentId: "task" });
    if (change === "deadline") mock.method(Date, "now", () => session.expiresAt);
    return (run as any)(...args);
  });
  await assert.rejects(finishSpaceFileUpload("pupil", session.id), denied(410));
  assert.equal((await session.ref.get()).get("status"), "pending");
  const data = (await session.ref.get()).data()!;
  assert.equal((await getStorage(app).bucket(bucketName).file(data.storagePath).exists())[0], true, "A rejected publication may leave a private copy; no automatic cleanup");
});
test("existing submission edits keep the same version and do not block ordinary uploads", async () => {
  const session = await start(); assert.match((await session.ref.get()).get("submissionCreatedAt"), /^\d+:\d+$/);
  await db.doc(submission).update({ answers: { synthetic: "Own draft edited during upload" } });
  assert.equal((await put(session.uploadUrl)).status, 200); await finishSpaceFileUpload("pupil", session.id);
});
for (const createdLater of [false, true]) test(`first-save workflow remains valid when submission was initially absent, createdLater=${createdLater}`, async () => {
  await db.doc(submission).delete(); const session = await start();
  assert.equal((await session.ref.get()).get("submissionCreatedAt"), undefined);
  if (createdLater) await db.doc(submission).set({ uid: "pupil", participantId: "pupil", spaceId: "room", assignmentId: "task" });
  assert.equal((await put(session.uploadUrl)).status, 200); await finishSpaceFileUpload("pupil", session.id);
  assert.equal((await session.ref.get()).get("status"), "ready");
});
test("ready attachment remains readable after upload deadline; deadline is not content retention", async () => {
  const session = await start(); assert.equal((await put(session.uploadUrl)).status, 200);
  const saved = await finishSpaceFileUpload("pupil", session.id);
  await db.doc(submission).update({ audioReading: { storagePath: saved.storagePath } });
  mock.method(Date, "now", () => session.expiresAt + 1);
  assert.equal((await readSpaceFile("pupil", session.id, null)).status, 200);
  assert.equal((await readSpaceFile("teacher", session.id, null)).status, 200);
  await finishSpaceFileUpload("pupil", session.id); // Idempotent, not a fresh publication.
});
test("deleting the bound submission also denies uploader's temporary ready preview", async () => {
  const session = await start(); assert.equal((await put(session.uploadUrl)).status, 200);
  await finishSpaceFileUpload("pupil", session.id); await db.doc(submission).delete();
  await assert.rejects(readSpaceFile("pupil", session.id, null), denied(410));
});
test("malformed new submission binding fails closed", async () => {
  const session = await start(); await session.ref.update({ submissionCreatedAt: null });
  assert.equal((await put(session.uploadUrl)).status, 200);
  await assert.rejects(finishSpaceFileUpload("pupil", session.id), denied(410));
});
test("emulator JSON session cancellation is unsupported, not evidence of GCS behaviour", async () => {
  const session = await start(); assert.equal((await fetch(session.uploadUrl, { method: "DELETE" })).status, 501);
  assert.equal((await put(session.uploadUrl)).status, 200);
  observations.push({ test: "emulator-JSON-cancel", deleteStatus: 501, realGcsCancellationVerified: false });
});
test("oversized completed staging upload is denied publication (emulator does not enforce declared length)", async () => {
  const session = await start(); assert.equal((await put(session.uploadUrl, Buffer.alloc(4))).status, 200);
  await assert.rejects(finishSpaceFileUpload("pupil", session.id), denied(503));
  assert.equal((await session.ref.get()).get("status"), "pending");
  observations.push({ test: "declared-size-vs-staging", declared: 3, storedInEmulator: 4, publish: 503, gcsSizeEnforcementMeasured: false });
});
test("repeated starts are distinct pending sessions; three allowed starts demonstrate no per-activity deduplication", async () => {
  const sessions = await Promise.all([start(), start(), start()]);
  assert.equal(new Set(sessions.map(s => s.id)).size, 3);
  for (const session of sessions) { assert.equal((await put(session.uploadUrl)).status, 200); assert.equal((await session.ref.get()).get("status"), "pending"); }
  observations.push({ test: "repeated-starts", distinctPendingSessions: 3, automaticDeduplication: false });
});
test("provider protocol cancellation cannot undo an already completed object", async () => {
  const model = await protocol();
  try {
    const session = await start(); assert.equal((await put(session.uploadUrl)).status, 200);
    assert.equal((await fetch(session.uploadUrl, { method: "DELETE" })).status, 400);
    const data = (await session.ref.get()).data()!; assert.equal((await getStorage(app).bucket(bucketName).file(data.uploadPath).exists())[0], true);
    await deleteSpaceFile("pupil", session.id); assert.equal((await session.ref.get()).get("status"), "deleted");
    assert.equal((await getStorage(app).bucket(bucketName).file(data.uploadPath).exists())[0], false);
  } finally { await model.close(); }
});
test("restored active membership permits the original valid upload within its unchanged deadline", async () => {
  const session = await start(); await db.doc("spaceMembers/room_pupil").update({ status: "removed" });
  assert.equal((await put(session.uploadUrl)).status, 200);
  await assert.rejects(finishSpaceFileUpload("pupil", session.id), denied(403));
  // Trusted fixture simulates owner-authorized restoration, not self-service.
  await db.doc("spaceMembers/room_pupil").update({ status: "active" });
  await finishSpaceFileUpload("pupil", session.id);
  assert.equal((await session.ref.get()).get("status"), "ready");
  assert.equal((await session.ref.get()).get("createdAt") + SPACE_FILE_UPLOAD_LIFETIME_MS, session.expiresAt);
});
test("abandoned or cancelled app asset does not prevent a distinct legitimate new upload", async () => {
  const cancelled = await start(); await deleteSpaceFile("pupil", cancelled.id);
  const fresh = await start(); assert.notEqual(fresh.id, cancelled.id);
  assert.equal((await put(fresh.uploadUrl)).status, 200); await finishSpaceFileUpload("pupil", fresh.id);
  assert.equal((await cancelled.ref.get()).get("status"), "deleted"); assert.equal((await fresh.ref.get()).get("status"), "ready");
});
