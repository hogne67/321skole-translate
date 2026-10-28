import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, after, test, mock } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { Readable } from "node:stream";
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, collectionGroup, doc, getDoc, getDocs, query, setDoc, updateDoc, deleteDoc, deleteField, where, serverTimestamp, increment } from "firebase/firestore";
import { ref, uploadBytes, getBytes, deleteObject } from "firebase/storage";
import OpenAI from "openai";

const projectId = "demo-security-round1";
let env: RulesTestEnvironment;
const app = initializeApp({ projectId });
const db = getFirestore(app);
const denied = assertFails;
let aiCalls = 0;
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8188", "Local emulator required");
  assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9199", "Local storage emulator required");
  assert.equal(process.env.OPENAI_API_KEY, "isolated-test-no-network");
  env = await initializeTestEnvironment({ projectId,
    firestore: { host: "127.0.0.1", port: 8188, rules: await readFile("firestore.rules", "utf8") },
    storage: { host: "127.0.0.1", port: 9199, rules: await readFile("storage.rules", "utf8") },
  });
  await env.clearFirestore();
  for (const [id, profile] of Object.entries({ owner: { role: "teacher", plan: "plus" }, other: { role: "teacher", plan: "plus" },
    coteacher: { role: "teacher", plan: "plus" }, admin: { role: "admin", plan: "plus" },
    schooladmin: { role: "teacher", plan: "plus", schoolId: "schoolA", schoolRole: "school_admin", schoolStatus: "active" },
    foreignadmin: { role: "teacher", plan: "plus", schoolId: "schoolB", schoolRole: "school_admin", schoolStatus: "active" },
    pupil: { role: "student" }, removed: { role: "student" }, disabled: { role: "student" }, revoked: { role: "student" }, inactive: { role: "student" },
    archived: { role: "student" }, removedteacher: { role: "teacher", plan: "plus" } })) await db.doc(`users/${id}`).set(profile);
  await db.doc("spaces/room").set({ ownerId: "owner", title: "Synthetic room", schoolId: "schoolA", isOpen: true });
  await db.doc("spaces/room/lessons/task").set({ title: "Synthetic task", sourceText: "Synthetic source", tasks: [{ id: "q", type: "open", prompt: "Synthetic question" }] });
  await db.doc("spaces/room/writingActivities/writing").set({ ownerUid: "owner", title: "Synthetic writing" });
  for (const uid of ["pupil", "removed", "disabled", "revoked", "inactive", "archived", "removedteacher", "coteacher"]) {
    const member = { spaceId: "room", uid, participantId: uid, role: uid.includes("teacher") ? "teacher" : "student", active: true, archived: false, status: "active" };
    if (["removed", "disabled", "revoked", "inactive", "removedteacher"].includes(uid)) member.status = uid === "removedteacher" ? "removed" : uid;
    if (uid === "archived") member.archived = true;
    await db.doc(`spaceMembers/room_${uid}`).set(member);
    const data = { uid, studentUid: uid, participantId: uid, spaceId: "room", assignmentId: "task", status: "submitted", answers: { q: "Synthetic answer" } };
    await db.doc(`spaces/room/lessons/task/submissions/${uid}`).set(data);
    await db.doc(`spaceSubmissions/${uid}`).set(data);
    await db.doc(`spaces/room/writingActivities/writing/submissions/${uid}`).set({ ...data, activityId: "writing" });
  }
  mock.method(getAuth(app), "verifyIdToken", async (token: string) => {
    if (token === "invalid") throw new Error("Invalid token");
    return { uid: token, firebase: { sign_in_provider: "oidc.feide" } };
  });
  mock.method(OpenAI.Responses.prototype, "create", async () => { aiCalls++; return { output_text: "Synthetic feedback" }; });
});
after(async () => { mock.restoreAll(); await env?.cleanup(); await deleteApp(app); });

test("school administrator alone cannot read pupil answers, feedback, membership lists or teaching data", async () => {
  const client = env.authenticatedContext("schooladmin").firestore();
  for (const path of ["spaces/room", "spaceMembers/room_pupil", "spaces/room/lessons/task", "spaces/room/lessons/task/submissions/pupil", "spaceSubmissions/pupil", "spaces/room/writingActivities/writing/submissions/pupil"]) {
    await assertFails(getDoc(doc(client, path)));
  }
  await assertFails(getDocs(query(collection(client, "spaces"), where("schoolId", "==", "schoolA"))));
  const { getSpaceAccess } = await import("./spaceAccess.server");
  assert.equal((await getSpaceAccess(db, "room", "schooladmin")).canTeach, false);
  const { POST } = await import("../../app/api/teacher/ai-feedback/route");
  const before = aiCalls;
  assert.equal((await POST(request("schooladmin", { spaceId: "room", assignmentId: "task", subId: "pupil" }))).status, 403);
  assert.equal(aiCalls, before);
});

