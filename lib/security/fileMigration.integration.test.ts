import assert from "node:assert/strict";
import { before, beforeEach, after, afterEach, test, mock } from "node:test";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, FieldPath } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { getBytes, getDownloadURL, ref } from "firebase/storage";
import { applyLocalFileMigration, prepareFileMigration, type MigrationCandidate, type MigrationEvent, type PreparedMigration } from "./fileMigration.server";
import { digest } from "./reconciliation";
import { readSpaceFile, SpaceFileError } from "../spaceFiles.server";
import { buildFileCutoverRules } from "./fileCutoverRules";

const project = "demo-security-round1";
const app = initializeApp({ projectId: project });
const db = getFirestore(app), bucket = getStorage(app).bucket(`${project}.appspot.com`);
let env: RulesTestEnvironment, sequence = 0;
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8188");
  assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9199");
  process.env.FIREBASE_STORAGE_BUCKET = bucket.name;
  env = await initializeTestEnvironment({ projectId: project,
    firestore: { host: "127.0.0.1", port: 8188, rules: await readFile("firestore.rules", "utf8") },
    storage: { host: "127.0.0.1", port: 9199, rules: await readFile("storage.rules", "utf8") } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await db.doc("spaces/room").set({ ownerId: "teacher", schoolId: "schoolA" });
  for (const [uid, profile] of Object.entries({ pupil: { role: "student" }, other: { role: "student" }, teacher: { role: "teacher" }, foreign: { role: "teacher", plan: "pro" }, schooladmin: { role: "teacher", schoolRole: "school_admin", schoolId: "schoolA", schoolStatus: "active" } })) await db.doc(`users/${uid}`).set(profile);
  for (const uid of ["pupil", "other"]) await db.doc(`spaceMembers/room_${uid}`).set({ spaceId: "room", uid, participantId: uid, role: "student", status: "active" });
});
afterEach(() => mock.restoreAll());
after(async () => { await env.cleanup(); await deleteApp(app); });
const log: MigrationEvent[] = [];
const journal = async (event: MigrationEvent) => { log.push(event); };
const run = (plan: PreparedMigration) => applyLocalFileMigration(db, bucket, plan, plan.digest, journal);
function checksum(plan: PreparedMigration) { const { digest: _old, ...payload } = plan; void _old; plan.digest = digest(payload); return plan; }
async function fixture(podcast = false): Promise<MigrationCandidate[]> {
  const activity = `task${++sequence}`, submission = `room_${activity}_pupil`;
  await db.doc(`spaces/room/lessons/${activity}`).set({ title: "Synthetic" });
  const candidates: MigrationCandidate[] = [];
  const segments = podcast ? ["segment-1", "segment-2"] : [""];
  const data: Record<string, unknown> = { uid: "pupil", participantId: "pupil", spaceId: "room", assignmentId: activity, answers: { q: "DO_NOT_READ_ANSWERS" } };
  const productionSegments: Record<string, unknown> = {};
  for (const segment of segments) {
    const path = `spaces/room/assignments/${activity}/submissions/pupil/audio/${submission}-${podcast ? `podcast-${segment}` : "audio_reading"}.webm`;
    await bucket.file(path).save(Buffer.from([1, 2, 3]), { resumable: false, contentType: "audio/webm", metadata: { metadata: { firebaseStorageDownloadTokens: "synthetic-old-token" } } });
    const field = new FieldPath(...(podcast ? ["podcastWorkshop", "productionSegments", segment, "voice", "storagePath"] : ["audioReading", "storagePath"]));
    candidates.push({ source: { path }, references: [`spaces/room/lessons/${activity}/submissions/${submission}`, `spaceSubmissions/${submission}`].map(document => ({ document, field: field.toString() })) });
    const audioDataUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=synthetic-old-token`;
    if (podcast) productionSegments[segment] = { scriptText: "DO_NOT_READ_SCRIPT", voice: { storagePath: path, audioDataUrl } };
    else data.audioReading = { storagePath: path, audioDataUrl: "data:audio/webm;base64,DO_NOT_READ_INLINE" };
  }
  if (podcast) data.podcastWorkshop = { script: "DO_NOT_READ_SCRIPT", productionSegments };
  for (const document of candidates[0].references.map(reference => reference.document)) await db.doc(document).set(data);
  return candidates;
}

test("prepare is read-only, projects reference leaves and excludes scripts, inline recordings and bearer tokens", async () => {
  const candidates = await fixture();
  const original = db.getAll.bind(db);
  mock.method(db, "getAll", async (...args: Parameters<typeof db.getAll>) => {
    const options = args.at(-1) as { fieldMask: (string | FieldPath)[] };
    assert.ok(options.fieldMask.length > 0);
    assert.doesNotMatch(options.fieldMask.map(field => field.toString()).join("|"), /answers|script|audioDataUrl$/);
    return original(...args);
  });
  const plan = await prepareFileMigration(project, db, bucket, candidates);
  assert.equal(plan.items.length, 1); assert.deepEqual(plan.blocked, []);
  assert.doesNotMatch(JSON.stringify(plan), /DO_NOT_|synthetic-old-token|data:audio/);
  assert.ok(plan.items[0].source.md5Hash || plan.items[0].source.crc32c);
  assert.equal((await db.collection("privateSpaceFiles").get()).size, 0);
  assert.equal((await bucket.file(plan.items[0].destination).exists())[0], false);
});

test("two podcast segments in one submission migrate atomically across canonical and mirror references", async () => {
  const candidates = await fixture(true);
  const plan = await prepareFileMigration(project, db, bucket, candidates);
  assert.deepEqual(plan.blocked, []);
  assert.equal(plan.items.length, 2);
  const prototype = Object.getPrototypeOf(bucket.file(plan.items[0].source.path));
  const download = mock.method(prototype, "download", () => { throw new Error("Migration must never download media"); });
  const stream = mock.method(prototype, "createReadStream", () => { throw new Error("Migration must never stream media into the tool"); });
  try { assert.equal((await run(plan)).copied, 2); }
  finally { download.mock.restore(); stream.mock.restore(); }
  for (const item of plan.items) {
    for (const document of item.changes.map(change => change.document)) {
      const record = await db.doc(document).get();
      assert.equal(record.get(new FieldPath("podcastWorkshop", "productionSegments", item.scope.segmentId!, "voice", "storagePath")), item.destination);
      assert.equal(record.get(new FieldPath("podcastWorkshop", "productionSegments", item.scope.segmentId!, "voice", "audioDataUrl")), undefined);
      assert.equal(record.get("podcastWorkshop.script"), "DO_NOT_READ_SCRIPT", "Pupil content is unchanged");
    }
    assert.equal((await bucket.file(item.source.path).exists())[0], true, "Old files are deliberately not retired by this local phase");
    for (const uid of ["teacher", "pupil"]) {
      const response = await readSpaceFile(uid, item.id, null);
      assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
    }
    for (const uid of ["other", "foreign", "schooladmin"]) await assert.rejects(readSpaceFile(uid, item.id, null), error => error instanceof SpaceFileError && error.status === 403);
    await assertFails(getBytes(ref(env.authenticatedContext("pupil").storage(`gs://${bucket.name}`), item.destination)));
    await assertFails(getDownloadURL(ref(env.authenticatedContext("teacher").storage(`gs://${bucket.name}`), item.destination)));
    await db.doc("spaceMembers/room_pupil").update({ status: "removed" });
    await assert.rejects(readSpaceFile("pupil", item.id, null), error => error instanceof SpaceFileError && error.status === 403);
    await db.doc("spaceMembers/room_pupil").update({ status: "active" });
  }
});

