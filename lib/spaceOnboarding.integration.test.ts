import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, after, test, mock } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { NextRequest } from "next/server";

let env: RulesTestEnvironment;
let post: typeof import("../app/api/spaces/join/route").POST;
const app = initializeApp({ projectId: "demo-space-onboarding" });
const db = getFirestore(app);
const pupil = { spaceId: "roomA", role: "student", participantId: "pupilA", displayName: "Yara", studentCode: "ABCDE", studentCodeKey: "roomA:ABCDE", teacherManaged: true, active: true, archived: false, status: "active" };
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8188", "These tests only use the local emulator");
  env = await initializeTestEnvironment({ projectId: "demo-space-onboarding", firestore: { host: "127.0.0.1", port: 8188, rules: await readFile("firestore.rules", "utf8") } });
  await env.clearFirestore();
  await Promise.all([
    db.doc("users/teacher").set({ role: "teacher" }),
    db.doc("users/guest1").set({ role: "student", roles: { student: true } }),
    db.doc("spaces/roomA").set({ title: "Room A", code: "ROOMAA", ownerId: "teacher", isOpen: false, allowRoomCodeOnly: true }),
    db.doc("spaces/roomB").set({ title: "Room B", code: "ROOMBB", ownerId: "teacher", isOpen: true }),
    db.doc("spaceMembers/roomA_pupilA").set(pupil),
    db.doc("spaceMembers/roomA_pupilB").set({ ...pupil, participantId: "pupilB", displayName: "Ali", studentCode: "FGHIJ", studentCodeKey: "roomA:FGHIJ" }),
    db.doc("spaceMembers/roomB_pupilC").set({ ...pupil, spaceId: "roomB", participantId: "pupilC", displayName: "FruX", studentCode: "KLMNO", studentCodeKey: "roomB:KLMNO" }),
  ]);
  mock.method(getAuth(app), "verifyIdToken", async (token: string) => {
    if (token === "invalid") throw new Error("Invalid token");
    return { uid: token, firebase: { sign_in_provider: token.startsWith("account") ? "google.com" : "anonymous" } };
  });
  post = (await import("../app/api/spaces/join/route")).POST;
});
after(async () => { mock.restoreAll(); await env?.cleanup(); await deleteApp(app); });
async function join(uid: string, body: Record<string, unknown>) {
  const response = await post(new NextRequest("http://localhost/api/spaces/join", { method: "POST", headers: { Authorization: `Bearer ${uid}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return { status: response.status, body: await response.json() };
}

async function roster(uid: string, spaceId: string, body?: Record<string, unknown>) {
  const api = await import("../app/api/teacher/spaces/[spaceId]/members/create-student/route");
  const request = new Request("http://localhost/api/teacher/roster", { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${uid}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const response = await (body ? api.POST : api.GET)(request, { params: Promise.resolve({ spaceId }) });
  return { status: response.status, body: await response.json() };
}

test("20 pupils in three rooms occupy 20 teacher places; repeated reuse creates no duplicate; room data stays separate", async () => {
  await db.doc("users/rosterTeacher").set({ role: "teacher", plan: "plus" });
  for (const room of ["rosterA", "rosterB", "rosterC"]) await db.doc(`spaces/${room}`).set({ ownerId: "rosterTeacher", title: room });
  const ids: string[] = [];
  for (let i = 0; i < 20; i++) {
    const created = await roster("rosterTeacher", "rosterA", { displayName: `Pupil ${i}` });
    assert.equal(created.status, 200);
    ids.push(created.body.member.id);
    for (const room of ["rosterB", "rosterC"]) {
      const reused = await roster("rosterTeacher", room, { sourceMemberId: created.body.member.id, displayName: `${room} local name ${i}` });
      assert.equal(reused.status, 200);
      assert.equal(reused.body.member.teacherStudentId, created.body.member.teacherStudentId);
      assert.notEqual(reused.body.member.participantId, created.body.member.participantId);
      assert.equal(reused.body.member.displayName, `${room} local name ${i}`);
    }
  }
  const repeated = await roster("rosterTeacher", "rosterB", { sourceMemberId: ids[0] });
  assert.equal(repeated.body.reused, true);
  const summary = await import("./server/teacherStudentSummary");
  assert.equal(await summary.getTeacherActiveStudentCountAdmin(db, "rosterTeacher"), 20);
  const list = await roster("rosterTeacher", "rosterA");
  assert.equal(list.body.students.length, 20);
  assert.equal(list.body.students[0].spaces.length, 3);
  assert.equal((await db.collection("spaceMembers").where("spaceId", "in", ["rosterA", "rosterB", "rosterC"]).get()).size, 60);
  const client = await import("./teacherStudentLimit");
  await env.withSecurityRulesDisabled(async context => {
    const clientDb = (context.firestore() as unknown as { _delegate: import("firebase/firestore").Firestore })._delegate;
    assert.equal(await client.getTeacherStudentCount(clientDb, "rosterTeacher"), 20);
    const items = await client.getTeacherStudentsOverview(clientDb, "rosterTeacher");
    assert.equal(items[0].spaces.length, 3);
    assert.ok(items[0].spaces.some(room => room.displayName?.includes("local name")));
  });
});

test("same name does not merge pupils; explicit linking preserves identities, codes and answers and reaches future guest joins", async () => {
  const first = (await roster("rosterTeacher", "rosterA", { displayName: "Same name" })).body.member;
  const second = (await roster("rosterTeacher", "rosterB", { displayName: "Same name" })).body.member;
  assert.notEqual(first.teacherStudentId, second.teacherStudentId);
  await db.doc("spaces/rosterB").update({ code: "RSTBBB" });
  await db.doc("spaceAnswers/roster-answer").set({ participantId: second.participantId, spaceId: "rosterB", text: "Keep my work" });
  const original = (await db.doc(`spaceMembers/${second.id}`).get()).data()!;
  assert.equal((await roster("rosterTeacher", "rosterB", { sourceMemberId: first.id, targetMemberId: second.id })).status, 200);
  const linked = (await db.doc(`spaceMembers/${second.id}`).get()).data()!;
  for (const key of ["participantId", "displayName", "studentCode", "studentCodeKey"]) assert.equal(linked[key], original[key]);
  assert.deepEqual((await db.doc("spaceAnswers/roster-answer").get()).data(), { participantId: second.participantId, spaceId: "rosterB", text: "Keep my work" });
  assert.equal(linked.teacherStudentId, first.teacherStudentId);
  const joined = await join("roster-guest", { code: "RSTBBB", studentCode: second.studentCode, confirm: true });
  assert.equal(joined.status, 200);
  assert.equal((await db.doc("spaceMembers/rosterB_roster-guest").get()).data()?.teacherStudentId, first.teacherStudentId);
  const summary = await import("./server/teacherStudentSummary");
  assert.equal(await summary.getTeacherActiveStudentCountAdmin(db, "rosterTeacher"), 21);
  assert.equal((await db.collection("teacherRosterAudit").where("teacherUid", "==", "rosterTeacher").get()).size, 1);
});

test("roster access and linking reject another teacher; licence counting is scoped per teacher", async () => {
  await db.doc("users/otherTeacher").set({ role: "teacher", plan: "plus" });
  await db.doc("spaces/otherRoom").set({ ownerId: "otherTeacher" });
  const own = (await roster("rosterTeacher", "rosterA")).body.students[0];
  assert.equal((await roster("otherTeacher", "rosterA")).status, 403);
  assert.equal((await roster("otherTeacher", "otherRoom", { sourceMemberId: own.sourceMemberId })).status, 403);
  const created = (await roster("otherTeacher", "otherRoom", { displayName: own.displayName })).body.member;
  // Even identical legacy IDs used by two teachers occupy one place with each.
  await db.doc(`spaceMembers/${created.id}`).update({ teacherStudentId: own.id });
  const summary = await import("./server/teacherStudentSummary");
  const a = await summary.getTeacherActiveStudentUidsAdmin(db, "rosterTeacher");
  const b = await summary.getTeacherActiveStudentUidsAdmin(db, "otherTeacher");
  assert.equal(b.size, 1); assert.equal(new Set([...a, ...b]).size, a.size + 1);
  const teacher = env.authenticatedContext("rosterTeacher").firestore();
  await assertFails(updateDoc(doc(teacher, "spaceMembers", own.sourceMemberId), { teacherStudentId: "forged" }));
});

test("licence limit is enforced atomically; reusing an existing pupil remains possible at capacity", async () => {
  await db.doc("users/limitedTeacher").set({ role: "teacher", plan: "free" });
  for (const room of ["limitedA", "limitedB"]) await db.doc(`spaces/${room}`).set({ ownerId: "limitedTeacher" });
  const first = (await roster("limitedTeacher", "limitedA", { displayName: "First" })).body.member;
  for (let i = 0; i < 8; i++) assert.equal((await roster("limitedTeacher", "limitedA", { displayName: `Pupil ${i}` })).status, 200);
  const concurrent = await Promise.all([roster("limitedTeacher", "limitedA", { displayName: "Last A" }), roster("limitedTeacher", "limitedA", { displayName: "Last B" })]);
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 403]);
  assert.equal((await roster("limitedTeacher", "limitedB", { sourceMemberId: first.id })).status, 200);
  await db.doc(`spaceMembers/${first.id}`).update({ active: false, archived: true, status: "removed" });
  assert.equal((await roster("limitedTeacher", "limitedB", { sourceMemberId: first.id })).status, 403);
  const client = await import("./teacherStudentLimit");
  await env.withSecurityRulesDisabled(async context => {
    const clientDb = (context.firestore() as unknown as { _delegate: import("firebase/firestore").Firestore })._delegate;
    const result = await client.archiveStudentFromTeacherSpaces({ db: clientDb, teacherUid: "limitedTeacher", studentUid: first.teacherStudentId });
    assert.equal(result.affected, 2);
    assert.equal(await client.getTeacherStudentCount(clientDb, "limitedTeacher"), 9);
  });
  assert.equal((await roster("limitedTeacher", "limitedA", { displayName: "New pupil after removal" })).status, 200);
});
test("preview and cancel leave memberships unchanged; submitted names cannot rename pupils", async () => {
  const result = await join("guest1", { code: "ROOMAA", studentCode: "ABCDE", displayName: "My own name" });
  assert.equal(result.body.preview, true); assert.equal(result.body.displayName, "Yara");
  assert.equal((await db.doc("spaceMembers/roomA_guest1").get()).exists, false);
  const confirmed = await join("guest1", { code: "ROOMAA", studentCode: "ABCDE", displayName: "My own name", confirm: true });
  assert.equal(confirmed.body.preview, false);
  assert.equal((await db.doc("spaceMembers/roomA_guest1").get()).data()?.displayName, "Yara");
});
test("guest browsers and registered accounts share one pupil and room-local names", async () => {
  for (const uid of ["guest2", "account1"]) {
    assert.equal((await join(uid, { code: "ROOMAA", studentCode: "ABCDE", confirm: true })).body.participantId, "pupilA");
  }
  assert.equal((await join("account1", { code: "ROOMBB", studentCode: "KLMNO", confirm: true })).body.displayName, "FruX");
  assert.equal((await db.doc("spaceMembers/roomA_account1").get()).data()?.displayName, "Yara");
  assert.equal((await db.doc("spaceMembers/roomB_account1").get()).data()?.displayName, "FruX");
});
test("personal QR for another pupil cannot silently overwrite an existing membership", async () => {
  const result = await join("guest1", { code: "ROOMAA", studentCode: "FGHIJ", confirm: true });
  assert.equal(result.body.switchRequired, true); assert.equal(result.body.preview, true);
  assert.equal(result.body.currentDisplayName, "Yara"); assert.equal(result.body.displayName, "Ali");
  assert.equal((await db.doc("spaceMembers/roomA_guest1").get()).data()?.participantId, "pupilA");
  assert.equal((await join("fresh-guest", { code: "ROOMAA", studentCode: "FGHIJ", confirm: true })).body.participantId, "pupilB");
});
test("joining a pupil code cannot overwrite a co-teacher membership", async () => {
  await db.doc("spaceMembers/roomA_staff").set({ spaceId: "roomA", uid: "staff", role: "co_teacher", displayName: "Staff", active: true, archived: false });
  assert.equal((await join("staff", { code: "ROOMAA", studentCode: "ABCDE", confirm: true })).body.switchRequired, true);
  assert.equal((await db.doc("spaceMembers/roomA_staff").get()).data()?.role, "co_teacher");
});
test("codes are required and validated even for existing members and legacy open admission rooms", async () => {
  assert.equal((await join("guest1", { code: "ROOMAA", studentCode: "WRONG" })).body.error, "invalid_student_code");
  assert.equal((await join("guest1", { code: "ROOMAA", displayName: "New pupil", confirm: true })).body.error, "student_code_required");
  assert.equal((await join("invalid", { code: "ROOMAA", studentCode: "ABCDE" })).status, 401);
  assert.equal((await join("guest1", { code: "ROOMBB", studentCode: "ABCDE" })).body.error, "invalid_student_code");
});
test("pupils cannot forge access, rename themselves, replace identities or re-enable membership", async () => {
  const client = env.authenticatedContext("guest1").firestore();
  const member = doc(client, "spaceMembers", "roomA_guest1");
  await assertSucceeds(getDoc(member));
  for (const patch of [{ displayName: "Changed" }, { participantId: "pupilB" }, { studentCode: "FGHIJ" }, { active: true }, { role: "co_teacher" }]) await assertFails(updateDoc(member, patch));
  await assertFails(setDoc(doc(client, "spaceMembers", "roomB_guest1"), { ...pupil, uid: "guest1", spaceId: "roomB" }));
  const teacher = env.authenticatedContext("teacher").firestore();
  await assertSucceeds(updateDoc(doc(teacher, "spaceMembers", "roomA_guest1"), { displayName: "Teacher's name" }));
});
test("removed pupils cannot join, and an archived room rejects new links", async () => {
  await db.doc("spaceMembers/roomA_removed").set({ ...pupil, participantId: "removed", studentCodeKey: "roomA:PQRST", studentCode: "PQRST", archived: true, active: false, status: "removed" });
  assert.equal((await join("guest1", { code: "ROOMAA", studentCode: "PQRST", confirm: true })).body.error, "invalid_student_code");
  await db.doc("spaces/roomB").update({ archived: true });
  assert.equal((await join("guest1", { code: "ROOMBB", studentCode: "KLMNO", confirm: true })).body.error, "room_unavailable");
});
test("answers are shared through the pupil identity, while a different pupil cannot read them", async () => {
  const path = "spaces/roomA/lessons/assignment/submissions/shared-answer";
  await db.doc(path).set({ uid: "guest2", participantId: "pupilA", spaceId: "roomA", assignmentId: "assignment", status: "submitted", text: "Preserved answer" });
  for (const uid of ["guest1", "guest2", "account1"]) await assertSucceeds(getDoc(doc(env.authenticatedContext(uid).firestore(), path)));
  await assertFails(getDoc(doc(env.authenticatedContext("fresh-guest").firestore(), path)));
});
test("family room owners can still create their own parent membership without creating pupil access", async () => {
  await db.doc("spaces/family").set({ ownerId: "parent", kind: "family", title: "Family" });
  const parent = env.authenticatedContext("parent").firestore();
  await assertSucceeds(setDoc(doc(parent, "spaceMembers", "family_parent"), { spaceId: "family", uid: "parent", role: "parent", displayName: "Parent" }));
  await assertFails(setDoc(doc(parent, "spaceMembers", "roomA_parent"), { spaceId: "roomA", uid: "parent", role: "parent", displayName: "Parent" }));
  await assertFails(setDoc(doc(parent, "spaceMembers", "family_child"), { spaceId: "family", uid: "child", role: "student", displayName: "Child" }));
});
test("the teacher pupil record wins over old access names and teacher renames survive new joins", async () => {
  await db.doc("spaceMembers/roomA_guest2").update({ displayName: "Self-selected surname" });
  assert.equal((await join("another-guest", { code: "ROOMAA", studentCode: "ABCDE" })).body.displayName, "Yara");
  const { PATCH } = await import("../app/api/teacher/spaces/[spaceId]/members/[memberId]/route");
  const edit = (uid: string) => PATCH(new Request("http://localhost/members", { method: "PATCH", headers: { Authorization: `Bearer ${uid}`, "Content-Type": "application/json" }, body: JSON.stringify({ displayName: "Teacher renamed Yara" }) }), { params: Promise.resolve({ spaceId: "roomA", memberId: "roomA_guest1" }) });
  assert.equal((await edit("guest1")).status, 403);
  assert.equal((await edit("teacher")).status, 200);
  assert.equal((await db.doc("spaceMembers/roomA_pupilA").get()).data()?.displayName, "Teacher renamed Yara");
  assert.equal((await join("another-guest", { code: "ROOMAA", studentCode: "ABCDE", confirm: true })).body.displayName, "Teacher renamed Yara");
  assert.equal((await db.doc("spaceMembers/roomA_guest2").get()).data()?.displayName, "Teacher renamed Yara");
  assert.equal((await db.doc("spaceMembers/roomB_account1").get()).data()?.displayName, "FruX");
});