test("school administrator retains ordinary owner and explicit co-teacher access, including audio and feedback", async () => {
  const client = env.authenticatedContext("schooladmin");
  const path = "spaces/room/assignments/task/submissions/pupil/audio/dual-role.webm";
  await env.withSecurityRulesDisabled(async context => { await uploadBytes(ref(context.storage(), path), new Uint8Array([1, 2]), { contentType: "audio/webm" }); });
  await assertFails(getBytes(ref(client.storage(), path)));
  await db.doc("spaces/room").update({ ownerId: "schooladmin" });
  try {
    await assertSucceeds(getDoc(doc(client.firestore(), "spaces/room/lessons/task/submissions/pupil")));
    await assertSucceeds(getBytes(ref(client.storage(), path)));
    const { POST } = await import("../../app/api/teacher/ai-feedback/route");
    assert.equal((await POST(request("schooladmin", { spaceId: "room", assignmentId: "task", subId: "pupil" }))).status, 200);
  } finally { await db.doc("spaces/room").update({ ownerId: "owner" }); }
  await db.doc("spaceMembers/room_schooladmin").set({ spaceId: "room", uid: "schooladmin", role: "co_teacher", status: "active" });
  try {
    await assertSucceeds(getDoc(doc(client.firestore(), "spaces/room/lessons/task/submissions/pupil")));
    await assertSucceeds(getBytes(ref(client.storage(), path)));
    const { getSpaceAccess } = await import("./spaceAccess.server");
    assert.equal((await getSpaceAccess(db, "room", "schooladmin")).canTeach, true);
  } finally { await db.doc("spaceMembers/room_schooladmin").delete(); }
  await assertFails(getDoc(doc(client.firestore(), "spaces/room/lessons/task/submissions/pupil")));
});

test("legacy school-admin Space membership does not become an ordinary teaching or pupil grant", async () => {
  await db.doc("spaceMembers/room_schooladmin").set({ uid: "schooladmin", spaceId: "room", role: "school_admin", status: "active" });
  try {
    await assertFails(getDoc(doc(env.authenticatedContext("schooladmin").firestore(), "spaces/room/lessons/task")));
    const { getSpaceAccess } = await import("./spaceAccess.server");
    assert.equal((await getSpaceAccess(db, "room", "schooladmin")).canRead, false);
  } finally { await db.doc("spaceMembers/room_schooladmin").delete(); }
});

test("authenticated creation preserves teacher-owned rooms without exposing other rooms for code checks", async () => {
  const { POST } = await import("../../app/api/teacher/spaces/create/route");
  const created = await POST(request("schooladmin", { title: "Synthetic teacher room", schoolId: "schoolA" }));
  assert.equal(created.status, 200);
  const data = await created.json();
  const teacher = env.authenticatedContext("schooladmin").firestore();
  await assertSucceeds(getDoc(doc(teacher, `spaces/${data.spaceId}`)));
  await assertSucceeds(getDocs(query(collection(teacher, "spaces"), where("ownerId", "==", "schooladmin"))));
  await assertFails(getDoc(doc(env.authenticatedContext("foreignadmin").firestore(), `spaces/${data.spaceId}`)));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `spaces/${data.spaceId}`)));
  assert.equal((await POST(request("schooladmin", { title: "Synthetic", schoolId: "schoolB" }))).status, 403);
  assert.equal((await POST(request("pupil", { title: "Synthetic" }))).status, 403);
  assert.equal((await POST(request(null, { title: "Synthetic" }))).status, 401);
});

