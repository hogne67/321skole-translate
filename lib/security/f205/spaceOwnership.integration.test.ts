import assert from "node:assert/strict";
import { before, beforeEach, after, afterEach, test, mock } from "node:test";
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
import { doc, getDoc, updateDoc, setDoc, deleteField, collection, getDocs, query, where, connectFirestoreEmulator } from "firebase/firestore";
import { ref, getBytes } from "firebase/storage";
import { saveGeneratedSpaceImage } from "../../spaceFiles.server";
import { privateSpaceFileUrlId, type SpaceFileScope } from "../../spaceFiles";

import { getSpaceAccess } from "../spaceAccess.server";
import { getSpaceOwnerUid, hasSpaceOwnerAccess } from "../spaceOwnership";
import { legacySpaceImageProxyUrl, parseLegacySpaceImagePath } from "../legacySpaceImage";



import * as file from "../../../app/api/space-files/[id]/route";

import OpenAI from "openai";

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
let providerCalls = 0;

function oidc(subject: string) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: "https://synthetic-idp.invalid", aud: "synthetic", sub: subject, email: `${subject}@synthetic.invalid`, email_verified: true })).toString("base64url");
  return new OAuthProvider("oidc.feide").credential({ idToken: `${header}.${payload}.` });
}
function storage(alias: Alias | null, authTime?: number) {
  return (alias ? env.authenticatedContext(uid(alias), authTime === undefined ? {} : { auth_time: authTime }) : env.unauthenticatedContext()).storage(`gs://${bucketName}`);
}
async function sdkRead(alias: Alias | null, object: string, authTime?: number) {
  assert.deepEqual(Buffer.from(await getBytes(ref(storage(alias, authTime), object))), png);
}
async function legacy(kind: "writing-print-images" | "board-images" = "writing-print-images", owner = uid("pupil"), custom: Record<string, string> = {}) {
  const object = `${kind}/${owner}/room/${kind === "writing-print-images" ? "legacy-writing/" : ""}${randomUUID()}.png`;
  await getStorage(app).bucket(bucketName).file(object).save(png, { resumable: false, contentType: "image/png", metadata: { cacheControl: "private,no-store", metadata: custom } });
  // S02 C requires a canonical attachment. Use a separate legacy activity so
  // positive legacy reads do not detach the newer private-image fixture.
  if (kind === "board-images") await db.doc("spaces/room/board/state").set({ data: { imageUrl: object } });
  else {
    await db.doc("spaces/room/writingActivities/legacy-writing").set({ title: "Synthetic retained writing" });
    await db.doc(`spaces/room/writingActivities/legacy-writing/submissions/room_legacy-writing_${owner}`).set({
      uid: owner, participantId: owner, studentUid: owner, spaceId: "room", activityId: "legacy-writing",
      status: "draft", text: "Synthetic retained answer", printProfile: { imageUrl: object },
    });
  }
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

before(async () => {
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, project);
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8287");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9097");
  assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9297");
  assert.ok(process.env.PHASE2_RESULT_DIR?.includes("security-f205-local"));
  for (const key of Object.keys(process.env)) assert.ok(!/^(GOOGLE_APPLICATION_CREDENTIALS|FIREBASE_ADMIN_|FIREBASE_TOKEN$)/.test(key));
  app = initializeApp({ projectId: project, storageBucket: bucketName }); db = getFirestore(app);
  env = await initializeTestEnvironment({ projectId: project, firestore: { host: "127.0.0.1", port: 8287, rules: await readFile("firestore.rules", "utf8") }, storage: { host: "127.0.0.1", port: 9297, rules: await readFile("storage.rules", "utf8") } });
  for (const alias of aliases) {
    const client = clientApp({ apiKey: "synthetic-api-key", projectId: project, authDomain: `${project}.invalid` }, `f205-${alias}`);
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
  await db.doc("spaces/room/lessons/task").set({ title: "Synthetic lesson", sourceText: "Synthetic source", tasks: [{ id: "q", type: "open", prompt: "Synthetic question" }] });
  await db.doc(`spaces/room/lessons/task/submissions/room_task_${uid("pupil")}`).set({ uid:uid("pupil"), participantId:uid("pupil"), spaceId:"room", assignmentId:"task", status:"draft", answers:{q:"Synthetic only"} });
  for (const alias of ["pupil", "peer", "co"] as const) await db.doc(member(alias)).set({ uid: uid(alias), participantId: uid(alias), spaceId: "room", role: alias === "co" ? "co_teacher" : "student", status: "active", active: true, archived: false });
  await db.doc(member("schooladmin")).set({ uid: uid("schooladmin"), spaceId: "room", role: "school_admin", active: true });
  await db.doc(submissionPath()).set({ uid: uid("pupil"), studentUid: uid("pupil"), participantId: uid("pupil"), spaceId: "room", activityId: "writing", status: "draft", text: "Synthetic only", printProfile: { imageUrl: "" } });
  providerCalls = 0;
  mock.method(OpenAI.Responses.prototype, "create", async () => { providerCalls++; return { output_text: "Synthetic feedback" }; });
});
afterEach(() => mock.restoreAll());
after(async () => {
  await writeFile(path.join(process.env.PHASE2_RESULT_DIR!, "f205-results.json"), JSON.stringify({ project, syntheticOnly: true, observations }, null, 2), { flag: "wx" });
  await env?.cleanup(); for (const identity of Object.values(identities)) await deleteClientApp(identity.app); if (app) await deleteApp(app);
});

