import assert from "node:assert/strict";
import { before, beforeEach, after, afterEach, test, mock } from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp as clientApp, deleteApp as deleteClientApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithCredential, OAuthProvider, type User } from "firebase/auth";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, writeBatch, runTransaction } from "firebase/firestore";
import { POST as createSpace } from "../../../app/api/teacher/spaces/create/route";
import { getSchoolStatistics } from "../../schools/server/aggregateStatistics";
import OpenAI from "openai";

const project = "demo-phase2-local";
const aliases = ["owner", "private", "pupil", "co", "schooladmin", "dual", "foreign", "platform", "parent"] as const;
type Alias = typeof aliases[number];
const identities = {} as Record<Alias, { uid: string; user: User; app: FirebaseApp }>;
let app: ReturnType<typeof initializeApp>, db: ReturnType<typeof getFirestore>, env: RulesTestEnvironment;
const uid = (alias: Alias) => identities[alias].uid;
const sdk = (alias: Alias) => env.authenticatedContext(uid(alias)).firestore();
const observations: { check: string; details: unknown }[] = [];
function oidc(subject: string) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: "https://synthetic-idp.invalid", aud: "synthetic", sub: subject, email: `${subject}@synthetic.invalid`, email_verified: true })).toString("base64url");
  return new OAuthProvider("oidc.feide").credential({ idToken: `${header}.${payload}.` });
}
async function request(alias: Alias | null, body: unknown) {
  return new Request("http://127.0.0.1/api/synthetic", { method: "POST", headers: {
    ...(alias ? { Authorization: `Bearer ${await identities[alias].user.getIdToken()}` } : {}), "Content-Type": "application/json",
  }, body: JSON.stringify(body) });
}
async function allowed(operation: Promise<unknown>) {
  try { await operation; return true; }
  catch (error) { if ((error as { code?: unknown }).code === "permission-denied") return false; throw error; }
}
async function denied(operation: Promise<unknown>, check: string) {
  const accepted = await allowed(operation);
  observations.push({ check, details: { accepted } });
  assert.equal(accepted, false, check);
}
function room(alias: Alias = "owner", schoolId: unknown = "schoolA") {
  return { ownerId: uid(alias), ownerUid: uid(alias), title: "Synthetic room", isOpen: false, schoolId };
}
async function membership(alias: Alias = "owner", schoolId = "schoolA", role = "school_teacher") {
  await db.doc(`users/${uid(alias)}`).update({ schoolId, schoolStatus: "active", schoolRole: role });
  await db.doc(`schools/${schoolId}/members/${uid(alias)}`).set({ uid: uid(alias), schoolId, role, status: "active" });
}
before(async () => {
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, project);
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8287");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9097");
  assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9297");
  assert.ok(process.env.PHASE2_RESULT_DIR?.includes("security-f204-local"));
  for (const key of Object.keys(process.env)) assert.ok(!/^(GOOGLE_APPLICATION_CREDENTIALS|FIREBASE_ADMIN_|FIREBASE_TOKEN$)/.test(key));
  app = initializeApp({ projectId: project }); db = getFirestore(app);
  env = await initializeTestEnvironment({ projectId: project, firestore: { host: "127.0.0.1", port: 8287, rules: await readFile("firestore.rules", "utf8") } });
  for (const alias of aliases) {
    const client = clientApp({ apiKey: "synthetic-api-key", projectId: project, authDomain: `${project}.invalid` }, `f204-${alias}`);
    connectAuthEmulator(getAuth(client), "http://127.0.0.1:9097", { disableWarnings: true });
    const user = (await signInWithCredential(getAuth(client), oidc(alias))).user;
    identities[alias] = { uid: user.uid, user, app: client };
  }
});
beforeEach(async () => {
  await env.clearFirestore();
  for (const alias of aliases) await db.doc(`users/${uid(alias)}`).set({ role: alias === "pupil" ? "student" : alias === "platform" ? "admin" : alias === "schooladmin" ? "school_admin" : alias === "parent" ? "parent" : "teacher", plan: "plus" });
  for (const schoolId of ["schoolA", "schoolB"]) await db.doc(`schools/${schoolId}`).set({ name: "Synthetic school", status: "active", teacherSeatLimit: 1 });
  await membership(); await membership("foreign", "schoolB");
  await membership("dual", "schoolA", "school_admin"); await membership("schooladmin", "schoolA", "school_admin");
  await db.doc("spaces/room").set(room());
  await db.doc("spaces/other").set(room("foreign", "schoolB"));
  await db.doc("spaces/private").set(room("owner", null));
  await db.doc("spaces/legacy").set({ ownerId: uid("owner"), title: "Synthetic legacy", isOpen: false });
  await db.doc(`spaceMembers/room_${uid("pupil")}`).set({ uid: uid("pupil"), participantId: uid("pupil"), spaceId: "room", role: "student", status: "active" });
  await db.doc(`spaceMembers/room_${uid("co")}`).set({ uid: uid("co"), spaceId: "room", role: "co_teacher", status: "active" });
});
afterEach(() => mock.restoreAll());
after(async () => {
  await writeFile(path.join(process.env.PHASE2_RESULT_DIR!, "f204-results.json"), JSON.stringify({ project, syntheticOnly: true, observations }, null, 2), { flag: "wx" });
  await env?.cleanup(); for (const identity of Object.values(identities)) await deleteClientApp(identity.app); if (app) await deleteApp(app);
});