test("C1 rejects creation with protected privilege fields", async () => {
  for (const patch of [{ role: "admin" }, { roles: { admin: true } }, { adminLevel: "superadmin" }, { schoolId: "schoolA", schoolRole: "school_admin", schoolStatus: "active" },
    { plan: "pro" }, { billing: { plan: "pro", status: "active" } }, { partnerAccess: true }, { features: { academy: true } }, { unknownEntitlement: true }]) {
    const uid = `new${Math.random().toString(36).slice(2)}`;
    await denied(setDoc(doc(env.authenticatedContext(uid).firestore(), "users", uid), patch));
  }
});
test("C1 rejects adding, changing or removing protected fields", async () => {
  for (const patch of [{ roles: { admin: true } }, { schoolId: "schoolA" }, { plan: "pro" }, { disabled: false }, { features: { academy: true } }]) {
    const uid = `edit${Math.random().toString(36).slice(2)}`;
    await db.doc(`users/${uid}`).set({ role: "student" });
    await denied(updateDoc(doc(env.authenticatedContext(uid).firestore(), "users", uid), patch));
  }
  await db.doc("users/protected").set({ role: "teacher", plan: "plus", schoolId: "schoolA" });
  await denied(updateDoc(doc(env.authenticatedContext("protected").firestore(), "users", "protected"), { plan: deleteField() }));
});
test("C1 preserves signup, onboarding, safe edits and privileged admin maintenance", async () => {
  const safe = env.authenticatedContext("signup").firestore();
  await assertSucceeds(setDoc(doc(safe, "users", "signup"), { displayName: "Synthetic", email: "synthetic@example.invalid", locale: "nb", onboardingComplete: false,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastLoginAt: serverTimestamp(), disabled: false }));
  await assertSucceeds(updateDoc(doc(safe, "users", "signup"), { role: "teacher", onboardingComplete: true, org: { country: "NO", municipality: "Test", institutionType: "school", institutionName: "Test school" }, legal: { version: "test" } }));
  await assertSucceeds(updateDoc(doc(safe, "users", "signup"), { displayName: "Changed", locale: "en" }));
  await assertSucceeds(updateDoc(doc(env.authenticatedContext("admin").firestore(), "users", "signup"), { plan: "plus", schoolId: "schoolA" }));
  await assertFails(updateDoc(doc(env.authenticatedContext("other").firestore(), "users", "signup"), { displayName: "Foreign" }));
});
test("C2 revoked members lose nested, index, writing and collection-group access even in open rooms", async () => {
  for (const uid of ["removed", "disabled", "revoked", "inactive", "archived"]) {
    const client = env.authenticatedContext(uid).firestore();
    for (const path of [`spaces/room/lessons/task`, `spaces/room/lessons/task/submissions/${uid}`, `spaceSubmissions/${uid}`, `spaces/room/writingActivities/writing/submissions/${uid}`]) await denied(getDoc(doc(client, path)));
    await denied(getDocs(query(collectionGroup(client, "submissions"), where("spaceId", "==", "room"), where("uid", "==", uid))));
    await denied(updateDoc(doc(client, `spaces/room/lessons/task/submissions/${uid}`), { answers: { q: "Blocked" } }));
  }
});
test("C2 legitimate pupils, owner and co-teacher retain access", async () => {
  for (const uid of ["pupil", "owner", "coteacher", "admin"]) await assertSucceeds(getDoc(doc(env.authenticatedContext(uid).firestore(), "spaces/room/lessons/task/submissions/pupil")));
  for (const uid of ["owner", "coteacher", "admin"]) {
    const client = env.authenticatedContext(uid).firestore();
    await assertSucceeds(getDocs(collection(client, "spaces/room/lessons/task/submissions")));
    await assertSucceeds(getDocs(collection(client, "spaces/room/writingActivities/writing/submissions")));
    await assertSucceeds(getDocs(query(collection(client, "spaceSubmissions"), where("spaceId", "==", "room"))));
  }
  await assertSucceeds(getDocs(query(collection(env.authenticatedContext("pupil").firestore(), "spaceSubmissions"), where("spaceId", "==", "room"), where("uid", "==", "pupil"))));
  for (const uid of ["schooladmin", "other", "foreignadmin", "removedteacher"]) await assertFails(getDoc(doc(env.authenticatedContext(uid).firestore(), "spaces/room/lessons/task/submissions/pupil")));
});
test("C2 audio access and upload require active membership", async () => {
  for (const uid of ["pupil", "removed", "disabled", "revoked", "inactive", "archived"]) {
    const path = `spaces/room/assignments/task/submissions/${uid}/audio/test.webm`;
    await env.withSecurityRulesDisabled(async context => { await uploadBytes(ref(context.storage(), path), new Uint8Array([1, 2]), { contentType: "audio/webm" }); });
    const storage = env.authenticatedContext(uid).storage();
    const check = uid === "pupil" ? assertSucceeds : denied;
    await check(getBytes(ref(storage, path)));
    await assertFails(uploadBytes(ref(storage, path), new Uint8Array([3]), { contentType: "audio/webm" }));
    await check(deleteObject(ref(storage, path)));
  }
});
test("C3 real feedback route rejects unrelated teachers before AI, quota or submission writes", async () => {
  const { POST } = await import("../../app/api/teacher/ai-feedback/route");
  for (const uid of ["schooladmin", "other", "foreignadmin", "removedteacher"]) {
    const before = aiCalls;
    const usageBefore = (await db.collection(`users/${uid}/usage`).get()).docs.map(doc => doc.data());
    const response = await POST(new Request("http://localhost/api/teacher/ai-feedback", { method: "POST", headers: { Authorization: `Bearer ${uid}`, "Content-Type": "application/json" }, body: JSON.stringify({ spaceId: "room", assignmentId: "task", subId: "pupil" }) }));
    assert.equal(response.status, 403);
    assert.equal(aiCalls - before, 0);
    assert.deepEqual((await db.collection(`users/${uid}/usage`).get()).docs.map(doc => doc.data()), usageBefore);
  }
});