test("a document change before copying stops without writing objects or references", async () => {
  const plan = await prepareFileMigration(project, db, bucket, await fixture());
  await db.doc(plan.items[0].changes[0].document).update({ changedDuringReview: true });
  await assert.rejects(run(plan), /document_changed_since_prepare/);
  assert.equal((await bucket.file(plan.items[0].destination).exists())[0], false);
  assert.equal((await db.collection("privateSpaceFiles").get()).size, 0);
});

test("a conflict after copying rolls back all Firestore writes and leaves private copies inaccessible", async () => {
  const plan = await prepareFileMigration(project, db, bucket, await fixture(true));
  assert.deepEqual(plan.blocked, []); assert.equal(plan.items.length, 2);
  let injected = false;
  await assert.rejects(applyLocalFileMigration(db, bucket, plan, plan.digest, async event => {
    if (event.action === "copied" && !injected) { injected = true; await db.doc(plan.items[0].changes[0].document).update({ changedDuringCopy: true }); }
  }));
  assert.equal((await db.collection("privateSpaceFiles").get()).size, 0);
  for (const item of plan.items) for (const change of item.changes.filter(change => change.segments.at(-1) === "storagePath")) assert.equal((await db.doc(change.document).get()).get(new FieldPath(...change.segments)), item.source.path);
});