for (const [name, value] of [["foreign school", "schoolB"], ["null", null], ["deletion", deleteField()], ["empty", ""], ["object", { id: "schoolB" }], ["array", ["schoolB"]], ["number", 1]] as const) {
  test(`F204 owner cannot update schoolId: ${name}`, async () => {
    await denied(updateDoc(doc(sdk("owner"), "spaces/room"), { schoolId: value }), name);
    assert.equal((await db.doc("spaces/room").get()).get("schoolId"), "schoolA");
  });
}
for (const alias of ["pupil", "co", "private", "schooladmin", "dual", "foreign", "platform"] as const) test(`F204 ${alias} cannot move existing room`, async () => {
  await denied(updateDoc(doc(sdk(alias), "spaces/room"), { schoolId: "schoolB" }), alias);
});
for (const id of ["private", "legacy"]) test(`F204 ${id} cannot be attached to school after creation`, async () => {
  await denied(updateDoc(doc(sdk("owner"), `spaces/${id}`), { schoolId: "schoolA" }), id);
});
test("F204 missing and null are distinct immutable representations", async () => {
  await denied(updateDoc(doc(sdk("owner"), "spaces/legacy"), { schoolId: null }), "missing to null");
  await denied(updateDoc(doc(sdk("owner"), "spaces/private"), { schoolId: deleteField() }), "null to missing");
});
test("F204 merge, overwrite, transaction and batch cannot change affiliation", async () => {
  const client = sdk("owner"), ref = doc(client, "spaces/room");
  await denied(setDoc(ref, { schoolId: "schoolB" }, { merge: true }), "merge");
  await denied(setDoc(ref, room("owner", null)), "overwrite");
  await denied(runTransaction(client, async tx => { await tx.get(ref); tx.update(ref, { schoolId: "schoolB" }); }), "transaction");
  const batch = writeBatch(client); batch.update(ref, { schoolId: "schoolB" }); batch.update(doc(client, "spaces/private"), { title: "Should roll back" });
  await denied(batch.commit(), "batch");
  assert.equal((await db.doc("spaces/private").get()).get("title"), "Synthetic room");
});
for (const alias of ["owner", "platform"] as const) test(`F204 ${alias} cannot delete and recreate retained Space contents`, async () => {
  const client = sdk(alias), ref = doc(client, "spaces/room");
  await db.doc("spaces/room/lessons/retained").set({ title: "Synthetic retained child" });
  await denied(deleteDoc(ref), "parent deletion");
  const batch = writeBatch(client); batch.delete(ref); batch.set(ref, room(alias, null));
  await denied(batch.commit(), "same-batch replacement");
  assert.equal((await db.doc("spaces/room/lessons/retained").get()).exists, true);
});
test("F204 legitimate metadata updates preserve current and legacy affiliation", async () => {
  for (const id of ["room", "private", "legacy"]) {
    const before = (await db.doc(`spaces/${id}`).get()).data()!;
    await updateDoc(doc(sdk("owner"), `spaces/${id}`), { title: "Synthetic renamed", isOpen: true, activeLessonId: "task" });
    const after = (await db.doc(`spaces/${id}`).get()).data()!;
    assert.equal(after.schoolId, before.schoolId); assert.equal("schoolId" in after, "schoolId" in before);
    assert.equal(after.title, "Synthetic renamed");
  }
  await updateDoc(doc(sdk("owner"), "spaces/room"), { schoolId: "schoolA", title: "Synthetic same school" });
  await db.doc("spaces/invalidLegacy").set(room("owner", ""));
  await updateDoc(doc(sdk("owner"), "spaces/invalidLegacy"), { title: "Synthetic legacy rename" });
});