function request(uid: string | null, body?: unknown) {
  return new Request("http://localhost/api/synthetic", { method: body === undefined ? "GET" : "POST",
    headers: { ...(uid ? { Authorization: `Bearer ${uid}` } : {}), "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const taskParams = { params: Promise.resolve({ spaceId: "room", assignmentId: "task" }) };
const badMembers = ["removed", "disabled", "revoked", "inactive", "archived", "removedteacher"];

test("C1 quota counters cannot be reset, deleted, made negative or replaced by entitlement fields", async () => {
  const counter = doc(env.authenticatedContext("pupil").firestore(), "users/pupil/usage/test-month");
  await assertSucceeds(setDoc(counter, { ai_feedback: 1, downloads: 2 }));
  await assertSucceeds(updateDoc(counter, { ai_feedback: increment(1), updatedAt: serverTimestamp() }));
  for (const patch of [{ ai_feedback: 0 }, { ai_feedback: deleteField() }, { downloads: -1 }, { plan: "pro" }]) await assertFails(updateDoc(counter, patch));
  await assertFails(deleteDoc(counter));
  await assertFails(setDoc(counter, { ai_feedback: 0 }));
});

test("C1 legacy privileged profiles can edit safe fields; creator grants and disabled flags stay protected", async () => {
  await db.doc("users/approvedCreator").set({ role: "teacher", roles: { creator: true }, creatorStatus: "approved", plan: "plus" });
  const creator = doc(env.authenticatedContext("approvedCreator").firestore(), "users/approvedCreator");
  await assertSucceeds(updateDoc(creator, { mode: "creator", displayName: "Synthetic creator" }));
  await assertFails(updateDoc(doc(env.authenticatedContext("pupil").firestore(), "users/pupil"), { mode: "creator" }));
  await assertFails(updateDoc(doc(env.authenticatedContext("pupil").firestore(), "users/pupil"), { creatorStatus: "approved" }));
  await db.doc("users/disabledProfile").set({ role: "teacher", disabled: true });
  await assertFails(updateDoc(doc(env.authenticatedContext("disabledProfile").firestore(), "users/disabledProfile"), { disabled: false }));
  await assertSucceeds(updateDoc(doc(env.authenticatedContext("admin").firestore(), "users/admin"), { displayName: "Synthetic admin" }));
  await assertFails(updateDoc(doc(env.authenticatedContext("pupil").firestore(), "users/pupil"), { org: { schoolRole: "school_admin" } }));
  await db.doc("users/legacyOrg").set({ role: "teacher", org: { role: "teacher", municipality: "Old" } });
  const legacy = doc(env.authenticatedContext("legacyOrg").firestore(), "users/legacyOrg");
  await assertSucceeds(updateDoc(legacy, { displayName: "Synthetic", "org.municipality": "New" }));
  await assertFails(updateDoc(legacy, { "org.role": "admin" }));
  await assertFails(updateDoc(legacy, { "org.role": deleteField() }));
  await assertFails(updateDoc(legacy, { org: { municipality: "New" } }));
});

test("C2 active pupils can save work and teachers can review; the index cannot be moved to evade Space checks", async () => {
  const pupil = env.authenticatedContext("pupil").firestore();
  const path = "spaces/room/lessons/task/submissions/pupil";
  await assertSucceeds(updateDoc(doc(pupil, path), { answers: { q: "Synthetic revised answer" } }));
  await assertSucceeds(updateDoc(doc(pupil, "spaceSubmissions/pupil"), { answers: { q: "Synthetic revised answer" } }));
  await assertFails(updateDoc(doc(pupil, "spaceSubmissions/pupil"), { spaceId: "foreignRoom" }));
  await assertSucceeds(setDoc(doc(pupil, "spaces/room/writingActivities/writing/submissions/room_writing_pupil"), { uid: "pupil", studentUid: "pupil", participantId: "pupil", spaceId: "room", activityId: "writing", status: "draft", sectionDrafts: { q: "Synthetic draft" } }));
  await assertSucceeds(updateDoc(doc(pupil, "spaces/room/writingActivities/writing/submissions/room_writing_pupil"), { sectionDrafts: { q: "Synthetic revision" } }));
  for (const uid of ["owner", "coteacher"]) await assertSucceeds(updateDoc(doc(env.authenticatedContext(uid).firestore(), path), { teacherFeedback: { text: "Synthetic review" } }));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), path)));
});

