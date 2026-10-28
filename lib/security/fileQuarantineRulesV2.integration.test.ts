import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { getBytes, getMetadata, getDownloadURL, updateMetadata, uploadBytes, deleteObject, listAll, ref } from "firebase/storage";
import { buildFourFileQuarantineRulesV2 as build } from "./fileQuarantineRulesV2";

const project = "demo-security-round1", bucketName = `${project}.appspot.com`;
const paths = ["spaces/synthetic/a.wav", "spaces/synthetic/b.wav", "spaces/synthetic/c.wav", "covers/synthetic/bilde-vår.png"];
const base = `rules_version = '2'; service firebase.storage { match /b/{bucket}/o {
  match /spaces/{p=**} { allow read, write: if request.auth != null; }
  match /covers/{p=**} { allow read; allow write: if request.auth != null; }
  match /private-file-quarantine/{p=**} { allow read, write: if false; }
  match /{p=**} { allow read, write: if false; }
} }`;
let env: RulesTestEnvironment;
const app = initializeApp({ projectId: project, storageBucket: bucketName }, "quarantine-rules-v2-local");
const bucket = getStorage(app).bucket(bucketName), db = getFirestore(app);
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8188");
  assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9199");
  assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  env = await initializeTestEnvironment({ projectId: project, storage: { host: "127.0.0.1", port: 9199, rules: base } });
  await db.doc("users/teacher").set({ role: "teacher" });
});
after(async () => { await env?.cleanup(); await deleteApp(app); });
async function rules(content: string) {
  const response = await fetch("http://127.0.0.1:9199/internal/setRules", { method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules: { files: [{ name: "storage.rules", content }] } }), redirect: "manual" });
  assert.equal(response.status, 200, await response.text());
}
const storage = () => env.authenticatedContext("teacher").storage(`gs://${bucketName}`);
async function seed(path: string) { await bucket.file(path).save(Buffer.from([1, 2, 3]), { resumable: false, metadata: { contentType: "image/png" } }); }
async function denied(promise: Promise<unknown>) { await assert.rejects(promise, (error: unknown) => (error as { code: string }).code === "storage/unauthorized"); }

test("four existing paths deny bytes, metadata, token lookup, overwrite, metadata changes and deletion", async () => {
  await rules(build(base, paths));
  for (const path of paths) {
    await seed(path);
    const file = ref(storage(), path), [before] = await bucket.file(path).getMetadata();
    await denied(getBytes(file)); await denied(getMetadata(file)); await denied(getDownloadURL(file));
    await denied(uploadBytes(file, new Uint8Array([4]), { contentType: "image/png" }));
    await denied(updateMetadata(file, { cacheControl: "public" })); await denied(deleteObject(file));
    const [after] = await bucket.file(path).getMetadata();
    assert.equal(after.generation, before.generation); assert.equal(after.metageneration, before.metageneration);
  }
});
test("four absent paths cannot be created or reused after privileged synthetic retirement", async () => {
  for (const path of paths) {
    await bucket.file(path).delete();
    await denied(uploadBytes(ref(storage(), path), new Uint8Array([8]), { contentType: "image/png" }));
    assert.equal((await bucket.file(path).exists())[0], false);
  }
});
test("unaffected siblings retain read, create, overwrite, metadata change, delete and anonymous read behavior", async () => {
  for (const path of ["spaces/synthetic/unaffected.wav", "covers/synthetic/unaffected.png", "covers/other/unaffected.png", paths[3] + ".extra"]) {
    const file = ref(storage(), path);
    await uploadBytes(file, new Uint8Array([5]), { contentType: "image/png" });
    assert.equal((await getBytes(file)).byteLength, 1);
    await uploadBytes(file, new Uint8Array([6, 7]), { contentType: "image/png" });
    await updateMetadata(file, { cacheControl: "private,no-store" });
    assert.equal((await getMetadata(file)).cacheControl, "private,no-store");
    assert.equal((await getBytes(file)).byteLength, 2);
    if (path.startsWith("covers/")) assert.equal((await getBytes(ref(env.unauthenticatedContext().storage(`gs://${bucketName}`), path))).byteLength, 2);
    await deleteObject(file); assert.equal((await bucket.file(path).exists())[0], false);
  }
});
test("baseline-denied anonymous writes and private quarantine access stay denied", async () => {
  const anonymous = env.unauthenticatedContext().storage(`gs://${bucketName}`);
  await denied(uploadBytes(ref(anonymous, "covers/other/anonymous.png"), new Uint8Array([1])));
  await seed("private-file-quarantine/control.png");
  await denied(getBytes(ref(storage(), "private-file-quarantine/control.png")));
  await denied(uploadBytes(ref(storage(), "private-file-quarantine/control-new.png"), new Uint8Array([1])));
});
test("list requests cannot enumerate blocked ancestors; unrelated prefixes retain listing", async () => {
  await seed(paths[3]); await seed("covers/unrelated-list/control.png");
  await denied(listAll(ref(storage(), "covers/synthetic")));
  await denied(listAll(ref(storage(), "covers")));
  await denied(listAll(ref(storage(), "")));
  assert.equal((await listAll(ref(storage(), "covers/unrelated-list"))).items.length, 1);
});
test("a second overlapping unconditional allow cannot bypass the four path gates", async () => {
  await rules(build(base.replace("allow read, write: if false; }\n}", "allow read, write; }\n}"), paths));
  await seed(paths[0]); await denied(getBytes(ref(storage(), paths[0])));
  await denied(uploadBytes(ref(storage(), paths[1]), new Uint8Array([1])));
});
test("the previously failing cloud fixture now keeps the positive control readable", async () => {
  const control = "covers/synthetic/public-control.png";
  const source = `rules_version='2'; service firebase.storage { match /b/{bucket}/o { match /{object=**} {
    allow read: if resource.name in ${JSON.stringify([...paths, control])}; allow write: if false;
  } } }`;
  await rules(build(source, paths));
  for (const path of [...paths, control]) await seed(path);
  const anonymous = env.unauthenticatedContext().storage(`gs://${bucketName}`);
  for (const path of paths) await denied(getBytes(ref(anonymous, path)));
  assert.equal((await getBytes(ref(anonymous, control))).byteLength, 3);
});
for (const [label, file] of [["current local", "storage.rules"], ["captured deployed", ".vercel/security-quarantine-approved/deployed-storage.current.rules"]]) {
  test(`${label} policy compiles, blocks all four paths and preserves an ordinary teaching cover`, async () => {
    await rules(build(await readFile(file, "utf8"), paths));
    for (const path of paths) { await seed(path); await denied(getBytes(ref(storage(), path))); }
    const ordinary = "covers/teacher/synthetic-v2/unaffected.png", object = ref(storage(), ordinary);
    await uploadBytes(object, new Uint8Array([9]), { contentType: "image/png" });
    assert.equal((await getBytes(object)).byteLength, 1);
    await updateMetadata(object, { cacheControl: "private,no-store" });
    await deleteObject(object);
  });
}