test("interruption after copy can resume with the same manifest and repeat completion without overwriting", async () => {
  const plan = await prepareFileMigration(project, db, bucket, await fixture());
  let interrupted = false;
  await assert.rejects(applyLocalFileMigration(db, bucket, plan, plan.digest, async event => {
    if (event.action === "copied" && !interrupted) { interrupted = true; throw new Error("synthetic_process_interruption"); }
  }), /synthetic_process_interruption/);
  const [copied] = await bucket.file(plan.items[0].destination).getMetadata();
  assert.equal((await run(plan)).status, "committed");
  assert.equal((await run(plan)).status, "already_committed");
  assert.equal((await bucket.file(plan.items[0].destination).getMetadata())[0].generation, copied.generation);
  const change = plan.items[0].changes.find(change => change.segments.at(-1) === "storagePath")!;
  await db.doc(change.document).update(new FieldPath(...change.segments), plan.items[0].source.path);
  await assert.rejects(run(plan), /completed_migration_reference_changed/);
});

test("a late source metadata change after copy cannot be committed as a migrated asset", async () => {
  const plan = await prepareFileMigration(project, db, bucket, await fixture());
  await assert.rejects(applyLocalFileMigration(db, bucket, plan, plan.digest, async event => {
    if (event.action === "copied") await bucket.file(plan.items[0].source.path).setMetadata({ cacheControl: "private,max-age=90" });
  }), /source_changed_before_commit/);
  assert.equal((await db.collection("privateSpaceFiles").get()).size, 0);
});

test("changed object generation or metageneration stops the migration", async () => {
  for (const metadataOnly of [false, true]) {
    const plan = await prepareFileMigration(project, db, bucket, await fixture());
    const source = bucket.file(plan.items[0].source.path);
    if (metadataOnly) await source.setMetadata({ cacheControl: "private,max-age=20" });
    else await source.save(Buffer.from([9, 8, 7]), { resumable: false, contentType: "audio/webm" });
    await assert.rejects(run(plan), /source_changed_since_prepare/);
    assert.equal((await bucket.file(plan.items[0].destination).exists())[0], false);
  }
});

test("wrong approval, manifest tampering and attempts to rewrite profile fields are rejected", async () => {
  const plan = await prepareFileMigration(project, db, bucket, await fixture());
  await assert.rejects(applyLocalFileMigration(db, bucket, plan, "wrong", journal), /not_fully_approved/);
  const tampered = structuredClone(plan); tampered.items[0].ownerUid = "foreign";
  await assert.rejects(run(tampered), /invalid_manifest_digest/);
  const unsafe = structuredClone(plan); unsafe.items[0].changes[0].segments = ["role"];
  await assert.rejects(run(checksum(unsafe)), /unsafe_reference_update/);
  assert.equal((await db.collection("privateSpaceFiles").get()).size, 0);
});