test("C2 disabled flags and mixed-case revoked status deny Firestore and protected file reads", async () => {
  for (const [uid, flags] of Object.entries({ flagDisabled: { active: false }, mixedRemoved: { status: "REMOVED" }, linked: { status: "linked" } })) {
    await db.doc(`spaceMembers/room_${uid}`).set({ uid, spaceId: "room", ...flags });
    const client = env.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(client, "spaces/room/lessons/task")));
    const path = `spaces/room/assignments/task/submissions/${uid}/audio/synthetic.webm`;
    await env.withSecurityRulesDisabled(async context => { await uploadBytes(ref(context.storage(), path), new Uint8Array([1]), { contentType: "audio/webm" }); });
    await assertFails(getBytes(ref(env.authenticatedContext(uid).storage(), path)));
  }
});

test("C2 legacy Space images require active membership; new SDK uploads are denied", async () => {
  const paths = ["board-images/owner/room/test.png", "writing-print-images/pupil/room/writing/test.png"];
  for (const path of paths) {
    await env.withSecurityRulesDisabled(async context => { await uploadBytes(ref(context.storage(), path), new Uint8Array([1]), { contentType: "image/png" }); });
    for (const uid of ["pupil", "owner", "coteacher"]) await assertSucceeds(getBytes(ref(env.authenticatedContext(uid).storage(), path)));
    for (const uid of [...badMembers, "other"]) await assertFails(getBytes(ref(env.authenticatedContext(uid).storage(), path)));
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), path)));
  }
  await assertFails(uploadBytes(ref(env.authenticatedContext("owner").storage(), paths[0]), new Uint8Array([2]), { contentType: "image/png" }));
  await assertFails(uploadBytes(ref(env.authenticatedContext("pupil").storage(), paths[1]), new Uint8Array([2]), { contentType: "image/png" }));
  await assertFails(uploadBytes(ref(env.authenticatedContext("owner").storage(), "writing-print-images/owner/room/writing/test.png"), new Uint8Array([2]), { contentType: "image/png" }));
  await assertFails(uploadBytes(ref(env.authenticatedContext("coteacher").storage(), "board-images/coteacher/room/test.png"), new Uint8Array([2]), { contentType: "image/png" }));
});

test("C2 real save API preserves submission ownership and canonical revocation overrides stale legacy membership", async () => {
  const { POST } = await import("../../app/api/student/spaces/[spaceId]/lessons/[assignmentId]/submission/route");
  const payload = { uid: "pupil", participantId: "pupil", spaceId: "room", assignmentId: "task", answers: { q: "Synthetic API answer" } };
  assert.equal((await POST(request("pupil", { payload }), taskParams)).status, 200);
  assert.equal((await POST(request("pupil", { submissionId: "removed", payload }), taskParams)).status, 403);
  for (const uid of badMembers) {
    await db.doc(`spaceMembers/legacy_${uid}`).set({ uid, spaceId: "room", active: true, status: "active" });
    assert.equal((await POST(request(uid, { payload: { ...payload, uid, participantId: uid } }), taskParams)).status, 403);
  }
  assert.equal((await POST(request(null, {}), taskParams)).status, 401);
});