type CreationCase = { name: string; expected: boolean; alias?: Alias; schoolId?: unknown; setup?: () => Promise<unknown> };
const creationCases: CreationCase[] = [
  { name: "private teacher without licence", expected: true, alias: "private" },
  { name: "private teacher after school removal", expected: true, setup: () => db.doc(`users/${uid("owner")}`).update({ schoolStatus: "disabled" }) },
  { name: "active licensed teacher at assigned seat limit", expected: true, schoolId: "schoolA" },
  { name: "dual school admin with independent teacher role", expected: true, alias: "dual", schoolId: "schoolA" },
  { name: "school admin alone", expected: false, alias: "schooladmin", schoolId: "schoolA" },
  { name: "pupil", expected: false, alias: "pupil", schoolId: "schoolA" },
  { name: "foreign school", expected: false, schoolId: "schoolB" },
  { name: "profile claim without member", expected: false, schoolId: "schoolA", setup: () => db.doc(`schools/schoolA/members/${uid("owner")}`).delete() },
  ...["disabled", "invited", " removed ", "unknown"].map(status => ({ name: `member ${status}`, expected: false, schoolId: "schoolA", setup: () => db.doc(`schools/schoolA/members/${uid("owner")}`).update({ status }) })),
  { name: "member uid mismatch", expected: false, schoolId: "schoolA", setup: () => db.doc(`schools/schoolA/members/${uid("owner")}`).update({ uid: uid("foreign") }) },
  { name: "member school mismatch", expected: false, schoolId: "schoolA", setup: () => db.doc(`schools/schoolA/members/${uid("owner")}`).update({ schoolId: "schoolB" }) },
  { name: "member role mismatch", expected: false, schoolId: "schoolA", setup: () => db.doc(`schools/schoolA/members/${uid("owner")}`).update({ role: "school_admin" }) },
  { name: "profile inactive", expected: false, schoolId: "schoolA", setup: () => db.doc(`users/${uid("owner")}`).update({ schoolStatus: "disabled" }) },
  { name: "profile role mismatch", expected: false, schoolId: "schoolA", setup: () => db.doc(`users/${uid("owner")}`).update({ schoolRole: "other" }) },
  { name: "missing school", expected: false, schoolId: "schoolA", setup: () => db.doc("schools/schoolA").delete() },
  { name: "inactive school", expected: false, schoolId: "schoolA", setup: () => db.doc("schools/schoolA").update({ status: "inactive" }) },
  { name: "invalid seat limit", expected: false, schoolId: "schoolA", setup: () => db.doc("schools/schoolA").update({ teacherSeatLimit: 0 }) },
  { name: "globally disabled profile", expected: false, schoolId: "schoolA", setup: () => db.doc(`users/${uid("owner")}`).update({ disabled: true }) },
  { name: "canonical member without optional school field", expected: true, schoolId: "schoolA", setup: () => db.doc(`schools/schoolA/members/${uid("owner")}`).set({ uid: uid("owner"), role: "school_teacher", status: "active" }) },
];
for (const row of creationCases) test(`F204 creation SDK and API: ${row.name}`, async () => {
  await row.setup?.(); const alias = row.alias ?? "owner";
  const data = { ...room(alias, row.schoolId ?? null), title: "Synthetic new room" };
  const sdkAccepted = await allowed(setDoc(doc(sdk(alias), "spaces/newSdk"), data));
  const response = await createSpace(await request(alias, { title: data.title, schoolId: row.schoolId ?? null, isOpen: false }));
  const payload = await response.json();
  observations.push({ check: row.name, details: { sdkAccepted, apiStatus: response.status, expected: row.expected } });
  assert.equal(sdkAccepted, row.expected, "SDK"); assert.equal(response.status, row.expected ? 200 : 403, "API");
  if (row.expected) {
    const saved = (await db.doc(`spaces/${payload.spaceId}`).get()).data()!;
    assert.equal(saved.schoolId, row.schoolId ?? null); assert.equal(saved.ownerId, uid(alias));
    assert.equal((await db.doc(`spaceJoinCodes/${payload.code}`).get()).get("spaceId"), payload.spaceId);
  } else {
    assert.equal((await db.doc("spaces/newSdk").get()).exists, false);
    assert.equal((await db.collection("spaceJoinCodes").get()).empty, true);
  }
});
test("F204 parent can create and use private family Space without school membership", async () => {
  const client = sdk("parent");
  await setDoc(doc(client, "spaces/family"), { ownerId: uid("parent"), title: "Synthetic family", isOpen: false, kind: "family" });
  await updateDoc(doc(client, "spaces/family"), { title: "Synthetic family renamed" });
  assert.equal((await getDoc(doc(client, "spaces/family"))).get("kind"), "family");
  await membership("parent");
  await denied(setDoc(doc(client, "spaces/schoolFamily"), { ...room("parent", "schoolA"), kind: "family" }), "parent school scope");
});
test("F204 private teacher retains own room after licence removal", async () => {
  await db.doc(`schools/schoolA/members/${uid("owner")}`).update({ status: "disabled" });
  await db.doc(`users/${uid("owner")}`).update({ schoolStatus: "disabled" });
  const client = sdk("owner");
  await updateDoc(doc(client, "spaces/private"), { title: "Synthetic private retained" });
  await setDoc(doc(client, "spaces/private/lessons/new"), { title: "Synthetic own lesson" });
  assert.equal((await getDoc(doc(client, "spaces/private/lessons/new"))).get("title"), "Synthetic own lesson");
  assert.notEqual((await db.doc(`users/${uid("owner")}`).get()).get("disabled"), true);
});
test("F204 existing school affiliation remains when teacher is licensed elsewhere", async () => {
  await membership("owner", "schoolB");
  await denied(updateDoc(doc(sdk("owner"), "spaces/room"), { schoolId: "schoolB" }), "current licence cannot move room");
  await updateDoc(doc(sdk("owner"), "spaces/room"), { title: "Synthetic own old room" });
});
test("F204 API cannot select an existing document or inject affiliation/seat grants", async () => {
  const before = (await db.doc("spaces/room").get()).data();
  const response = await createSpace(await request("owner", { title: "Synthetic new", schoolId: "schoolA", spaceId: "room", ownerId: uid("foreign"), school: { id: "schoolB" }, teacherSeatLimit: 999, roles: { admin: true } }));
  assert.equal(response.status, 200);
  const { spaceId } = await response.json(); assert.notEqual(spaceId, "room");
  assert.deepEqual((await db.doc("spaces/room").get()).data(), before);
  const saved = (await db.doc(`spaces/${spaceId}`).get()).data()!;
  assert.equal(saved.ownerId, uid("owner")); assert.equal(saved.school, undefined); assert.equal(saved.teacherSeatLimit, undefined);
  assert.equal((await db.doc("schools/schoolA").get()).get("teacherSeatLimit"), 1);
});
test("F204 failure to read creation authorization fails closed", async () => {
  const before = (await db.collection("spaces").get()).size;
  mock.method(db, "runTransaction", async () => { throw new Error("Synthetic unavailable authorization store"); });
  assert.equal((await createSpace(await request("owner", { title: "Synthetic failed", schoolId: "schoolA" }))).status, 503);
  assert.equal((await db.collection("spaces").get()).size, before);
  assert.equal((await db.collection("spaceJoinCodes").get()).empty, true);
});
test("F204 writing assignment API preserves affiliation and ordinary teaching access", async () => {
  const { POST } = await import("../../../app/api/teacher/spaces/[spaceId]/writing-activities/route");
  for (const alias of ["owner", "co", "pupil", "schooladmin", "dual", "foreign"] as const) {
    const response = await POST(await request(alias, { title: "Synthetic writing", schoolId: "schoolB", ownerId: uid("foreign"), teacherSeatLimit: 999 }), { params: Promise.resolve({ spaceId: "room" }) });
    assert.equal(response.status, ["owner", "co"].includes(alias) ? 200 : 403, alias);
    assert.equal((await db.doc("spaces/room").get()).get("schoolId"), "schoolA");
    assert.equal((await db.doc("spaces/room").get()).get("ownerId"), uid("owner"));
  }
  assert.equal((await db.doc("schools/schoolA").get()).get("teacherSeatLimit"), 1);
});
test("F204 archived Planner share handler preserves assignment metadata; active route stays paused", async () => {
  const { POST } = await import("../../../app/api/teacher/planner/[plannerId]/share-space/plannerHandlers.paused");
  await db.doc("planners/synthetic").set({ ownerUid: uid("owner"), document: { title: "Synthetic plan", periods: [] }, frame: { subject: "Synthetic" } });
  const response = await POST(await request("owner", { spaceId: "room", schoolId: "schoolB", ownerId: uid("foreign") }), { params: Promise.resolve({ plannerId: "synthetic" }) });
  assert.equal(response.status, 200);
  const data = (await db.doc("spaces/room").get()).data()!;
  assert.equal(data.schoolId, "schoolA"); assert.equal(data.ownerId, uid("owner")); assert.ok(data.activeLessonId);
  assert.equal((await POST(await request("dual", { spaceId: "room", schoolId: "schoolB" }), { params: Promise.resolve({ plannerId: "synthetic" }) })).status, 403);
});
test("F204 affiliation and seat/statistics grants cannot be injected through room metadata", async () => {
  const beforeA = await getSchoolStatistics(db, "schoolA"), beforeB = await getSchoolStatistics(db, "schoolB");
  await denied(updateDoc(doc(sdk("owner"), "spaces/room"), { schoolId: "schoolB", totalSpaceCount: 999 }), "statistics transfer");
  await updateDoc(doc(sdk("owner"), "spaces/room"), { school: { id: "schoolB" }, teacherSeatLimit: 999, activeTeacherCount: 0, totalSpaceCount: 999 });
  assert.deepEqual(await getSchoolStatistics(db, "schoolA"), beforeA); assert.deepEqual(await getSchoolStatistics(db, "schoolB"), beforeB);
  await denied(updateDoc(doc(sdk("owner"), "schools/schoolA"), { teacherSeatLimit: 999 }), "seat grant");
  await denied(updateDoc(doc(sdk("private"), `users/${uid("private")}`), { schoolId: "schoolA", schoolRole: "school_teacher", schoolStatus: "active" }), "profile grant");
  await denied(setDoc(doc(sdk("private"), `schools/schoolA/members/${uid("private")}`), { uid: uid("private"), role: "school_teacher", status: "active" }), "membership grant");
  assert.equal((await db.collection("schools/schoolA/members").where("role", "==", "school_teacher").where("status", "==", "active").get()).size, 1);
});
test("F204 school administration returns own aggregate only and cannot read pupil content", async () => {
  const { GET: schoolSpaces } = await import("../../../app/api/schools/[schoolId]/spaces/route");
  const { GET: summary } = await import("../../../app/api/schools/[schoolId]/route");
  const { POST: feedback } = await import("../../../app/api/teacher/ai-feedback/route");
  const submission = `room_task_${uid("pupil")}`;
  await db.doc("spaces/room/lessons/task").set({ title: "Synthetic lesson" });
  await db.doc(`spaces/room/lessons/task/submissions/${submission}`).set({ uid: uid("pupil"), participantId: uid("pupil"), spaceId: "room", assignmentId: "task", answers: { q: "Synthetic only" }, aiFeedback: { text: "Synthetic private" } });
  let calls = 0; mock.method(OpenAI.Responses.prototype, "create", async () => { calls++; return { output_text: "Synthetic" }; });
  for (const alias of ["schooladmin", "dual"] as const) {
    const own = await schoolSpaces(await request(alias, {}), { params: Promise.resolve({ schoolId: "schoolA" }) });
    assert.equal(own.status, 200); assert.deepEqual(await own.json(), { ok: true, schoolId: "schoolA", totalSpaceCount: 1 });
    const ownSummary = await summary(await request(alias, {}), { params: Promise.resolve({ schoolId: "schoolA" }) });
    assert.equal(ownSummary.status, 200);
    const aggregate = await ownSummary.json();
    assert.equal(aggregate.activeTeacherCount, 1); assert.equal(aggregate.teacherSeatLimit, 1);
    assert.equal(aggregate.usageStats.totalSpaceCount, 1); assert.equal(aggregate.usageStats.totalActivityCount, 1);
    assert.equal(aggregate.usageStats.submissions.countRange, null);
    assert.equal(aggregate.submissions, undefined);
    assert.equal((await summary(await request(alias, {}), { params: Promise.resolve({ schoolId: "schoolB" }) })).status, 403);
    await denied(getDoc(doc(sdk(alias), `spaces/room/lessons/task/submissions/${submission}`)), "individual school admin");
    assert.equal((await feedback(await request(alias, { spaceId: "room", assignmentId: "task", subId: submission }))).status, 403);
  }
  assert.equal(calls, 0);
});