async function allowed(operation: Promise<unknown>) {
  try { await operation; return true; }
  catch (error) {
    const underlying = error instanceof Error && error.cause ? error.cause : error;
    if (["permission-denied", "storage/unauthorized"].includes(String((underlying as { code?: unknown }).code))) return false;
    throw error;
  }
}

const fields: { name: string; data: () => Record<string, unknown>; owner: Alias | null }[] = [
  { name: "ownerId only", data: () => ({ ownerId: uid("owner") }), owner: "owner" },
  { name: "ownerUid only", data: () => ({ ownerUid: uid("owner") }), owner: "owner" },
  { name: "matching fields", data: () => ({ ownerId: uid("owner"), ownerUid: uid("owner") }), owner: "owner" },
  { name: "conflicting fields", data: () => ({ ownerId: uid("owner"), ownerUid: uid("foreign") }), owner: null },
  { name: "both missing", data: () => ({}), owner: null },
  { name: "null primary", data: () => ({ ownerId: null, ownerUid: uid("owner") }), owner: null },
  { name: "empty primary", data: () => ({ ownerId: "", ownerUid: uid("owner") }), owner: null },
  { name: "boolean primary", data: () => ({ ownerId: false, ownerUid: uid("owner") }), owner: null },
  { name: "array primary", data: () => ({ ownerId: [uid("owner")], ownerUid: uid("owner") }), owner: null },
  { name: "null secondary", data: () => ({ ownerId: uid("owner"), ownerUid: null }), owner: null },
  { name: "empty secondary", data: () => ({ ownerId: uid("owner"), ownerUid: "" }), owner: null },
  { name: "whitespace primary", data: () => ({ ownerId: ` ${uid("owner")} ` }), owner: null },
  { name: "teacherId only", data: () => ({ teacherId: uid("owner") }), owner: null },
  { name: "createdBy only", data: () => ({ createdBy: uid("owner"), createdByUid: uid("owner"), uid: uid("owner") }), owner: null },
  { name: "foreign provenance is not ownership", data: () => ({ ownerId: uid("owner"), createdBy: uid("foreign"), teacherId: uid("foreign") }), owner: "owner" },
];
const lessonPath = () => `spaces/room/lessons/task/submissions/room_task_${uid("pupil")}`;
async function assess(alias: Alias) {
  const image = await privateImage(), old = await legacy(), board = await legacy("board-images");
  const client = env.authenticatedContext(uid(alias)).firestore();
  const { POST: feedback } = await import("../../../app/api/teacher/ai-feedback/route");
  const { PATCH: rename } = await import("../../../app/api/teacher/spaces/[spaceId]/members/[memberId]/route");
  const { POST: code } = await import("../../../app/api/teacher/spaces/[spaceId]/members/[memberId]/student-code/route");
  const { GET: roster } = await import("../../../app/api/teacher/spaces/[spaceId]/members/create-student/route");
  const memberCtx = { params: Promise.resolve({ spaceId: "room", memberId: `room_${uid("pupil")}` }) };
  const feedbackResponse = await feedback(await request(alias, "POST", { spaceId: "room", assignmentId: "task", subId: `room_task_${uid("pupil")}` }));
  const renameResponse = await rename(await request(alias, "PATCH", { displayName: "Synthetic allowed rename" }), memberCtx);
  const codeResponse = await code(await request(alias, "POST", { mode: "regenerate" }), memberCtx);
  const rosterResponse = await roster(await request(alias), { params: Promise.resolve({ spaceId: "room" }) });
  const fileResponse = await file.GET(await request(alias), ctx(image.id));
  const { GET: legacyImage } = await import("../../../app/api/space-files/legacy-image/route");
  const imageRequest = new Request(`http://127.0.0.1/api/space-files/legacy-image?path=${encodeURIComponent(old)}`, { headers: { Authorization: `Bearer ${await identities[alias].user.getIdToken()}` } });
  const legacyResponse = await legacyImage(imageRequest);
  assert.ok([200, 403].includes(legacyResponse.status), `Legacy proxy ${legacyResponse.status}`);
  if (legacyResponse.status === 200) assert.deepEqual(Buffer.from(await legacyResponse.arrayBuffer()), png);
  for (const response of [feedbackResponse, renameResponse, codeResponse, rosterResponse, fileResponse]) assert.ok([200, 403, 409].includes(response.status), `Unexpected API ${response.status}: ${await response.clone().text()}`);
  const actual = {
    server: (await getSpaceAccess(db, "room", uid(alias))).canTeach,
    firestoreRead: await allowed(getDoc(doc(client, lessonPath()))),
    firestoreFeedback: await allowed(updateDoc(doc(client, lessonPath()), { teacherFeedback: { text: "Synthetic authorized review" } })),
    firestoreMetadata: await allowed(updateDoc(doc(client, "spaces/room"), { title: "Synthetic allowed title" })),
    storageIndividual: await allowed(sdkRead(alias, old)), storageBoard: await allowed(sdkRead(alias, board)),
    privateFile: fileResponse.status === 200, legacyProxy: legacyResponse.status === 200, feedback: feedbackResponse.status === 200,
    members: renameResponse.status === 200, code: codeResponse.status === 200, roster: rosterResponse.status === 200,
  };
  return actual;
}
for (const row of fields) for (const alias of ["owner", "foreign"] as const) test(`F205 owner matrix: ${row.name}; ${alias}`, async () => {
  await db.doc("spaces/room").set({ title: "Synthetic room", schoolId: "schoolA", isOpen: false, ...row.data() });
  const actual = await assess(alias), expected = row.owner === alias;
  assert.equal(providerCalls, expected ? 1 : 0);
  assert.equal(getSpaceOwnerUid(row.data()), row.owner ? uid(row.owner) : null);
  observations.push({ check: `${row.name}/${alias}`, details: { expected, actual } });
  for (const [layer, value] of Object.entries(actual)) assert.equal(value, layer.startsWith("storage") ? false : expected, `${row.name}/${alias}/${layer}`);
});