test("C2 geometry reads, saves and reviews enforce membership and teaching authority", async () => {
  const read = await import("../../app/api/spaces/[spaceId]/lessons/[assignmentId]/geometry-submission/[studentUid]/route");
  const save = await import("../../app/api/spaces/[spaceId]/lessons/[assignmentId]/geometry-submit/route");
  const review = await import("../../app/api/spaces/[spaceId]/lessons/[assignmentId]/geometry-review/[studentUid]/route");
  const ctx = { params: Promise.resolve({ spaceId: "room", assignmentId: "task", studentUid: "pupil" }) };
  assert.equal((await read.GET(request(null), ctx)).status, 401);
  assert.equal((await read.GET(request("invalid"), ctx)).status, 401);
  for (const uid of [...badMembers, "schooladmin", "other", "foreignadmin"]) {
    assert.equal((await read.GET(request(uid), ctx)).status, 403);
    assert.equal((await save.POST(request(uid, { worksheet: {}, answersByTaskId: {} }), taskParams)).status, 403);
    assert.equal((await review.POST(request(uid, { status: "reviewed", feedback: "Synthetic review" }), ctx)).status, 403);
  }
  assert.equal((await save.POST(request("pupil", { worksheet: {}, answersByTaskId: {} }), taskParams)).status, 200);
  for (const uid of ["pupil", "owner", "coteacher", "admin"]) assert.equal((await read.GET(request(uid), ctx)).status, 200);
  for (const uid of ["owner", "coteacher", "admin"]) assert.equal((await review.POST(request(uid, { status: "reviewed", feedback: "Synthetic review" }), ctx)).status, 200);
  await db.doc("spaceMembers/room_secondPupil").set({ uid: "secondPupil", role: "student", status: "active" });
  assert.equal((await read.GET(request("secondPupil"), ctx)).status, 403);
});

test("C2 removed members cannot write board responses or request podcast/writing AI support", async () => {
  const board = await import("../../app/api/spaces/[spaceId]/board/text-response/route");
  const podcast = await import("../../app/api/spaces/[spaceId]/lessons/[assignmentId]/podcast-ai-support/route");
  const writing = await import("../../app/api/teacher/spaces/[spaceId]/writing-activities/[activityId]/submissions/[subId]/section-feedback-suggestions/route");
  await db.doc("spaces/room/board/state").set({ active: true, mode: "text", sessionId: "synthetic" });
  for (const uid of badMembers) {
    assert.equal((await board.POST(request(uid, { sessionId: "synthetic", text: "Synthetic" }), { params: Promise.resolve({ spaceId: "room" }) })).status, 403);
    assert.equal((await podcast.POST(request(uid, { sectionId: "synthetic" }), taskParams)).status, 403);
    assert.equal((await writing.POST(request(uid, {}), { params: Promise.resolve({ spaceId: "room", activityId: "writing", subId: "pupil" }) })).status, 403);
  }
  assert.equal((await board.POST(request("pupil", { sessionId: "synthetic", text: "Synthetic" }), { params: Promise.resolve({ spaceId: "room" }) })).status, 200);
});

test("C2 existing revoked membership cannot be reactivated through join", async () => {
  const { POST } = await import("../../app/api/spaces/join/route");
  const { NextRequest } = await import("next/server");
  await db.doc("spaces/room").update({ code: "ROOMAA" });
  await db.doc("spaceMembers/room_pupil").update({ studentCode: "ABCDE", studentCodeKey: "room:ABCDE", displayName: "Synthetic", teacherManaged: true });
  for (const uid of badMembers) {
    const response = await POST(new NextRequest("http://localhost/api/spaces/join", { method: "POST", headers: { Authorization: `Bearer ${uid}`, "Content-Type": "application/json" }, body: JSON.stringify({ code: "ROOMAA", studentCode: "ABCDE", confirm: true }) }));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "access_revoked");
  }
});

