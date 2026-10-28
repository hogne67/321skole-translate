/* eslint-disable @typescript-eslint/no-explicit-any -- deliberately faulty local Storage transport */
import assert from "node:assert/strict";
import { before, beforeEach, after, afterEach, test, mock } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Storage } from "@google-cloud/storage";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";
import { beginSpaceFileUpload, finishSpaceFileUpload, deleteSpaceFile, saveGeneratedSpaceImage, SpaceFileError } from "../../spaceFiles.server";
import { POST as finalizeRoute } from "../../../app/api/space-files/[id]/route";
import type { SpaceFileScope } from "../../spaceFiles";

const project = "demo-phase2-local", bucketName = `${project}.appspot.com`;
const app = initializeApp({ projectId: project });
const db = getFirestore(app);
const scope: SpaceFileScope = { spaceId: "room", activityId: "task", submissionId: "room_task_pupil", purpose: "audio_reading" };
const bytes = Buffer.from([1, 2, 3]);
const md5 = createHash("md5").update(bytes).digest("base64");
const denied = (status: number) => (e: unknown) => e instanceof SpaceFileError && e.status === status;
before(() => {
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, project);
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8287");
  assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9297");
  assert.ok(process.env.PHASE2_RESULT_DIR?.includes("security-f207-local"));
  for (const key of Object.keys(process.env)) assert.ok(!/^(GOOGLE_APPLICATION_CREDENTIALS|FIREBASE_ADMIN_|FIREBASE_TOKEN$)/.test(key));
});
beforeEach(async () => {
  await db.doc("users/pupil").set({ role: "student" });
  await db.doc("users/teacher").set({ role: "teacher" });
  await db.doc("spaces/room").set({ ownerId: "teacher" });
  await db.doc("spaces/room/lessons/task").set({ title: "Synthetic" });
  await db.doc("spaces/room/writingActivities/writing").set({ title: "Synthetic" });
  await db.doc("spaceMembers/room_pupil").set({ uid: "pupil", spaceId: "room", participantId: "pupil", role: "student", status: "active" });
  await db.doc("spaces/room/lessons/task/submissions/room_task_pupil").set({ uid: "pupil", participantId: "pupil", spaceId: "room", assignmentId: "task" });
});
afterEach(() => mock.restoreAll());
after(async () => { await deleteApp(app); });

async function fixture(options: { conflict?: boolean; concurrent?: boolean; copyError?: number; missing?: boolean } = {}) {
  const id = randomUUID(), uploadPath = `private-space-uploads/room/${id}`, storagePath = `private-space-files/room/${id}`;
  const record = { ...scope, ownerUid: "pupil", participantId: "pupil", uploadPath, storagePath, contentType: "audio/wav", size: 3, createdAt: Date.now(), status: "pending" };
  const ref = db.doc(`privateSpaceFiles/${id}`); await ref.create(record);
  const src: any = { name: uploadPath, bucket: bucketName, generation: "21", metageneration: "1", size: "3", contentType: "audio/wav", md5Hash: md5, crc32c: "8TDyHg==", cacheControl: "private,no-store" };
  const dest: any = { ...src, name: storagePath, generation: "22", metadata: { assetId: id, spaceId: "room", sourceGeneration: "21", sourceMetageneration: "1", firebaseStorageDownloadTokens: null } };
  const calls: any[] = []; let present = !!options.conflict, count = 0;
  let release!: () => void; const gate = new Promise<void>(r => { release = r; });
  const fake = { name: bucketName, file: (p: string, version?: any) => ({
    getMetadata: async () => { calls.push({ op: "metadata", p, version }); if (options.missing && p === uploadPath) throw Object.assign(new Error("incomplete synthetic upload"), { code: 404 }); return [p === uploadPath ? src : dest]; },
    copy: async (_target: unknown, settings: any) => {
      calls.push({ op: "copy", version, settings }); count++;
      if (options.concurrent) { if (count === 2) release(); await gate; }
      if (options.copyError) throw Object.assign(new Error("synthetic copy failure"), { code: options.copyError });
      if (present) throw Object.assign(new Error("synthetic destination exists"), { code: 412 });
      present = true; return [{}, { resource: dest }];
    },
    delete: async (settings: any) => { calls.push({ op: "delete", p, version, settings }); },
  }) };
  mock.method(getStorage(app), "bucket", () => fake as never);
  return { id, ref, src, dest, calls, uploadPath, storagePath, record };
}