for (const patch of [() => ({ ownerId: uid("foreign") }), () => ({ ownerUid: uid("foreign") }), () => ({ ownerId: deleteField() }), () => ({ ownerUid: uid("owner") }), () => ({ ownerId: null })]) test(`F205 owner identity cannot be changed: ${patch.toString()}`, async () => {
  assert.equal(await allowed(updateDoc(doc(env.authenticatedContext(uid("owner")).firestore(), "spaces/room"), patch())), false);
});
test("F205 new Space cannot inject a secondary owner", async () => {
  const client = env.authenticatedContext(uid("owner")).firestore();
  assert.equal(await allowed(setDoc(doc(client, "spaces/forged"), { ownerId: uid("owner"), ownerUid: uid("foreign"), title: "Synthetic forged", isOpen: false })), false);
});
for (const status of ["active", " removed ", "disabled", "unknown"]) test(`F205 explicit owner membership: ${status}`, async () => {
  await db.doc(member("owner")).set({ uid: uid("owner"), spaceId: "room", role: "teacher", status });
  const actual = await assess("owner");
  for (const [layer, value] of Object.entries(actual)) assert.equal(value, layer.startsWith("storage") ? false : status === "active", layer);
});
test("F205 conflicting fields do not remove independent teaching membership", async () => {
  await db.doc("spaces/room").update({ ownerUid: uid("foreign") });
  const access = await getSpaceAccess(db, "room", uid("co")); assert.equal(access.canTeach, true);
  assert.equal(await allowed(getDoc(doc(env.authenticatedContext(uid("co")).firestore(), lessonPath()))), true);
  const { POST } = await import("../../../app/api/teacher/ai-feedback/route");
  assert.equal((await POST(await request("co", "POST", { spaceId: "room", assignmentId: "task", subId: `room_task_${uid("pupil")}` }))).status, 200);
});
test("F205 school-admin provenance never becomes a teaching grant", async () => {
  await db.doc("spaces/room").update({ ownerUid: uid("schooladmin"), createdBy: uid("schooladmin"), teacherId: uid("schooladmin") });
  const actual = await assess("schooladmin"); for (const value of Object.values(actual)) assert.equal(value, false);
});
test("F205 global disable overrides verified ownership", async () => {
  await db.doc(`users/${uid("owner")}`).update({ disabled: true });
  const old = await legacy(); assert.equal(await allowed(sdkRead("owner", old)), false);
  assert.equal((await getSpaceAccess(db, "room", uid("owner"))).canTeach, false);
  assert.equal(await allowed(getDoc(doc(env.authenticatedContext(uid("owner")).firestore(), lessonPath()))), false);
});
test("F205 ownership cannot change schoolId and licence removal retains private ownership", async () => {
  const client = env.authenticatedContext(uid("owner")).firestore();
  assert.equal(await allowed(updateDoc(doc(client, "spaces/room"), { schoolId: "schoolB" })), false);
  await db.doc(`users/${uid("owner")}`).update({ schoolStatus: "disabled" });
  await db.doc("spaces/room").update({ schoolId: null });
  assert.equal((await getSpaceAccess(db, "room", uid("owner"))).canTeach, true);
  await updateDoc(doc(client, "spaces/room"), { title: "Synthetic retained private" });
});
test("F205 owner discovery diagnostic preserves valid room alongside a conflicting room", async () => {
  await db.doc("spaces/ambiguous").set({ ownerId: uid("owner"), ownerUid: uid("foreign"), title: "Synthetic ambiguous" });
  const client = env.authenticatedContext(uid("owner")).firestore();
  let result: unknown;
  try { result = (await getDocs(query(collection(client, "spaces"), where("ownerId", "==", uid("owner"))))).docs.map(doc => doc.id); }
  catch (error) { if ((error as { code?: unknown }).code !== "permission-denied") throw error; result = "permission-denied"; }
  observations.push({ check: "SDK discovery diagnostic", details: result });
  assert.equal(result, "permission-denied");
});