test("C2 audio API checks every read/delete and streams bytes without issuing persistent URLs", async () => {
  const { POST } = await import("../../app/api/teacher/audio-url/route");
  let fileCalls = 0;
  let deleteCalls = 0;
  const originalBucket = process.env.FIREBASE_STORAGE_BUCKET;
  process.env.FIREBASE_STORAGE_BUCKET = "demo-security-round1.test";
  const bucketMock = mock.method(getStorage(app), "bucket", () => ({ file: () => {
    fileCalls++;
    return { exists: async () => [true], getMetadata: async () => [{ contentType: "audio/webm" }],
      createReadStream: () => Readable.from([Buffer.from([1, 2])]), delete: async () => { deleteCalls++; } };
  } }));
  try {
    const storagePath = "spaces/room/assignments/task/submissions/pupil/audio/synthetic.webm";
    for (const uid of [...badMembers, "schooladmin", "other", "foreignadmin"]) {
      for (const mode of ["bytes", "delete"]) assert.equal((await POST(request(uid, { storagePath, mode }))).status, 403);
    }
    assert.equal(fileCalls, 0);
    for (const uid of ["pupil", "owner", "coteacher", "admin"]) {
      const response = await POST(request(uid, { storagePath, mode: "bytes" }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2]));
    }
    assert.equal((await POST(request("pupil", { storagePath: storagePath.replace("/pupil/", "/someoneElse/") }))).status, 403);
    assert.equal((await POST(request("invalid", { storagePath }))).status, 401);
    assert.equal((await POST(request(null, { storagePath }))).status, 401);
    assert.equal((await POST(request("admin", { storagePath: "other/private/file" }))).status, 400);
    assert.equal((await POST(request("pupil", { storagePath, mode: "delete" }))).status, 200);
    assert.equal(deleteCalls, 1);
  } finally {
    bucketMock.mock.restore();
    if (originalBucket === undefined) delete process.env.FIREBASE_STORAGE_BUCKET;
    else process.env.FIREBASE_STORAGE_BUCKET = originalBucket;
  }
});

test("C3 rejects invalid tokens, missing targets and conflicting submission/index metadata without AI calls", async () => {
  const { POST } = await import("../../app/api/teacher/ai-feedback/route");
  const before = aiCalls;
  const body = { spaceId: "room", assignmentId: "task", subId: "pupil" };
  assert.equal((await POST(request(null, body))).status, 401);
  assert.equal((await POST(request("invalid", body))).status, 401);
  assert.equal((await POST(request("pupil", body))).status, 403);
  assert.equal((await POST(request("owner", { ...body, subId: "missing" }))).status, 404);
  assert.equal((await POST(request("owner", { ...body, spaceId: "room/foreign" }))).status, 400);
  await db.doc("spaces/room/lessons/task/submissions/conflict").set({ uid: "pupil", spaceId: "foreign", assignmentId: "task" });
  assert.equal((await POST(request("owner", { ...body, subId: "conflict" }))).status, 403);
  await db.doc("spaces/room/lessons/task/submissions/indexCollision").set({ uid: "pupil", spaceId: "room", assignmentId: "task" });
  await db.doc("spaceSubmissions/indexCollision").set({ uid: "pupil", spaceId: "foreign", assignmentId: "task" });
  assert.equal((await POST(request("owner", { ...body, subId: "indexCollision" }))).status, 403);
  await db.doc("users/disabledTeacher").set({ role: "teacher", plan: "plus", disabled: true });
  await db.doc("spaceMembers/room_disabledTeacher").set({ role: "teacher", status: "active" });
  assert.equal((await POST(request("disabledTeacher", body))).status, 403);
  assert.equal(aiCalls, before);
});
test("C3 preserves owner, co-teacher and platform admin feedback", async () => {
  const { POST } = await import("../../app/api/teacher/ai-feedback/route");
  for (const uid of ["owner", "coteacher", "admin"]) {
    const response = await POST(new Request("http://localhost/api/teacher/ai-feedback", { method: "POST", headers: { Authorization: `Bearer ${uid}`, "Content-Type": "application/json" }, body: JSON.stringify({ spaceId: "room", assignmentId: "task", subId: "pupil" }) }));
    assert.equal(response.status, 200, await response.text());
  }
});

