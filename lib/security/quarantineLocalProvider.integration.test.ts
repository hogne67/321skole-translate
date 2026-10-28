import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, FieldPath, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { getBytes, ref } from "firebase/storage";
import { digest } from "./reconciliation";
import { executeApprovedQuarantine, type QuarantinePlan, type QuarantineObject, type QuarantineEvent, type QuarantineGate } from "./quarantineExecution";
import { createLocalQuarantineProvider, type LocalQuarantinePorts, type QuarantineBoardState, type QuarantineStorageRequest } from "./quarantineLocalProvider";

const project = "demo-security-round1", bucketName = `${project}.appspot.com`;
assert.equal(process.env.GOOGLE_CLOUD_PROJECT, project);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8188");
assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9199");
assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
const app = initializeApp({ projectId: project, storageBucket: bucketName }, "quarantine-local-fixtures"), db = getFirestore(app), bucket = getStorage(app).bucket(bucketName);
let env: RulesTestEnvironment, baseRules: string;
before(async () => {
  const base = process.env.QUARANTINE_RULES_BASE === "deployed" ? ".vercel/security-quarantine-approved/deployed-storage.current.rules" : "storage.rules";
  assert.ok(["deployed", "local"].includes(process.env.QUARANTINE_RULES_BASE ?? "local"));
  baseRules = await readFile(base, "utf8");
  env = await initializeTestEnvironment({ projectId: project, firestore: { host: "127.0.0.1", port: 8188, rules: await readFile("firestore.rules", "utf8") },
    storage: { host: "127.0.0.1", port: 9199, rules: baseRules } });
  await db.doc("users/quarantine-teacher").set({ role: "teacher", disabled: false });
});
after(async () => { await env?.cleanup(); await deleteApp(app); });