for (const flags of [{ status: "active", active: false }, { status: "active", archived: true }, { status: "active", active: "true" }, { status: null }, { active: true }, { status: " ACTIVE ", active: true, archived: false }]) test(`F205 owner membership veto: ${JSON.stringify(flags)}`, async () => {
  await db.doc(member("owner")).set({ uid: uid("owner"), spaceId: "room", role: "teacher", ...flags });
  const permitted = flags.status === " ACTIVE ";
  const actual = await assess("owner"); for (const [layer, value] of Object.entries(actual)) assert.equal(value, layer.startsWith("storage") ? false : permitted);
});
for (const alias of ["pupil", "co", "owner"] as const) test(`F205 ${alias} cannot disable owner membership`, async () => {
  const original = { uid: uid("owner"), spaceId: "room", role: "teacher", status: "active", active: true, archived: false };
  await db.doc(member("owner")).set(original);
  const client = env.authenticatedContext(uid(alias)).firestore();
  assert.equal(await allowed(updateDoc(doc(client, member("owner")), { status: "removed", active: false })), false);
  const { DELETE } = await import("../../../app/api/teacher/spaces/[spaceId]/staff/route");
  const requestWithQuery = new Request(`http://127.0.0.1/api/synthetic?uid=${uid("owner")}`, { method: "DELETE", headers: { Authorization: `Bearer ${await identities[alias].user.getIdToken()}` } });
  assert.equal((await DELETE(requestWithQuery, { params: Promise.resolve({ spaceId: "room" }) })).status, 403);
  assert.deepEqual((await db.doc(member("owner")).get()).data(), original);
});
test("F205 platform-authorized owner deactivation and reactivation preserve ownership and content", async () => {
  await db.doc(member("owner")).set({ uid: uid("owner"), spaceId: "room", role: "teacher", status: "active" });
  await db.doc(`users/${uid("foreign")}`).update({ role: "admin" });
  const { DELETE } = await import("../../../app/api/teacher/spaces/[spaceId]/staff/route");
  const requestWithQuery = new Request(`http://127.0.0.1/api/synthetic?uid=${uid("owner")}`, { method: "DELETE", headers: { Authorization: `Bearer ${await identities.foreign.user.getIdToken()}` } });
  assert.equal((await DELETE(requestWithQuery, { params: Promise.resolve({ spaceId: "room" }) })).status, 200);
  const access = await getSpaceAccess(db, "room", uid("owner")); assert.equal(access.canTeach, false);
  assert.equal((await db.doc("spaces/room").get()).get("ownerId"), uid("owner"));
  assert.equal((await db.doc(lessonPath()).get()).exists, true);
  await updateDoc(doc(env.authenticatedContext(uid("foreign")).firestore(), member("owner")), { status: "active", active: true, archived: false });
  assert.equal((await getSpaceAccess(db, "room", uid("owner"))).canTeach, true);
});
test("F205 owned enumeration and client retain entydige legacy rooms without exposing conflicts", async () => {
  await db.doc("spaces/uidOnly").set({ ownerUid: uid("owner"), title: "Synthetic legacy", createdAt: new Date() });
  await db.doc("spaces/conflict").set({ ownerId: uid("owner"), ownerUid: uid("foreign"), title: "Synthetic conflict" });
  await db.doc("spaces/provenance").set({ teacherId: uid("owner"), createdBy: uid("owner"), title: "Synthetic provenance" });
  const { GET } = await import("../../../app/api/spaces/owned/route");
  const response = await GET(await request("owner")); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private,no-store");
  assert.deepEqual((await response.json()).spaces.map((row: { id: string }) => row.id).sort(), ["room", "uidOnly"]);
  const { loadOwnedSpaces } = await import("../ownedSpaces.client");
  const originalFetch = globalThis.fetch;
  mock.method(globalThis, "fetch", (input: RequestInfo | URL, init?: RequestInit) => input === "/api/spaces/owned" ? GET(new Request("http://127.0.0.1/api/spaces/owned", init)) : originalFetch(input, init));
  const client = env.authenticatedContext(uid("owner")).firestore() as unknown as Parameters<typeof loadOwnedSpaces>[0];
  const loaded = await loadOwnedSpaces(client, uid("owner"), identities.owner.user);
  assert.deepEqual(loaded.map(row => row.id).sort(), ["room", "uidOnly"]);
  assert.equal(typeof (loaded.find(row => row.id === "uidOnly")!.data.createdAt as { toMillis?: unknown }).toMillis, "function");
  await db.doc(member("owner")).set({ uid: uid("owner"), spaceId: "room", role: "teacher", status: "removed" });
  assert.deepEqual((await loadOwnedSpaces(client, uid("owner"), identities.owner.user)).map(row => row.id), ["uidOnly"]);
  assert.equal(hasSpaceOwnerAccess({ ownerUid: uid("owner") }, uid("owner"), null), true);
});
test("F205 owned enumeration rejects actor substitution, anonymous, disabled profile and disabled Auth", async () => {
  const { GET } = await import("../../../app/api/spaces/owned/route");
  assert.equal((await GET(await request(null))).status, 401);
  assert.equal((await GET(new Request(`http://127.0.0.1/api/spaces/owned?uid=${uid("foreign")}`, { headers: { Authorization: `Bearer ${await identities.owner.user.getIdToken()}` } }))).status, 400);
  await db.doc(`users/${uid("owner")}`).update({ disabled: true }); assert.equal((await GET(await request("owner"))).status, 403);
  await db.doc(`users/${uid("owner")}`).update({ disabled: false }); const existing = await request("owner");
  await getAuth(app).updateUser(uid("owner"), { disabled: true }); assert.equal((await GET(existing)).status, 401);
});
test("F205 legacy proxy path and bucket validation never fetches arbitrary URLs", async () => {
  for (const value of ["../../secret", "board-images/u/room/x/extra", "writing-print-images/u/room/../x", "https://synthetic.invalid/x", "private-space-files/x"]) assert.equal(parseLegacySpaceImagePath(value), null);
  const source = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent("board-images/u/room/x.png")}?alt=media&token=synthetic-old-token`;
  assert.equal(legacySpaceImageProxyUrl(source, bucketName), `/api/space-files/legacy-image?path=${encodeURIComponent("board-images/u/room/x.png")}`);
  assert.equal(legacySpaceImageProxyUrl(source, "foreign-bucket"), null);
  assert.equal(legacySpaceImageProxyUrl(source.replace("firebasestorage.googleapis.com", "synthetic.invalid"), bucketName), null);
  const { GET } = await import("../../../app/api/space-files/legacy-image/route");
  assert.equal((await GET(new Request("http://127.0.0.1/api/space-files/legacy-image?path=../../secret", { headers: { Authorization: `Bearer ${await identities.owner.user.getIdToken()}` } }))).status, 400);
});
test("F205 geometry assignment rejects an actor lacking any valid Space teaching grant", async () => {
  const { POST } = await import("../../../app/api/spaces/[spaceId]/geometry-assign/route");
  await db.doc("spaces/room").update({ ownerUid: uid("foreign") });
  const response = await POST(await request("foreign", "POST", { worksheet: { synthetic: true }, title: "Synthetic forbidden" }), { params: Promise.resolve({ spaceId: "room" }) });
  assert.equal(response.status, 403);
});
test("F205 feedback notification rejects an actor lacking any valid Space teaching grant", async () => {
  const { POST } = await import("../../../app/api/notifications/teacher-feedback/route");
  await db.doc("spaces/room").update({ ownerUid: uid("foreign") });
  const response = await POST(await request("foreign", "POST", { spaceId: "room", assignmentId: "task", subId: `room_task_${uid("pupil")}` }));
  assert.equal(response.status, 403);
});
test("F205 geometry and feedback notification retain legitimate owner and co-teacher access", async () => {
  const { POST: geometry } = await import("../../../app/api/spaces/[spaceId]/geometry-assign/route");
  const { POST: notify } = await import("../../../app/api/notifications/teacher-feedback/route");
  for (const alias of ["owner", "co"] as const) {
    assert.equal((await geometry(await request(alias, "POST", { worksheet: { synthetic: true }, title: "Synthetic allowed" }), { params: Promise.resolve({ spaceId: "room" }) })).status, 200);
    assert.equal((await notify(await request(alias, "POST", { spaceId: "room", assignmentId: "task", subId: `room_task_${uid("pupil")}` }))).status, 200);
  }
  await db.doc(member("owner")).set({ uid: uid("owner"), spaceId: "room", role: "teacher", status: "removed" });
  assert.equal((await geometry(await request("owner", "POST", { worksheet: { synthetic: true } }), { params: Promise.resolve({ spaceId: "room" }) })).status, 403);
  assert.equal((await notify(await request("owner", "POST", { spaceId: "room", assignmentId: "task", subId: `room_task_${uid("pupil")}` }))).status, 403);
});
test("F205 parent family creation uses a valid active canonical owner membership", async () => {
  await db.doc(`users/${uid("dual")}`).update({ role: "parent" });
  const client = env.authenticatedContext(uid("dual")).firestore();
  await setDoc(doc(client, "spaces/family"), { ownerId: uid("dual"), title: "Synthetic family", kind: "family", isOpen: false });
  const memberRef = doc(client, `spaceMembers/family_${uid("dual")}`);
  assert.equal(await allowed(setDoc(memberRef, { spaceId: "family", uid: uid("dual"), role: "parent" })), false);
  await setDoc(memberRef, { spaceId: "family", uid: uid("dual"), role: "parent", status: "active", active: true, archived: false });
  await updateDoc(doc(client, "spaces/family"), { title: "Synthetic family update" });
  await updateDoc(memberRef, { displayName: "Synthetic parent" });
  assert.equal(await allowed(updateDoc(memberRef, { status: "removed" })), false);
  assert.equal((await getSpaceAccess(db, "family", uid("dual"))).owner, true);
});
test("F205 ownerUid-only legacy identity remains immutable", async () => {
  await db.doc("spaces/room").set({ ownerUid: uid("owner"), title: "Synthetic legacy" });
  const client = env.authenticatedContext(uid("owner")).firestore();
  await updateDoc(doc(client, "spaces/room"), { title: "Synthetic renamed legacy" });
  for (const patch of [{ ownerId: uid("owner") }, { ownerUid: uid("foreign") }, { ownerUid: deleteField() }]) assert.equal(await allowed(updateDoc(doc(client, "spaces/room"), patch)), false);
});
test("F205 legacy image proxy preserves pupil privacy and shared board access after owner revocation", async () => {
  const individual = await legacy(), board = await legacy("board-images");
  const { GET } = await import("../../../app/api/space-files/legacy-image/route");
  for (const alias of ["pupil", "peer", "co", "owner"] as const) for (const object of [individual, board]) {
    const response = await GET(new Request(`http://127.0.0.1/api/space-files/legacy-image?path=${encodeURIComponent(object)}`, { headers: { Authorization: `Bearer ${await identities[alias].user.getIdToken()}` } }));
    assert.equal(response.status, object === individual && alias === "peer" ? 403 : 200);
  }
  await db.doc(member("owner")).set({ uid: uid("owner"), spaceId: "room", role: "teacher", status: "removed" });
  for (const object of [individual, board]) assert.equal((await GET(new Request(`http://127.0.0.1/api/space-files/legacy-image?path=${encodeURIComponent(object)}`, { headers: { Authorization: `Bearer ${await identities.owner.user.getIdToken()}` } }))).status, 403);
});
test("F205 roster creation and staff/link APIs reject conflicting ownership without writes", async () => {
  await db.doc("spaces/room").update({ ownerUid: uid("foreign") });
  const before = (await db.collection("spaceMembers").get()).size;
  const { POST: pupil } = await import("../../../app/api/teacher/spaces/[spaceId]/members/create-student/route");
  const { POST: staff } = await import("../../../app/api/teacher/spaces/[spaceId]/staff/route");
  const { POST: link } = await import("../../../app/api/teacher/spaces/[spaceId]/lessons/[assignmentId]/submissions/[subId]/link-student/route");
  for (const alias of ["owner", "foreign", "schooladmin"] as const) {
    assert.ok([403, 409].includes((await pupil(await request(alias, "POST", { displayName: "Synthetic blocked pupil" }), { params: Promise.resolve({ spaceId: "room" }) })).status));
    assert.equal((await staff(await request(alias, "POST", { email: "co@synthetic.invalid", role: "co_teacher" }), { params: Promise.resolve({ spaceId: "room" }) })).status, 403);
    assert.equal((await link(await request(alias, "POST", { studentCode: "ABCDE" }), { params: Promise.resolve({ spaceId: "room", assignmentId: "task", subId: `room_task_${uid("pupil")}` }) })).status, 403);
  }
  assert.equal((await db.collection("spaceMembers").get()).size, before);
});
test("F205 owner policy uses stored own fields and never prototype properties", () => {
  assert.equal(getSpaceOwnerUid(Object.create({ ownerId: uid("owner") })), null);
  assert.equal(getSpaceOwnerUid({ ownerId: uid("owner"), ownerUid: undefined }), null);
  assert.equal(getSpaceOwnerUid({ ownerId: uid("owner"), createdBy: uid("foreign") }), uid("owner"));
});
test("F205 owned client subscription refreshes revocation and stops cleanly", async () => {
  const defaultApp = clientApp({ apiKey: "synthetic-api-key", projectId: project, authDomain: `${project}.invalid` });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let stop: (() => void) | undefined;
  try {
    const client = await import("../../firebase");
    connectAuthEmulator(client.auth, "http://127.0.0.1:9097", { disableWarnings: true });
    connectFirestoreEmulator(client.db, "127.0.0.1", 8287);
    assert.equal((await signInWithCredential(client.auth, oidc("owner"))).user.uid, uid("owner"));
    const surface = new EventTarget();
    Object.defineProperty(globalThis, "window", { configurable: true, value: surface });
    const { GET } = await import("../../../app/api/spaces/owned/route");
    const originalFetch = globalThis.fetch; let apiCalls = 0;
    mock.method(globalThis, "fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/spaces/owned") { apiCalls++; return GET(new Request("http://127.0.0.1/api/spaces/owned", init)); }
      return originalFetch(input, init);
    });
    const { subscribeOwnedSpaces } = await import("../ownedSpaces.client");
    let current: string[] | null = null; const errors: unknown[] = [];
    stop = subscribeOwnedSpaces(client.db, uid("owner"), rows => { current = rows.map(row => row.id); }, error => errors.push(error));
    async function until(predicate: () => boolean) {
      const limit = Date.now() + 8000;
      while (!predicate()) { if (Date.now() > limit) throw new Error("Synthetic subscription timeout"); await new Promise(resolve => setTimeout(resolve, 25)); }
    }
    await until(() => current?.includes("room") === true);
    await db.doc(member("owner")).set({ uid: uid("owner"), spaceId: "room", role: "teacher", status: "removed" });
    surface.dispatchEvent(new Event("focus"));
    await until(() => current !== null && current.length === 0);
    assert.deepEqual(errors, []);
    stop(); stop = undefined;
    const calls = apiCalls; surface.dispatchEvent(new Event("focus"));
    await new Promise(resolve => setTimeout(resolve, 100)); assert.equal(apiCalls, calls);
  } finally {
    stop?.();
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window");
    await deleteClientApp(defaultApp);
  }
});