test("C2 submission overview filters every Space and never accepts a requested foreign UID", async () => {
  const { GET } = await import("../../app/api/student/submissions/route");
  await db.doc("spaces/closedAccess").set({ ownerId: "other" });
  await db.doc("spaceMembers/closedAccess_pupil").set({ uid: "pupil", status: "removed" });
  await db.doc("spaceSubmissions/pupilRevokedRoom").set({ uid: "pupil", spaceId: "closedAccess", assignmentId: "task", answers: { q: "Synthetic inaccessible" } });
  await db.doc("submissions/legacyPractice").set({ uid: "pupil", lessonId: "practice", updatedAt: new Date("2026-01-01"), feedback: "Synthetic" });
  await db.doc("submissions/legacyRevoked").set({ uid: "pupil", spaceId: "closedAccess" });
  const load = (uid: string | null, source: string) => GET(new Request(`http://localhost/api/student/submissions?source=${source}&uid=someoneElse`, { headers: uid ? { Authorization: `Bearer ${uid}` } : {} }));
  const response = await load("pupil", "spaceSubmissions");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.documents.some((doc: { id: string }) => doc.id === "pupil"));
  assert.ok(body.documents.every((doc: { data: { uid: string; spaceId: string } }) => doc.data.uid === "pupil" && doc.data.spaceId === "room"));
  for (const uid of badMembers) assert.deepEqual((await (await load(uid, "spaceSubmissions")).json()).documents, []);
  const legacy = await (await load("pupil", "submissions")).json();
  assert.deepEqual(legacy.documents.map((doc: { id: string }) => doc.id), ["legacyPractice"]);
  assert.equal(typeof legacy.documents[0].data.updatedAt.seconds, "number");
  assert.equal((await load(null, "spaceSubmissions")).status, 401);
  assert.equal((await load("invalid", "spaceSubmissions")).status, 401);
  assert.equal((await load("pupil", "users")).status, 400);
});

test("C2 archive endpoint requires ownership and current Space access, while own work still archives", async () => {
  const { POST } = await import("../../app/api/content/archive-submission/route");
  assert.equal((await POST(request("other", { submissionId: "pupil" }))).status, 403);
  for (const uid of badMembers) assert.equal((await POST(request(uid, { submissionId: uid }))).status, 403);
  assert.equal((await POST(request("pupil", { submissionId: "pupilRevokedRoom" }))).status, 403);
  assert.equal((await POST(request("pupil", { submissionId: "pupil" }))).status, 200);
  await db.doc("practiceSubmissions/syntheticPractice").set({ uid: "pupil" });
  assert.equal((await POST(request("other", { submissionId: "syntheticPractice" }))).status, 403);
  assert.equal((await POST(request("pupil", { submissionId: "syntheticPractice" }))).status, 200);
});

test("C2 active staff can assign and create writing activities, while revoked or foreign teachers cannot", async () => {
  const assign = await import("../../app/api/teacher/spaces/[spaceId]/assign/route");
  const writing = await import("../../app/api/teacher/spaces/[spaceId]/writing-activities/route");
  const ctx = { params: Promise.resolve({ spaceId: "room" }) };
  for (const uid of ["schooladmin", "removedteacher", "other", "foreignadmin"]) {
    assert.equal((await assign.POST(request(uid, { sourceId: "synthetic" }), ctx)).status, 403);
    assert.equal((await writing.POST(request(uid, { title: "Synthetic writing" }), ctx)).status, 403);
  }
  for (const uid of ["owner", "coteacher"]) {
    await db.doc(`lessons/source_${uid}`).set({ ownerId: uid, title: "Synthetic", sourceText: "Synthetic source", tasks: [] });
    const assigned = await assign.POST(request(uid, { sourceId: `source_${uid}`, sourceType: "myContent" }), ctx);
    assert.equal(assigned.status, 200, await assigned.text());
    const created = await writing.POST(request(uid, { title: "Synthetic writing" }), ctx);
    assert.equal(created.status, 200, await created.text());
  }
});

test("C2 quiz and student writing AI endpoints reject revoked access before invoking AI", async () => {
  const quiz = await import("../../app/api/spaces/[spaceId]/board/quiz-response/route");
  const writing = await import("../../app/api/spaces/[spaceId]/writing-activities/[activityId]/ai-support/route");
  await db.doc("spaces/room/board/state").set({ active: true, mode: "quiz", sessionId: "synthetic", data: {} });
  const before = aiCalls;
  for (const uid of badMembers) {
    assert.equal((await quiz.POST(request(uid, { sessionId: "synthetic", quizQuestionIndex: 0, quizChoice: "A" }), { params: Promise.resolve({ spaceId: "room" }) })).status, 403);
    assert.equal((await writing.POST(request(uid, { sectionId: "synthetic" }), { params: Promise.resolve({ spaceId: "room", activityId: "writing" }) })).status, 403);
  }
  assert.equal(aiCalls, before);
  assert.equal((await quiz.POST(request("pupil", { sessionId: "synthetic", quizQuestionIndex: 0, quizChoice: "A" }), { params: Promise.resolve({ spaceId: "room" }) })).status, 200);
});