async function setRules(source: string) {
  const response = await fetch("http://127.0.0.1:9199/internal/setRules", { method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ rules: { files: [{ name: "storage.rules", content: source }] } }), redirect: "manual", signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, "local rules compilation failed");
}
async function fixture() {
  await setRules(baseRules);
  const id = `quarantine-rehearsal-${randomUUID()}`, room = `spaces/${id}`, board = db.doc(`${room}/board/state`), response = db.doc(`${room}/boardResponses/synthetic`);
  await db.doc(room).set({ ownerId: "quarantine-teacher" });
  const files: QuarantineObject[] = [];
  for (let index = 0; index < 4; index++) {
    const path = index === 3 ? `covers/${id}/board.png` : `${room}/assignments/task/submissions/pupil/audio/${index}.webm`;
    const contentType = index === 3 ? "image/png" : "audio/webm";
    await bucket.file(path).save(Buffer.from([1, 2, 3, index]), { resumable: false, metadata: { contentType, cacheControl: "public,max-age=60",
      // The emulator does not remove its separate token list on a GCS null patch.
      // Happy-path fixtures are explicitly token-free; non-empty tokens get a separate stop test below.
      metadata: { firebaseStorageDownloadTokens: "", fixture: id } } });
    const [data] = await bucket.file(path).getMetadata();
    files.push({ sourcePath: path, generation: String(data.generation), metageneration: String(data.metageneration), size: Number(data.size), contentType,
      md5Hash: data.md5Hash ?? null, crc32c: data.crc32c ?? null, proposedArchivePath: `private-file-quarantine/${digest([project, path, String(data.generation)])}` });
  }
  const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(files[3].sourcePath)}?alt=media&token=synthetic-fixture-only`;
  const originalBoard = { active: false, mode: "clock", sessionId: id, data: { imageUrl, title: "Synthetic title", imagePrompt: "Synthetic prompt", quizQuestions: ["Synthetic question"] } };
  await board.set(originalBoard); await response.set({ text: "Synthetic response", sessionId: id });
  const snapshot = await board.get();
  const plan: QuarantinePlan = { projectId: project, bucket: bucketName, files, boardChange: { document: board.path, expectedValueDigest: digest(imageUrl),
    updateTime: { seconds: snapshot.updateTime!.seconds, nanoseconds: snapshot.updateTime!.nanoseconds }, referenceStillMatches: true, versionStableDuringInspection: true, active: false, imageMode: false } };
  const archiveControl = `private-file-quarantine/${digest([id, "control"])}`, unaffectedControl = `covers/${id}/unaffected.png`;
  await bucket.file(archiveControl).save(Buffer.from([7]), { resumable: false, metadata: { contentType: "image/png", cacheControl: "private,no-store", metadata: { firebaseStorageDownloadTokens: "" } } });
  await bucket.file(unaffectedControl).save(Buffer.from([8]), { resumable: false, metadata: { contentType: "image/png", metadata: { firebaseStorageDownloadTokens: "synthetic-public-control" } } });
  let rules = baseRules;
  const requests: QuarantineStorageRequest[] = [], events: QuarantineEvent[] = [];
  async function readBoard(document: string): Promise<QuarantineBoardState> {
    assert.equal(document, board.path); const image = new FieldPath("data", "imageUrl");
    const [head] = await db.getAll(db.doc(document), { fieldMask: ["active", "mode"] });
    const urls = await board.parent.where(image, ">=", "http").where(image, "<", "httq").select(image).get();
    const empty = await board.parent.where(image, "==", "").select(image).get();
    const projected = [...urls.docs, ...empty.docs].find(item => item.ref.path === document);
    const value = projected?.get(image);
    return { valueDigest: typeof value === "string" ? digest(value) : null,
      version: head.updateTime ? { seconds: head.updateTime.seconds, nanoseconds: head.updateTime.nanoseconds } : null,
      stable: !!projected && !!head.updateTime && projected.updateTime.isEqual(head.updateTime), active: typeof head.get("active") === "boolean" ? head.get("active") : null,
      imageMode: head.get("mode") === "image" };
  }
  const contexts = [env.unauthenticatedContext().storage(`gs://${bucketName}`), env.authenticatedContext("quarantine-teacher").storage(`gs://${bucketName}`)];
  const ports: LocalQuarantinePorts = {
    storage: async request => {
      requests.push(structuredClone(request));
      // Firebase's local GCS-compatible router mounts at /b, not /storage/v1/b.
      const path = `/b/${bucketName}/o/${encodeURIComponent(request.path)}`
        + (request.destination ? `/copyTo/b/${bucketName}/o/${encodeURIComponent(request.destination)}` : "");
      const url = new URL(path, "http://127.0.0.1:9199");
      for (const [key, value] of Object.entries(request.query)) url.searchParams.set(key, value);
      assert.ok(!url.searchParams.has("alt"), "provider must not download media");
      const result = await fetch(url, { method: request.method, headers: { authorization: "Bearer owner", "content-type": "application/json" },
        ...(request.body ? { body: JSON.stringify(request.body) } : {}), redirect: "manual", signal: AbortSignal.timeout(15000) });
      return { status: result.status, ...(result.headers.get("content-type")?.includes("application/json") ? { data: await result.json() } : {}) };
    },
    board: { read: readBoard, clear: async (document, expectedDigest, version) => {
      const current = await readBoard(document); assert.ok(current.stable); assert.equal(current.valueDigest, expectedDigest); assert.deepEqual(current.version, version);
      await db.doc(document).update(new FieldPath("data", "imageUrl"), "", { lastUpdateTime: new Timestamp(version.seconds, version.nanoseconds) });
    } },
    rules: {
      currentDigest: async () => digest(rules),
      replace: async (expectedDigest, source) => { assert.equal(digest(rules), expectedDigest); await setRules(source); rules = source; },
      denied: async paths => { for (const path of paths) for (const storage of contexts) {
        try { await getBytes(ref(storage, path)); return false; }
        catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "storage/unauthorized")) throw error; }
      } return true; },
      readable: async path => { assert.equal(path, unaffectedControl); return (await getBytes(ref(contexts[0], path))).byteLength === 1; },
    },
  };
  const journal = async (event: QuarantineEvent) => { events.push(structuredClone(event)); };
  // This synthetic gate exercises the coordinator locally. It is not a cloud receipt.
  const gate: QuarantineGate = { testProjectId: "synthetic-local-rehearsal-gate", productionProjectId: project, passed: true, checkedAt: "2026-10-19T00:00:00Z",
    copyPreconditions: true, deletePreconditions: true, tokenRevocation: true, softDelete: true };
  const create = () => createLocalQuarantineProvider(plan, { baseRules, archiveControl, unaffectedControl }, ports, journal);
  const run = () => executeApprovedQuarantine(plan, { planDigest: digest(plan), sourceRetirementApproved: true }, gate, create(), journal);
  async function liveSources() { return (await Promise.all(files.map(async file => (await bucket.file(file.sourcePath).exists())[0]))).filter(Boolean).length; }
  async function liveCopies() { return (await Promise.all(files.map(async file => (await bucket.file(file.proposedArchivePath).exists())[0]))).filter(Boolean).length; }
  return { plan, ports, run, create, board, response, originalBoard, events, requests, liveSources, liveCopies, archiveControl, unaffectedControl };
}