test("an existing destination with conflicting checksum or ownership metadata cannot be overwritten", async () => {
  for (const defect of ["ownership", "checksum", "token"]) {
    const plan = await prepareFileMigration(project, db, bucket, await fixture());
    const item = plan.items[0];
    await bucket.file(item.destination).save(Buffer.from(defect === "checksum" ? [9, 8, 7] : [1, 2, 3]), { resumable: false, contentType: "audio/webm", metadata: {
      cacheControl: "private,no-store", metadata: { assetId: defect === "ownership" ? "foreign" : item.id, migrationDigest: plan.digest, spaceId: "room",
        ...(defect === "token" ? { firebaseStorageDownloadTokens: "synthetic-unwanted-token" } : {}) } } });
    const [before] = await bucket.file(item.destination).getMetadata();
    await assert.rejects(run(plan), /destination_integrity_or_privacy_mismatch/);
    assert.equal((await bucket.file(item.destination).getMetadata())[0].generation, before.generation);
    assert.equal((await db.collection("privateSpaceFiles").get()).size, 0);
  }
});

test("public writing images receive private reader URLs and retain pupil/teacher authorization", async () => {
  const activity = `writing${++sequence}`, submission = `room_${activity}_pupil`;
  await db.doc(`spaces/room/writingActivities/${activity}`).set({ title: "Synthetic" });
  const path = `covers/pupil/writing-print-room/${activity}/synthetic.webp`;
  await bucket.file(path).save(Buffer.from([4, 5]), { resumable: false, contentType: "image/webp" });
  const document = `spaces/room/writingActivities/${activity}/submissions/${submission}`;
  await db.doc(document).set({ uid: "pupil", participantId: "pupil", printProfile: { imageUrl: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=synthetic-token` } });
  const plan = await prepareFileMigration(project, db, bucket, [{ source: { path }, references: [{ document, field: "printProfile.imageUrl" }] }]);
  assert.deepEqual(plan.blocked, []);
  await run(plan);
  assert.equal((await db.doc(document).get()).get("printProfile.imageUrl"), `/api/space-files/${plan.items[0].id}`);
  const response = await readSpaceFile("teacher", plan.items[0].id, null);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [4, 5]);
  await assert.rejects(readSpaceFile("other", plan.items[0].id, null));
});

test("a historical pupil image referenced from a shared Space board cannot silently become visible to all pupils", async () => {
  const path = `covers/pupil/writing-print-room/task${++sequence}/shared.webp`;
  await bucket.file(path).save(Buffer.from([4, 5]), { resumable: false, contentType: "image/webp" });
  const plan = await prepareFileMigration(project, db, bucket, [{ source: { path }, references: [{ document: "spaces/room/board/state", field: "data.imageUrl" }] }]);
  assert.equal(plan.items.length, 0);
  assert.equal(plan.blocked[0].reason, "pupil_image_on_shared_board_requires_review");
  assert.equal((await db.collection("privateSpaceFiles").get()).size, 0);
});

test("unmapped files, ambiguous owners and stale inventory metadata remain blocked", async () => {
  const candidates = await fixture();
  const stale = structuredClone(candidates); stale[0].source.generation = "non-current";
  assert.equal((await prepareFileMigration(project, db, bucket, stale)).blocked[0].reason, "source_changed_since_inventory");
  await db.doc(candidates[0].references[0].document).update({ studentUid: "foreign" });
  assert.equal((await prepareFileMigration(project, db, bucket, candidates)).blocked[0].reason, "owner_missing_or_ambiguous");
  await db.doc(candidates[0].references[0].document).delete();
  assert.equal((await prepareFileMigration(project, db, bucket, candidates)).blocked[0].reason, "canonical_submission_missing");
  assert.equal((await db.collection("privateSpaceFiles").get()).size, 0);
});

test("one blocked file prevents implicit partial execution and missing local configuration prevents all writes", async () => {
  const candidates = await fixture();
  const plan = await prepareFileMigration(project, db, bucket, [...candidates, { source: { path: "unknown/synthetic.webm" }, references: [] }]);
  assert.equal(plan.blocked.length, 1);
  await assert.rejects(run(plan), /has_blockers/);
  const before = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  delete process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  try { await assert.rejects(run(plan), /local_emulators_required/); }
  finally { process.env.FIREBASE_STORAGE_EMULATOR_HOST = before; }
});

test("CLI refuses production execution before credentials or input are read", async () => {
  await assert.rejects(promisify(execFile)(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/security-file-migration.ts", "--mode", "apply-local", "--project", "skole-c09b8", "--input", ".vercel/absent.json", "--out", ".vercel/absent-journal.json"]), error => /Production writes and mixed configurations are disabled/.test(String((error as { stderr?: string }).stderr)));
});

test("derived cutover rules reject legacy metadata/token creation while preserving public teaching covers and private API reads", async () => {
  const plan = await prepareFileMigration(project, db, bucket, await fixture());
  await run(plan);
  const studentCover = "covers/pupil/writing-print-room/task/private.webp", teachingCover = "covers/teacher/lesson/public.webp";
  for (const path of [studentCover, teachingCover]) await bucket.file(path).save(Buffer.from([1]), { resumable: false, contentType: "image/webp" });
  const original = await readFile("storage.rules", "utf8");
  assert.throws(() => buildFileCutoverRules(original.replace("allow read: if canReadStudentAudio(spaceId, studentUid);", "allow read: if false;")), /requires_review/);
  const rules = buildFileCutoverRules(original);
  const start = async (storageRules: string) => initializeTestEnvironment({ projectId: project,
    firestore: { host: "127.0.0.1", port: 8188, rules: await readFile("firestore.rules", "utf8") },
    storage: { host: "127.0.0.1", port: 9199, rules: storageRules } });
  await env.cleanup(); env = await start(rules);
  try {
    const storage = env.authenticatedContext("pupil").storage(`gs://${bucket.name}`);
    await assertFails(getBytes(ref(storage, plan.items[0].source.path)));
    await assertFails(getDownloadURL(ref(storage, plan.items[0].source.path)));
    await assertFails(getBytes(ref(storage, studentCover)));
    await assertFails(getDownloadURL(ref(storage, studentCover)));
    assert.deepEqual([...new Uint8Array(await getBytes(ref(env.unauthenticatedContext().storage(`gs://${bucket.name}`), teachingCover)))], [1]);
    const response = await readSpaceFile("teacher", plan.items[0].id, null);
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
  } finally { await env.cleanup(); env = await start(original); }
});

test("CLI prepares a fresh plan and executes only an explicitly approved local manifest with a durable journal", async () => {
  const candidates = await fixture();
  const directory = await mkdtemp(".vercel/security-migration/cli-");
  const input = `${directory}/input.json`, output = `${directory}/manifest.json`, events = `${directory}/journal.jsonl`;
  await writeFile(input, JSON.stringify({ projectId: project, items: candidates.map(candidate => ({ ...candidate, source: { ...candidate.source, bucket: bucket.name } })) }));
  const execute = (args: string[]) => promisify(execFile)(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/security-file-migration.ts", "--project", project, ...args]);
  const prepared = await execute(["--input", input, "--out", output]);
  assert.equal(JSON.parse(prepared.stdout).readOnly, true);
  const manifest = JSON.parse(await readFile(output, "utf8"));
  const applied = await execute(["--mode", "apply-local", "--input", output, "--out", events, "--approve-digest", manifest.digest]);
  assert.equal(JSON.parse(applied.stdout).status, "committed");
  const journal = (await readFile(events, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(journal.map(event => event.action), ["started", "copied", "committed"]);
  assert.doesNotMatch(JSON.stringify(journal), /synthetic-old-token|answers|scriptText/);
});
