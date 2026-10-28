import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, FieldPath } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { getBytes, getDownloadURL, uploadBytes, deleteObject, ref } from "firebase/storage";
import { buildFourFileQuarantineRules } from "./fileQuarantineRules";

const project = "demo-security-round1", app = initializeApp({ projectId: project });
const db = getFirestore(app), bucket = getStorage(app).bucket(`${project}.appspot.com`);
let env: RulesTestEnvironment;
const paths = ["spaces/room/assignments/task/submissions/pupil/audio/reading-1.webm", "spaces/room/assignments/task/submissions/pupil/audio/reading-2.webm",
  "spaces/room/assignments/task/submissions/pupil/audio/podcast.webm", "covers/teacher/test/board.webp"];
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8188");
  assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9199");
  await db.doc("spaces/room").set({ ownerId: "teacher" });
  for (const uid of ["teacher", "pupil"]) await db.doc(`users/${uid}`).set({ role: uid === "teacher" ? "teacher" : "student" });
  // Exercise the deployed rules separately, without using any real object path or media.
  const base = process.env.QUARANTINE_RULES_BASE === "deployed"
    ? ".vercel/security-quarantine-approved/deployed-storage.current.rules" : "storage.rules";
  assert.ok(!process.env.QUARANTINE_RULES_BASE || ["deployed", "local"].includes(process.env.QUARANTINE_RULES_BASE));
  const rules = buildFourFileQuarantineRules(await readFile(base, "utf8"), paths);
  env = await initializeTestEnvironment({ projectId: project,
    firestore: { host: "127.0.0.1", port: 8188, rules: await readFile("firestore.rules", "utf8") }, storage: { host: "127.0.0.1", port: 9199, rules } });
});
after(async () => { await env.cleanup(); await deleteApp(app); });

test("clearing only the version-checked image leaf preserves the board, other activities and pupil responses", async () => {
  const board = db.doc("spaces/room/board/state");
  const original = { active: false, mode: "clock", data: { imageUrl: "https://synthetic.invalid/blocked", imagePrompt: "Synthetic task", title: "Synthetic title", quizQuestions: ["Synthetic"], clockGoals: "Synthetic" }, sessionId: "synthetic-session" };
  await board.set(original);
  const response = db.doc("spaces/room/boardResponses/synthetic");
  await response.set({ text: "Synthetic pupil response", sessionId: "synthetic-session" });
  const other = db.doc("spaces/room/lessons/other"); await other.set({ title: "Synthetic other lesson" });
  const [snapshot] = await db.getAll(board, { fieldMask: [new FieldPath("data", "imageUrl")] });
  await board.update(new FieldPath("data", "imageUrl"), "", { lastUpdateTime: snapshot.updateTime! });
  assert.deepEqual((await board.get()).data(), { ...original, data: { ...original.data, imageUrl: "" } });
  assert.equal((await response.get()).get("text"), "Synthetic pupil response");
  assert.deepEqual((await other.get()).data(), { title: "Synthetic other lesson" });
});

test("a new board image or concurrent activity update blocks clearing a stale reference", async () => {
  const board = db.doc("spaces/room/board/state");
  const before = await board.get();
  await board.update({ "data.imageUrl": "https://synthetic.invalid/new-legitimate-image" });
  await assert.rejects(board.update(new FieldPath("data", "imageUrl"), "", { lastUpdateTime: before.updateTime! }));
  assert.equal((await board.get()).get("data.imageUrl"), "https://synthetic.invalid/new-legitimate-image");
});

test("four-path rules deny bytes, token creation, overwrite and deletion without blocking other covers", async () => {
  const storage = env.authenticatedContext("teacher").storage(`gs://${bucket.name}`);
  for (const path of paths) {
    await bucket.file(path).save(Buffer.from([1, 2, 3]), { resumable: false, contentType: path.endsWith("webp") ? "image/webp" : "audio/webm" });
    await assertFails(getBytes(ref(storage, path)));
    await assertFails(getDownloadURL(ref(storage, path)));
    await assertFails(deleteObject(ref(storage, path)));
    await assertFails(uploadBytes(ref(storage, path), new Uint8Array([4]), { contentType: path.endsWith("webp") ? "image/webp" : "audio/webm" }));
  }
  const ordinary = "covers/teacher/test/unaffected.webp";
  await uploadBytes(ref(storage, ordinary), new Uint8Array([7, 8]), { contentType: "image/webp" });
  assert.deepEqual([...new Uint8Array(await getBytes(ref(env.unauthenticatedContext().storage(`gs://${bucket.name}`), ordinary)))], [7, 8]);
  const ordinaryAudio = "spaces/room/assignments/task/submissions/pupil/audio/unaffected.webm";
  await bucket.file(ordinaryAudio).save(Buffer.from([9, 10]), { resumable: false, contentType: "audio/webm" });
  assert.deepEqual([...new Uint8Array(await getBytes(ref(storage, ordinaryAudio)))], [9, 10]);
});

test("private copies preserve all four checksums before the old synthetic generations are removed", async () => {
  let oldUrl = "";
  await env.withSecurityRulesDisabled(async context => {
    oldUrl = await getDownloadURL(ref(context.storage(`gs://${bucket.name}`), paths[3]));
  });
  assert.equal(new URL(oldUrl).host, "127.0.0.1:9199");
  assert.equal((await fetch(oldUrl)).status, 200, "A real synthetic bearer URL bypasses the four-path rule until the source is retired");
  const originals = [];
  for (const [index, path] of paths.entries()) {
    const source = bucket.file(path), [metadata] = await source.getMetadata();
    const destinationPath = `private-file-quarantine/synthetic-${index}`;
    const destination = bucket.file(destinationPath);
    await bucket.file(path, { generation: metadata.generation }).copy(destination, { contentType: metadata.contentType,
      cacheControl: "private,no-store", predefinedAcl: "private", preconditionOpts: { ifGenerationMatch: 0 }, metadata: { firebaseStorageDownloadTokens: null } });
    const [copied] = await destination.getMetadata();
    assert.equal(copied.size, metadata.size); assert.equal(copied.md5Hash, metadata.md5Hash);
    assert.ok(copied.md5Hash || copied.crc32c); assert.ok(!copied.metadata?.firebaseStorageDownloadTokens);
    await assertFails(getDownloadURL(ref(env.authenticatedContext("teacher").storage(`gs://${bucket.name}`), destinationPath)));
    await assertFails(getBytes(ref(env.authenticatedContext("teacher").storage(`gs://${bucket.name}`), destinationPath)));
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(`gs://${bucket.name}`), destinationPath)));
    const inheritedToken = new URL(oldUrl);
    inheritedToken.pathname = `/v0/b/${bucket.name}/o/${encodeURIComponent(destinationPath)}`;
    assert.notEqual((await fetch(inheritedToken)).status, 200, "The old token must not read the quarantined copy");
    originals.push({ source, metadata, destination });
  }
  // This is deliberately synthetic-only; no production copy/delete runner exists.
  for (const { source, metadata, destination } of originals) {
    await bucket.file(source.name, { generation: metadata.generation, preconditionOpts: { ifGenerationMatch: metadata.generation } }).delete();
    assert.equal((await source.exists())[0], false);
    assert.equal((await destination.exists())[0], true);
  }
  assert.notEqual((await fetch(oldUrl)).status, 200, "Retiring the old object invalidates the old synthetic bearer URL");
  // The retired public path cannot be reused by an old browser upload.
  await assertFails(uploadBytes(ref(env.authenticatedContext("teacher").storage(`gs://${bucket.name}`), paths[3]), new Uint8Array([1]), { contentType: "image/webp" }));
});