test("actual local Firestore/Storage complete the token-free four-file protocol without media downloads or unrelated changes", async () => {
  const f = await fixture();
  assert.deepEqual(await f.run(), { liveOriginals: 0, privateCopies: 4, boardCleared: true, otherFilesUnaffected: true });
  assert.deepEqual((await f.board.get()).data(), { ...f.originalBoard, data: { ...f.originalBoard.data, imageUrl: "" } });
  assert.equal((await f.response.get()).get("text"), "Synthetic response");
  assert.equal(await f.liveSources(), 0); assert.equal(await f.liveCopies(), 4);
  const writes = f.requests.filter(request => request.method !== "GET");
  assert.equal(writes.length, 12);
  for (const request of writes) {
    if (request.method === "POST") assert.deepEqual(request.query, { ifSourceGenerationMatch: f.plan.files.find(file => file.sourcePath === request.path)!.generation,
      ifSourceMetagenerationMatch: "1", ifGenerationMatch: "0" });
    else assert.ok(request.query.ifGenerationMatch && request.query.ifMetagenerationMatch && !("generation" in request.query));
  }
  assert.equal(f.events.at(-1)?.stage, "completed_four_files_preserved_privately");
});
test("an actual source metadata change stops before copying", async () => {
  const f = await fixture(); await bucket.file(f.plan.files[0].sourcePath).setMetadata({ cacheControl: "private,no-store" });
  await assert.rejects(f.run(), /source_version_changed/); assert.equal(await f.liveSources(), 4); assert.equal(await f.liveCopies(), 0);
});
test("the emulator retaining a non-empty source token stops before any source retirement", async () => {
  const f = await fixture(), file = f.plan.files[0];
  await bucket.file(file.sourcePath).setMetadata({ metadata: { firebaseStorageDownloadTokens: "synthetic-retained-token" } });
  const [current] = await bucket.file(file.sourcePath).getMetadata(); file.metageneration = String(current.metageneration);
  await assert.rejects(f.run(), /token_revocation_not_verified/);
  assert.equal(await f.liveSources(), 4); assert.equal(await f.liveCopies(), 4);
  assert.equal(f.requests.filter(request => request.method === "DELETE").length, 0);
  const [after] = await bucket.file(file.sourcePath).getMetadata(); assert.ok(String(after.metadata?.firebaseStorageDownloadTokens).includes("synthetic-retained-token"));
});
test("an existing archive is preserved and requires review", async () => {
  const f = await fixture(), path = f.plan.files[0].proposedArchivePath;
  await bucket.file(path).save(Buffer.from([99]), { resumable: false }); const [before] = await bucket.file(path).getMetadata();
  await assert.rejects(f.run(), /target_already_exists/); const [after] = await bucket.file(path).getMetadata();
  assert.equal(after.generation, before.generation); assert.equal(after.md5Hash, before.md5Hash); assert.equal(await f.liveSources(), 4);
});
test("a concurrent edit of a different board field blocks clearing and preserves all originals and copies", async () => {
  const f = await fixture(), replace = f.ports.rules.replace;
  f.ports.rules.replace = async (...args) => { await replace(...args); await f.board.update({ "data.title": "Synthetic new activity" }); };
  await assert.rejects(f.run()); assert.equal((await f.board.get()).get("data.title"), "Synthetic new activity");
  assert.equal((await f.board.get()).get("data.imageUrl"), f.originalBoard.data.imageUrl); assert.equal(await f.liveSources(), 4); assert.equal(await f.liveCopies(), 4);
  assert.equal(f.requests.filter(request => request.method === "PATCH" || request.method === "DELETE").length, 0);
});
test("an interrupted third token revocation preserves all originals and all private copies", async () => {
  const f = await fixture(), storage = f.ports.storage; let patches = 0;
  f.ports.storage = async request => request.method === "PATCH" && ++patches === 3 ? { status: 412 } : storage(request);
  await assert.rejects(f.run(), /storage_request_failed/); assert.equal(await f.liveSources(), 4); assert.equal(await f.liveCopies(), 4);
  assert.equal(f.requests.filter(request => request.method === "DELETE").length, 0);
  assert.equal(f.events.at(-1)?.stage, "stopped_preserve_copies_no_automatic_rollback");
});
test("journal failure prevents the first real local copy", async () => {
  const f = await fixture(); const operations = createLocalQuarantineProvider(f.plan,
    { baseRules, archiveControl: f.archiveControl, unaffectedControl: f.unaffectedControl }, f.ports, async () => { throw new Error("journal_unavailable"); });
  await operations.inspect(); await assert.rejects(operations.copy(f.plan.files[0]), /journal_unavailable/);
  assert.equal(await f.liveSources(), 4); assert.equal(await f.liveCopies(), 0);
});