test("valid create-only copy stores verified integrity and uses generation-conditional staging cleanup", async () => {
  const f = await fixture(); await finishSpaceFileUpload("pupil", f.id);
  const record = (await f.ref.get()).data()!;
  assert.equal(record.status, "ready"); assert.equal(record.md5Hash, md5); assert.equal(record.sourceGeneration, "21");
  const copy = f.calls.find(c => c.op === "copy");
  assert.equal(copy.version.generation, "21"); assert.equal(copy.settings.preconditionOpts.ifGenerationMatch, 0);
  const deletion = f.calls.find(c => c.op === "delete");
  assert.equal(deletion.version.generation, "21"); assert.equal(deletion.version.preconditionOpts.ifGenerationMatch, "21");
});
test("valid 412 destination is accepted only with matching source version and checksums", async () => {
  const f = await fixture({ conflict: true }); await finishSpaceFileUpload("pupil", f.id); assert.equal((await f.ref.get()).get("status"), "ready");
});
for (const [label, change] of Object.entries<Record<string, unknown>>({
  "wrong md5": { md5Hash: Buffer.alloc(16).toString("base64") }, "wrong crc": { crc32c: "AAAAAA==" },
  "missing checksums": { md5Hash: undefined, crc32c: undefined }, "invalid checksum": { md5Hash: "not-base64" },
  "wrong size": { size: "4" }, "wrong MIME": { contentType: "image/png" }, "missing generation": { generation: undefined },
  "invalid generation": { generation: "1.2" }, "missing metageneration": { metageneration: undefined },
  "wrong object": { name: "private-space-files/foreign/other" }, "wrong bucket": { bucket: "foreign.appspot.com" },
  "public cache": { cacheControl: "public,max-age=3600" }, "public ACL": { acl: [{ entity: "allUsers" }] },
})) test(`412 destination rejects ${label} without publishing or deleting`, async () => {
  const f = await fixture({ conflict: true }); Object.assign(f.dest, change);
  await assert.rejects(finishSpaceFileUpload("pupil", f.id), denied(503));
  assert.equal((await f.ref.get()).get("status"), "pending"); assert.equal(f.calls.filter(c => c.op === "delete").length, 0);
});
for (const [key, value] of [["assetId", "other"], ["spaceId", "other"], ["sourceGeneration", "20"], ["sourceMetageneration", "2"], ["firebaseStorageDownloadTokens", "token"], ["firebaseStorageDownloadTokens", " "]] as const)
  test(`412 destination rejects mismatching metadata ${key}=${JSON.stringify(value)}`, async () => {
    const f = await fixture({ conflict: true }); f.dest.metadata[key] = value; await assert.rejects(finishSpaceFileUpload("pupil", f.id), denied(503));
  });
