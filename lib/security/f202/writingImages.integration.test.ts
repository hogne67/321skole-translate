import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
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
import { ref, getBytes, getMetadata, getDownloadURL, uploadBytes, deleteObject } from "firebase/storage";
import { saveGeneratedSpaceImage } from "../../spaceFiles.server";
import { privateSpaceFileUrlId, type SpaceFileScope } from "../../spaceFiles";
import * as files from "../../../app/api/space-files/route";
import * as file from "../../../app/api/space-files/[id]/route";

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

function oidc(subject: string) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: "https://synthetic-idp.invalid", aud: "synthetic", sub: subject, email: `${subject}@synthetic.invalid`, email_verified: true })).toString("base64url");
  return new OAuthProvider("oidc.feide").credential({ idToken: `${header}.${payload}.` });
}
function storage(alias: Alias | null, authTime?: number) {
  return (alias ? env.authenticatedContext(uid(alias), authTime === undefined ? {} : { auth_time: authTime }) : env.unauthenticatedContext()).storage(`gs://${bucketName}`);
}
async function denied(operation: Promise<unknown>) {
  await assert.rejects(operation, (error: unknown) => (error as { code?: string }).code === "storage/unauthorized");
}
async function sdkRead(alias: Alias | null, object: string, authTime?: number) {
  try { assert.deepEqual(Buffer.from(await getBytes(ref(storage(alias, authTime), object))), png); }
  catch (error) { throw new Error(`Expected image read for ${alias ?? "anonymous"}: ${(error as Error).message}`, { cause: error }); }
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
  assert.ok(process.env.PHASE2_RESULT_DIR?.includes("security-f202-local"));
  for (const key of Object.keys(process.env)) assert.ok(!/^(GOOGLE_APPLICATION_CREDENTIALS|FIREBASE_ADMIN_|FIREBASE_TOKEN$)/.test(key));
  app = initializeApp({ projectId: project, storageBucket: bucketName }); db = getFirestore(app);
  env = await initializeTestEnvironment({ projectId: project, firestore: { host: "127.0.0.1", port: 8287, rules: await readFile("firestore.rules", "utf8") }, storage: { host: "127.0.0.1", port: 9297, rules: await readFile("storage.rules", "utf8") } });
  for (const alias of aliases) {
    const client = clientApp({ apiKey: "synthetic-api-key", projectId: project, authDomain: `${project}.invalid` }, `f202-${alias}`);
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
  for (const alias of ["pupil", "peer", "co"] as const) await db.doc(member(alias)).set({ uid: uid(alias), participantId: uid(alias), spaceId: "room", role: alias === "co" ? "co_teacher" : "student", status: "active", active: true, archived: false });
  await db.doc(member("schooladmin")).set({ uid: uid("schooladmin"), spaceId: "room", role: "school_admin", active: true });
  await db.doc(submissionPath()).set({ uid: uid("pupil"), studentUid: uid("pupil"), participantId: uid("pupil"), spaceId: "room", activityId: "writing", status: "draft", text: "Synthetic only", printProfile: { imageUrl: "" } });
});
after(async () => {
  await writeFile(path.join(process.env.PHASE2_RESULT_DIR!, "f202-results.json"), JSON.stringify({ project, syntheticOnly: true, observations }, null, 2), { flag: "wx" });
  await env?.cleanup(); for (const identity of Object.values(identities)) await deleteClientApp(identity.app); if (app) await deleteApp(app);
});