for (const value of [undefined, null, ""]) test(`token absence accepts ${String(value)}`, async () => {
  const f = await fixture(); f.dest.metadata.firebaseStorageDownloadTokens = value; await finishSpaceFileUpload("pupil", f.id);
});
for (const change of [{ size: "2" }, { generation: "bad" }, { md5Hash: "bad" }, { crc32c: undefined, md5Hash: undefined }]) test(`invalid/incomplete source rejects ${JSON.stringify(change)}`, async () => {
  const f = await fixture(); Object.assign(f.src, change); await assert.rejects(finishSpaceFileUpload("pupil", f.id));
  assert.equal(f.calls.filter(c => c.op === "copy").length, 0); assert.equal((await f.ref.get()).get("status"), "pending");
});
test("interrupted upload and copy operational errors do not publish or trigger cleanup", async () => {
  for (const options of [{ missing: true }, { copyError: 500 }, { copyError: 403 }]) {
    const f = await fixture(options); await assert.rejects(finishSpaceFileUpload("pupil", f.id));
    assert.equal((await f.ref.get()).get("status"), "pending"); assert.equal(f.calls.filter(c => c.op === "delete").length, 0); mock.restoreAll();
  }
});
test("two concurrent finalizers converge on one verified destination and duplicate ready calls do not recopy", async () => {
  const f = await fixture({ concurrent: true });
  const result = await Promise.all([finishSpaceFileUpload("pupil", f.id), finishSpaceFileUpload("pupil", f.id)]);
  assert.deepEqual(result[0], result[1]); const count = f.calls.filter(c => c.op === "copy").length;
  assert.deepEqual(await finishSpaceFileUpload("pupil", f.id), result[0]); assert.equal(f.calls.filter(c => c.op === "copy").length, count);
});
test("duplicate ready call rejects altered destination generation or checksum", async () => {
  const f = await fixture(); await finishSpaceFileUpload("pupil", f.id);
  f.dest.md5Hash = Buffer.alloc(16).toString("base64"); await assert.rejects(finishSpaceFileUpload("pupil", f.id), denied(503));
  f.dest.md5Hash = md5; f.dest.generation = "23"; await assert.rejects(finishSpaceFileUpload("pupil", f.id), denied(503));
});
for (const kind of ["member", "profile", "authDisabled", "scope", "deleted", "record"] as const) test(`revocation/change immediately before publication: ${kind}`, async () => {
  const f = await fixture(); const original = db.runTransaction.bind(db);
  mock.method(db, "runTransaction", async (...args: any[]) => {
    if (kind === "member") await db.doc("spaceMembers/room_pupil").update({ status: "removed" });
    if (kind === "profile") await db.doc("users/pupil").update({ disabled: true });
    if (kind === "authDisabled") await db.doc("users/pupil").update({ authDisabled: true });
    if (kind === "scope") await db.doc("spaces/room/lessons/task/submissions/room_task_pupil").update({ uid: "other", participantId: "other" });
    if (kind === "deleted") await f.ref.update({ status: "deleted" });
    if (kind === "record") await f.ref.update({ storagePath: "private-space-files/room/other" });
    return (original as any)(...args);
  });
  await assert.rejects(finishSpaceFileUpload("pupil", f.id)); assert.notEqual((await f.ref.get()).get("status"), "ready");
  assert.equal(f.calls.filter(c => c.op === "delete").length, 0);
});
test("publication transaction reads the profile, membership, room, activity and submission before writing", async () => {
  const f = await fixture(), original = db.runTransaction.bind(db), reads: string[] = [];
  mock.method(db, "runTransaction", (fn: any) => original(async tx => {
    const get = tx.get.bind(tx), getAll = tx.getAll.bind(tx);
    mock.method(tx, "get", (ref: any, ...rest: any[]) => { reads.push(ref.path); return (get as any)(ref, ...rest); });
    mock.method(tx, "getAll", (...refs: any[]) => { reads.push(...refs.filter(r => r.path).map(r => r.path)); return (getAll as any)(...refs); });
    return fn(tx);
  }));
  await finishSpaceFileUpload("pupil", f.id);
  for (const p of ["users/pupil", "spaceMembers/room_pupil", "spaces/room", "spaces/room/lessons/task", "spaces/room/lessons/task/submissions/room_task_pupil"]) assert.ok(reads.includes(p), p);
});
test("staging replacement during cleanup is protected by explicit precondition; failure is surfaced", async () => {
  const f = await fixture(); const bucketMock = getStorage(app).bucket(bucketName), file = bucketMock.file.bind(bucketMock);
  mock.method(bucketMock, "file", (p: string, version?: any) => {
    const obj: any = file(p, version);
    if (p === f.uploadPath) obj.delete = async () => { assert.equal(version?.preconditionOpts?.ifGenerationMatch, "21"); throw Object.assign(new Error("newer synthetic generation"), { code: 412 }); };
    return obj;
  });
  await assert.rejects(finishSpaceFileUpload("pupil", f.id), { code: 412 });
  assert.equal((await f.ref.get()).get("status"), "ready");
  assert.equal(f.calls.filter(c => c.op === "copy").length, 1);
});
test("explicit deletion pins both private and staging generations and marks denied first", async () => {
  const f = await fixture(); await deleteSpaceFile("pupil", f.id);
  assert.equal((await f.ref.get()).get("status"), "deleted");
  for (const d of f.calls.filter(c => c.op === "delete")) assert.equal(d.version.preconditionOpts.ifGenerationMatch, d.version.generation);
});
test("generated image is not published if membership is removed before transaction", async () => {
  const original = db.runTransaction.bind(db);
  mock.method(db, "runTransaction", async (...args: any[]) => { await db.doc("spaceMembers/room_pupil").update({ status: "removed" }); return (original as any)(...args); });
  await assert.rejects(saveGeneratedSpaceImage("pupil", { spaceId: "room", activityId: "writing", submissionId: "room_writing_pupil", purpose: "writing_image" }, bytes));
});
test("HTTP finalize rechecks Firebase session after copy and preserves Auth error status", async () => {
  const f = await fixture(); let verifies = 0;
  mock.method(getAuth(app), "verifyIdToken", async () => { if (++verifies > 1) throw Object.assign(new Error("disabled synthetic account"), { code: "auth/user-disabled" }); return { uid: "pupil", auth_time: 123 } as never; });
  const response = await finalizeRoute(new Request("http://localhost/synthetic", { method: "POST", headers: { Authorization: "Bearer synthetic" } }), { params: Promise.resolve({ id: f.id }) });
  assert.equal(response.status, 401); assert.equal((await f.ref.get()).get("status"), "pending"); assert.equal(verifies, 2);
});
test("profile token cutoff changed after session verification denies transactional publication", async () => {
  const f = await fixture(), original = db.runTransaction.bind(db);
  mock.method(getAuth(app), "verifyIdToken", async () => ({ uid: "pupil", auth_time: 123 }) as never);
  mock.method(db, "runTransaction", async (...args: any[]) => { await db.doc("users/pupil").update({ authRevokedBefore: 124 }); return (original as any)(...args); });
  const response = await finalizeRoute(new Request("http://localhost/synthetic", { method: "POST", headers: { Authorization: "Bearer synthetic" } }), { params: Promise.resolve({ id: f.id }) });
  assert.equal(response.status, 401); assert.equal((await f.ref.get()).get("status"), "pending");
});
test("transaction callback replay checks current membership instead of reusing earlier authorization", async () => {
  const f = await fixture(), original = db.runTransaction.bind(db);
  let scheduled = 0;
  mock.method(db, "runTransaction", async (fn: any) => {
    // Deterministic aborted first callback: no writes committed. The actual
    // Firestore transaction runs the second callback after committed revocation.
    await fn({ get: (r: any) => r.get(), getAll: (...r: any[]) => (db.getAll as any)(...r), update: () => { scheduled++; } });
    await db.doc("spaceMembers/room_pupil").update({ status: "removed" });
    return original(fn);
  });
  await assert.rejects(finishSpaceFileUpload("pupil", f.id), denied(403));
  assert.equal(scheduled, 1); assert.equal((await f.ref.get()).get("status"), "pending");
});
test("publication transaction outage fails closed and a later explicit retry accepts the verified copy", async () => {
  const f = await fixture();
  const outage = mock.method(db, "runTransaction", async () => { throw new Error("synthetic Firestore unavailable"); });
  await assert.rejects(finishSpaceFileUpload("pupil", f.id), /unavailable/);
  assert.equal((await f.ref.get()).get("status"), "pending"); assert.equal(f.calls.filter(c => c.op === "delete").length, 0);
  outage.mock.restore();
  await finishSpaceFileUpload("pupil", f.id); assert.equal((await f.ref.get()).get("status"), "ready");
});
test("legacy ready record remains usable without new source/checksum fields; pending legacy conflict is denied", async () => {
  const f = await fixture({ conflict: true });
  delete f.dest.metadata.sourceGeneration; delete f.dest.metadata.sourceMetageneration;
  await assert.rejects(finishSpaceFileUpload("pupil", f.id), denied(503));
  await f.ref.update({ status: "ready", generation: "22" });
  await finishSpaceFileUpload("pupil", f.id); assert.equal((await f.ref.get()).get("status"), "ready");
});
test("successful copy with corrupt destination checksum is also denied", async () => {
  const f = await fixture(); f.dest.crc32c = "AAAAAA==";
  await assert.rejects(finishSpaceFileUpload("pupil", f.id), denied(503)); assert.equal((await f.ref.get()).get("status"), "pending");
});
test("a duplicate delayed until staging was removed validates the already-committed ready version", async () => {
  const f = await fixture(), fake = getStorage(app).bucket(bucketName), file = fake.file.bind(fake);
  mock.method(fake, "file", (p: string, options?: any) => {
    const result: any = file(p, options);
    if (p === f.uploadPath) result.getMetadata = async () => {
      await f.ref.update({ status: "ready", generation: "22", sourceGeneration: "21", sourceMetageneration: "1", md5Hash: md5, crc32c: "8TDyHg==" });
      throw Object.assign(new Error("staging removed by first finalizer"), { code: 404 });
    };
    return result;
  });
  await finishSpaceFileUpload("pupil", f.id);
  assert.equal(f.calls.filter(c => c.op === "copy" || c.op === "delete").length, 0);
});
test("actual Storage SDK sends generation and metageneration preconditions to a local HTTP server", async () => {
  const requests: URL[] = []; let replacementExists = true;
  const server = createServer((req, res) => {
    const url = new URL(req.url!, "http://127.0.0.1"); requests.push(url);
    // A newer synthetic generation already exists. Only a wrongly unconditioned
    // request could remove it; this server is not a GCS emulator.
    const pinned = url.searchParams.get("generation") === "21" && url.searchParams.get("ifGenerationMatch") === "21" && url.searchParams.get("ifMetagenerationMatch") === "1";
    if (!pinned) replacementExists = false;
    res.writeHead(pinned ? 412 : 204, { "Content-Type": "application/json" });
    res.end(pinned ? JSON.stringify({ error: { code: 412, message: "synthetic replacement" } }) : undefined);
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    // Admin SDK sets STORAGE_EMULATOR_HOST process-wide. The Storage SDK gives
    // it precedence for baseUrl even when apiEndpoint is explicit. Override only
    // during construction of this extra local HTTP client, then restore it.
    const previous = process.env.STORAGE_EMULATOR_HOST;
    let storage: Storage;
    try {
      process.env.STORAGE_EMULATOR_HOST = `http://127.0.0.1:${address.port}`;
      storage = new Storage({ projectId: project, apiEndpoint: process.env.STORAGE_EMULATOR_HOST, useAuthWithCustomEndpoint: false, retryOptions: { autoRetry: false } });
    } finally { if (previous === undefined) delete process.env.STORAGE_EMULATOR_HOST; else process.env.STORAGE_EMULATOR_HOST = previous; }
    const f = await fixture(), fake = getStorage(app).bucket(bucketName), file = fake.file.bind(fake);
    mock.method(fake, "file", (p: string, options?: any) => {
      const result: any = file(p, options);
      if (p === f.uploadPath) result.delete = (settings: any) => storage.bucket(bucketName).file(p, options).delete(settings);
      return result;
    });
    let failure: unknown;
    try { await finishSpaceFileUpload("pupil", f.id); } catch (error) { failure = error; }
    assert.equal(requests.length, 1);
    assert.equal(requests[0].searchParams.get("generation"), "21", requests[0].toString());
    assert.equal(requests[0].searchParams.get("ifGenerationMatch"), "21", requests[0].toString());
    assert.equal(requests[0].searchParams.get("ifMetagenerationMatch"), "1", requests[0].toString());
    assert.equal((failure as any)?.code, 412);
    assert.equal(replacementExists, true); assert.equal((await f.ref.get()).get("status"), "ready");
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});

// Actual emulator upload/copy/download: these checks are deliberately separate
// from the controlled fault transport above (the emulator lacks GCS versions).
for (const purpose of ["audio_reading", "podcast", "writing_image", "board_image"] as const) test(`real emulator upload/copy and duplicate finalize preserve ${purpose}`, async () => {
  const s: SpaceFileScope = purpose === "board_image" ? { spaceId: "room", activityId: "state", purpose }
    : purpose === "writing_image" ? { spaceId: "room", activityId: "writing", submissionId: "room_writing_pupil", purpose }
      : { ...scope, purpose, ...(purpose === "podcast" ? { segmentId: "segment-1" } : {}) };
  const actor = purpose === "board_image" ? "teacher" : "pupil", mime = purpose.endsWith("image") ? "image/png" : "audio/wav";
  const session = await beginSpaceFileUpload(actor, s, mime, bytes.length);
  assert.match(session.uploadUrl, /^http:\/\/127\.0\.0\.1:9297\//);
  assert.equal((await fetch(session.uploadUrl, { method: "PUT", headers: { "Content-Type": mime }, body: bytes })).status, 200);
  const saved = await finishSpaceFileUpload(actor, session.id); assert.deepEqual(await finishSpaceFileUpload(actor, session.id), saved);
  const record = (await db.doc(`privateSpaceFiles/${session.id}`).get()).data()!;
  const [download] = await getStorage(app).bucket(bucketName).file(saved.storagePath, { generation: record.generation }).download();
  assert.deepEqual(download, bytes); assert.equal(record.md5Hash, md5);
});
for (const purpose of ["audio_reading", "podcast"] as const) test(`active teacher can upload their own ${purpose} without a school licence`, async () => {
  await db.doc("spaceMembers/room_teacher").set({ uid: "teacher", spaceId: "room", role: "teacher", participantId: "teacher", status: "active" });
  const s: SpaceFileScope = { ...scope, submissionId: "room_task_teacher", purpose, ...(purpose === "podcast" ? { segmentId: "segment-teacher" } : {}) };
  const session = await beginSpaceFileUpload("teacher", s, "audio/wav", bytes.length);
  assert.equal((await fetch(session.uploadUrl, { method: "PUT", headers: { "Content-Type": "audio/wav" }, body: bytes })).status, 200);
  await finishSpaceFileUpload("teacher", session.id);
  assert.equal((await db.doc(`privateSpaceFiles/${session.id}`).get()).get("status"), "ready");
});
test("real emulator session without completed bytes stays pending and can finish after explicit upload", async () => {
  const session = await beginSpaceFileUpload("pupil", scope, "audio/wav", bytes.length);
  await assert.rejects(finishSpaceFileUpload("pupil", session.id));
  assert.equal((await db.doc(`privateSpaceFiles/${session.id}`).get()).get("status"), "pending");
  assert.equal((await fetch(session.uploadUrl, { method: "PUT", headers: { "Content-Type": "audio/wav" }, body: bytes })).status, 200);
  await finishSpaceFileUpload("pupil", session.id);
  assert.equal((await db.doc(`privateSpaceFiles/${session.id}`).get()).get("status"), "ready");
});