test("F202 legacy individual image: own pupil, owner and active co-teacher can read", async () => {
  const object = await legacy(); for (const alias of ["pupil", "owner", "co"] as const) await sdkRead(alias, object);
});
test("F202 legacy individual image: peer knowing the full object path cannot read bytes or metadata", async () => {
  const object = await legacy(); await denied(getBytes(ref(storage("peer"), object))); await denied(getMetadata(ref(storage("peer"), object)));
  await denied(getDownloadURL(ref(storage("peer"), object)));
});
test("F202 legacy individual image: anonymous, unrelated teacher and school administration cannot read", async () => {
  const object = await legacy(); for (const alias of [null, "foreign", "schooladmin", "dual"] as const) await denied(getBytes(ref(storage(alias), object)));
});
test("F202 legacy individual image: active participant alias remains private to its own pupil", async () => {
  await db.doc(member("pupil")).update({ participantId: "synthetic-legacy-participant" });
  const object = await legacy("writing-print-images", "synthetic-legacy-participant");
  await sdkRead("pupil", object); await sdkRead("co", object); await denied(getBytes(ref(storage("peer"), object)));
});
test("F202 legacy individual image: ordinary membership removal flags block the pupil and co-teacher", async () => {
  const object = await legacy();
  for (const flags of [{ status: "removed" }, { status: "REMOVED" }, { status: "disabled" }, { status: "revoked" }, { status: "inactive" }, { status: "linked" }, { active: false }, { archived: true }]) {
    for (const alias of ["pupil", "co"] as const) {
      await db.doc(member(alias)).set({ uid: uid(alias), spaceId: "room", role: alias === "co" ? "co_teacher" : "student", active: true, archived: false, status: "active", ...flags });
      await denied(getBytes(ref(storage(alias), object)));
    }
  }
});
test("F202 legacy individual image: deleted membership cannot be replaced by a stale legacy row", async () => {
  const object = await legacy(); await db.doc(member("pupil")).delete();
  await db.doc("spaceMembers/synthetic-stale-row").set({ uid: uid("pupil"), spaceId: "room", role: "student", status: "active" });
  await denied(getBytes(ref(storage("pupil"), object)));
});
test("F202 legacy individual and shared images: global profile deactivation overrides own and teaching access", async () => {
  const objects = [await legacy(), await legacy("board-images")];
  for (const alias of ["pupil", "owner", "co"] as const) {
    await db.doc(`users/${uid(alias)}`).update({ disabled: true });
    for (const object of objects) await denied(getBytes(ref(storage(alias), object)));
  }
});
test("F202 legacy individual image: mirrored token cutoff rejects old sessions and permits fresh auth", async () => {
  const object = await legacy(); await db.doc(`users/${uid("pupil")}`).update({ authRevokedBefore: 100 });
  for (const authTime of [99, 100]) await denied(getBytes(ref(storage("pupil", authTime), object)));
  await sdkRead("pupil", object, 101);
});
test("F202 shared board image: active pupils, owner and co-teacher retain access", async () => {
  const object = await legacy("board-images"); for (const alias of ["pupil", "peer", "owner", "co"] as const) await sdkRead(alias, object);
  for (const alias of [null, "foreign", "schooladmin"] as const) await denied(getBytes(ref(storage(alias), object)));
});
test("F202 shared board image: removed uploader and other removed member lose access", async () => {
  const object = await legacy("board-images");
  for (const alias of ["pupil", "peer"] as const) { await db.doc(member(alias)).update({ active: false, status: "removed" }); await denied(getBytes(ref(storage(alias), object))); }
  await sdkRead("owner", object);
});
test("F202 school administrator has no image privilege but retains separately granted teaching access", async () => {
  const object = await legacy(); await denied(getBytes(ref(storage("dual"), object)));
  await db.doc(member("dual")).set({ uid: uid("dual"), spaceId: "room", role: "co_teacher", status: "active" }); await sdkRead("dual", object);
});
test("F202 legacy SDK uploads remain denied and a peer cannot replace or delete an individual image", async () => {
  const object = await legacy();
  for (const alias of ["pupil", "owner", "peer"] as const) await denied(uploadBytes(ref(storage(alias), object), png, { contentType: "image/png" }));
  await denied(deleteObject(ref(storage("peer"), object))); await sdkRead("pupil", object);
});
test("F202 recognizable legacy cover images are closed while ordinary public covers stay public", async () => {
  const objects = [
    { path: `covers/${uid("pupil")}/writing-print-room/writing/${randomUUID()}.png`, metadata: {} },
    { path: `covers/${uid("pupil")}/writing-room-writing/ai-${randomUUID()}.webp`, metadata: { lessonId: "writing-room-writing", ownerId: uid("pupil"), generatedBy: "openai" } },
    { path: `covers/${uid("pupil")}/${randomUUID()}.png`, metadata: { context: "student_writing_print" } },
    { path: `covers/${uid("pupil")}/${randomUUID()}.png`, metadata: { context: "student-writing-print" } },
  ];
  for (const object of objects) {
    await getStorage(app).bucket(bucketName).file(object.path).save(png, { resumable: false, contentType: "image/png", metadata: { metadata: object.metadata } });
    for (const alias of [null, "peer", "pupil", "owner"] as const) await denied(getBytes(ref(storage(alias), object.path)));
  }
  const publicPath = `covers/${uid("owner")}/synthetic-public-${randomUUID()}.png`;
  await getStorage(app).bucket(bucketName).file(publicPath).save(png, { resumable: false, contentType: "image/png" }); await sdkRead(null, publicPath);
});
test("F202 private image HTTP route: own pupil and teachers allowed, peer and other schools denied", async () => {
  const saved = await privateImage(); for (const alias of ["pupil", "owner", "co"] as const) await apiRead(alias, saved.id, 200);
  for (const alias of ["peer", "foreign", "schooladmin", "dual"] as const) await apiRead(alias, saved.id, 403); await apiRead(null, saved.id, 401);
});
test("F202 private image bytes and metadata remain inaccessible to every direct Storage SDK client", async () => {
  const saved = await privateImage(); for (const alias of [null, "pupil", "owner", "co", "peer"] as const) {
    await denied(getBytes(ref(storage(alias), saved.storagePath))); await denied(getMetadata(ref(storage(alias), saved.storagePath)));
  }
});
test("F202 private shared board HTTP route: correct active Space members allowed", async () => {
  const saved = await privateImage("board_image"); for (const alias of ["pupil", "peer", "owner", "co"] as const) await apiRead(alias, saved.id, 200);
  for (const alias of ["foreign", "schooladmin"] as const) await apiRead(alias, saved.id, 403);
  await db.doc(member("peer")).update({ status: "removed", active: false }); await apiRead("peer", saved.id, 403);
});
test("F202 private image HTTP route: membership revocation and global deactivation block new reads", async () => {
  const saved = await privateImage(); await apiRead("pupil", saved.id, 200);
  await db.doc(member("pupil")).update({ status: "removed", active: false }); await apiRead("pupil", saved.id, 403);
  await db.doc(member("co")).update({ status: "removed", active: false }); await apiRead("co", saved.id, 403);
  await db.doc(`users/${uid("owner")}`).update({ disabled: true }); await apiRead("owner", saved.id, 403);
});
test("F202 private image HTTP route: disabled Auth account rejects its existing session", async () => {
  const saved = await privateImage(), existing = await request("pupil"); await getAuth(app).updateUser(uid("pupil"), { disabled: true });
  assert.equal((await file.GET(existing, ctx(saved.id))).status, 401);
});
test("F202 legitimate upload, completion, pupil reference save and teacher viewing remain available", async () => {
  const begin = await files.POST(await request("pupil", "POST", { ...scope(), contentType: "image/png", size: png.length })); assert.equal(begin.status, 200);
  const session = await begin.json() as { id: string; uploadUrl: string }; assert.match(session.uploadUrl, /^http:\/\/127\.0\.0\.1:9297\//);
  assert.equal((await fetch(session.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: png })).status, 200);
  const finish = await file.POST(await request("pupil", "POST"), ctx(session.id)); assert.equal(finish.status, 200);
  const saved = await finish.json() as { storagePath: string; imageUrl: string };
  await updateDoc(doc(env.authenticatedContext(uid("pupil")).firestore(), submissionPath()), { "printProfile.imageUrl": saved.imageUrl });
  assert.equal((await getDoc(doc(env.authenticatedContext(uid("owner")).firestore(), submissionPath()))).get("printProfile.imageUrl"), saved.imageUrl);
  await apiRead("pupil", session.id, 200); await apiRead("owner", session.id, 200); await apiRead("peer", session.id, 403);
});
test("F202 upload API rejects another pupil's individual scope and pupil-created shared board image", async () => {
  for (const [alias, fileScope] of [["peer", scope()], ["schooladmin", scope()], ["pupil", { spaceId: "room", activityId: "state", purpose: "board_image" }]] as const) {
    assert.equal((await files.POST(await request(alias, "POST", { ...fileScope, contentType: "image/png", size: png.length }))).status, 403);
  }
});
test("F202 trusted teacher board upload and peer viewing remain available", async () => {
  const begin = await files.POST(await request("owner", "POST", { spaceId: "room", activityId: "state", purpose: "board_image", contentType: "image/png", size: png.length })); assert.equal(begin.status, 200);
  const session = await begin.json() as { id: string; uploadUrl: string }; assert.match(session.uploadUrl, /^http:\/\/127\.0\.0\.1:9297\//);
  assert.equal((await fetch(session.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: png })).status, 200);
  const finish = await file.POST(await request("owner", "POST"), ctx(session.id)); assert.equal(finish.status, 200);
  const saved = await finish.json() as { imageUrl: string }; await db.doc("spaces/room/board/state").set({ data: { imageUrl: saved.imageUrl } }); await apiRead("peer", session.id, 200);
});
test("F202 old Firebase download token remains a separate capability despite SDK denial", async () => {
  const token = randomUUID(), object = await legacy("writing-print-images", uid("pupil"), { firebaseStorageDownloadTokens: token });
  const url = `http://127.0.0.1:9297/v0/b/${bucketName}/o/${encodeURIComponent(object)}?alt=media&token=${token}`;
  await denied(getBytes(ref(storage("peer"), object))); await denied(getDownloadURL(ref(storage("peer"), object)));
  await db.doc(`users/${uid("pupil")}`).update({ disabled: true }); await denied(getBytes(ref(storage("pupil"), object)));
  const response = await fetch(url); assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  const withoutToken = new URL(url); withoutToken.searchParams.delete("token");
  assert.ok([401, 403].includes((await fetch(withoutToken)).status));
  const wrongToken = new URL(url); wrongToken.searchParams.set("token", "synthetic-wrong-token");
  assert.ok([401, 403].includes((await fetch(wrongToken)).status));
  observations.push({ check: "known-limitation-download-token", details: { sdkPeer: "denied", sdkDisabledOwner: "denied", oldTokenAnonymousHTTP: 200, withoutToken: "denied", wrongToken: "denied", tokenLogged: false, cloudChanges: 0 } });
});
test("F202 owner-approved rejoining restores image access without undoing global deactivation", async () => {
  const object = await legacy(), saved = await privateImage(), before = (await db.doc(submissionPath()).get()).data();
  await db.doc(member("pupil")).update({ active: false, archived: true, status: "removed" });
  await denied(getBytes(ref(storage("pupil"), object))); await apiRead("pupil", saved.id, 403);
  const restore = () => updateDoc(doc(env.authenticatedContext(uid("owner")).firestore(), member("pupil")), { active: true, archived: false, status: "active" });
  await restore(); await sdkRead("pupil", object); await apiRead("pupil", saved.id, 200);
  await db.doc(`users/${uid("pupil")}`).update({ disabled: true }); await restore();
  await denied(getBytes(ref(storage("pupil"), object))); await apiRead("pupil", saved.id, 403);
  assert.deepEqual((await db.doc(submissionPath()).get()).data(), before);
});
test("F202 known F2-03 boundary: whitespace-only revocation marker still differs between legacy rules and private API", async () => {
  const object = await legacy(), saved = await privateImage();
  await db.doc(member("pupil")).update({ status: " removed ", active: true, archived: false });
  await sdkRead("pupil", object); await apiRead("pupil", saved.id, 403);
  observations.push({ check: "known-open-F2-03", details: { status: " removed ", legacyOwnImage: "allowed", privateOwnImageHTTP: 403, peerIsolationFixed: true, otherF2CodeChanged: false } });
});
