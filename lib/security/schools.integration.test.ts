import assert from "node:assert/strict";
import { before, after, test, mock } from "node:test";
import { readFile } from "node:fs/promises";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { activateSchoolTeacher } from "../schools/server/activateSchoolTeacher";
import { disableSchoolTeacher } from "../schools/server/disableSchoolTeacher";
import { createSchoolInvites } from "../schools/server/createSchoolInvite";
import { acceptSchoolInvite } from "../schools/server/acceptSchoolInvite";

const app = initializeApp({ projectId: "demo-school-boundaries" });
const db = getFirestore(app);
let env: RulesTestEnvironment;
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8188");
  env = await initializeTestEnvironment({ projectId: "demo-school-boundaries", firestore: { host: "127.0.0.1", port: 8188, rules: await readFile("firestore.rules", "utf8") } });
  await env.clearFirestore();
  for (const id of ["A", "B"]) {
    await db.doc(`schools/${id}`).set({ name: `Synthetic ${id}`, status: "active", teacherSeatLimit: 3 });
    await db.doc(`users/admin${id}`).set({ role: "teacher", schoolId: id, schoolRole: "school_admin", schoolStatus: "active" });
    await db.doc(`schools/${id}/members/admin${id}`).set({ uid: `admin${id}`, schoolId: id, role: "school_admin", status: "active" });
  }
  await db.doc("users/platform").set({ role: "admin", adminLevel: "superadmin" });
  await db.doc("users/teacherA").set({ role: "teacher", schoolId: "A", schoolRole: "school_teacher", schoolStatus: "active" });
  await db.doc("schools/A/members/teacherA").set({ uid: "teacherA", schoolId: "A", role: "school_teacher", status: "active", email: "teacher@synthetic.invalid" });
  for (const [id, schoolId] of [["own", "A"], ["foreign", "B"], ["legacy", ""]]) {
    await db.doc(`spaces/${id}`).set({ ownerId: "teacherA", title: `Synthetic ${id}`, ...(schoolId ? { schoolId } : {}) });
    await db.doc(`spaceMembers/${id}_pupil`).set({ spaceId: id, uid: "pupil", role: "student", participantId: id, archived: false, active: true });
    await db.doc(`spaces/${id}/lessons/task`).set({ createdAt: Timestamp.now() });
    await db.doc(`spaces/${id}/lessons/task/submissions/pupil`).set({ uid: "pupil", spaceId: id, assignmentId: "task", submittedAt: Timestamp.now() });
  }
  mock.method(getAuth(app), "verifyIdToken", async (token: string) => ({ uid: token }));
});
after(async () => { mock.restoreAll(); await env.cleanup(); await deleteApp(app); });
function request(uid: string, body?: unknown) {
  return new Request("http://localhost/api/synthetic", { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${uid}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
test("school admin cannot self-promote, change licence limits or grant administrators", async () => {
  const client = env.authenticatedContext("adminA").firestore();
  for (const patch of [{ role: "admin" }, { adminLevel: "superadmin" }, { roles: { admin: true } }, { schoolId: "B" }]) await assertFails(updateDoc(doc(client, "users/adminA"), patch));
  await assertFails(updateDoc(doc(client, "schools/A"), { teacherSeatLimit: 999 }));
  await assertFails(updateDoc(doc(client, "schools/A/members/adminA"), { role: "admin" }));
  const central = await import("../../app/api/admin/schools/[schoolId]/administrators/route");
  assert.equal((await central.POST(request("adminA", { adminUid: "adminA" }), { params: Promise.resolve({ schoolId: "B" }) })).status, 403);
});
test("school admin cannot read or administer another school through actual endpoints", async () => {
  for (const route of [await import("../../app/api/schools/[schoolId]/route"), await import("../../app/api/schools/[schoolId]/spaces/route"), await import("../../app/api/schools/[schoolId]/teachers/route")]) {
    assert.equal((await route.GET(request("adminA"), { params: Promise.resolve({ schoolId: "B" }) })).status, 403);
  }
  const activate = await import("../../app/api/schools/activate-teacher/route");
  const disable = await import("../../app/api/schools/disable-teacher/route");
  for (const api of [activate, disable]) assert.equal((await api.POST(request("adminA", { schoolId: "B", targetUid: "teacherA" }))).status, 403);
  const invite = await import("../../app/api/schools/invite/route");
  assert.equal((await invite.POST(request("adminA", { schoolId: "B", email: "test@synthetic.invalid", sendEmail: false }))).status, 403);
  const own = await invite.POST(request("adminA", { schoolId: "A", email: "new@synthetic.invalid", role: "school_admin", teacherSeatLimit: 999, sendEmail: false }));
  assert.equal(own.status, 200);
  const id = (await own.json()).inviteId;
  assert.equal((await db.doc(`schoolInvites/${id}`).get()).get("role"), "school_teacher");
});
test("licence capacity is atomic when two disabled teachers compete for the last place", async () => {
  await db.doc("schools/capacity").set({ status: "active", teacherSeatLimit: 1 });
  for (const uid of ["candidate1", "candidate2"]) {
    await db.doc(`schools/capacity/members/${uid}`).set({ uid, role: "school_teacher", status: "disabled" });
    await db.doc(`users/${uid}`).set({ role: "teacher", schoolId: "capacity", schoolStatus: "disabled" });
  }
  const results = await Promise.all(["candidate1", "candidate2"].map(targetUid => activateSchoolTeacher({ schoolId: "capacity", targetUid, performedByUid: "platform" })));
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal((await db.collection("schools/capacity/members").where("status", "==", "active").get()).size, 1);
});
test("reactivation honours reserved invitations and valid licence bounds", async () => {
  await db.doc("schools/reserved").set({ status: "active", teacherSeatLimit: 1 });
  await db.doc("schools/reserved/members/former").set({ uid: "former", role: "school_teacher", status: "disabled" });
  assert.equal((await createSchoolInvites({ schoolId: "reserved", invitedBy: "platform", recipients: [{ email: "reserved@synthetic.invalid" }] })).ok, true);
  const result = await activateSchoolTeacher({ schoolId: "reserved", targetUid: "former" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "seat_limit_reached");
});
test("stale former membership cannot overwrite or disable a teacher in another school", async () => {
  await db.doc("schools/A/members/transferred").set({ uid: "transferred", role: "school_teacher", status: "disabled" });
  const profile = { role: "teacher", schoolId: "B", schoolRole: "school_teacher", schoolStatus: "active" };
  await db.doc("users/transferred").set(profile);
  assert.equal((await activateSchoolTeacher({ schoolId: "A", targetUid: "transferred" })).ok, false);
  assert.equal((await disableSchoolTeacher({ schoolId: "A", targetUid: "transferred" })).ok, false);
  assert.deepEqual((await db.doc("users/transferred").get()).data(), profile);
});
test("Space overview and statistics exclude foreign and unassigned Spaces and never retag them on GET", async () => {
  const spaces = await import("../../app/api/schools/[schoolId]/spaces/route");
  const response = await spaces.GET(request("adminA"), { params: Promise.resolve({ schoolId: "A" }) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, schoolId: "A", totalSpaceCount: 1 });
  assert.equal((await db.doc("spaces/legacy").get()).get("schoolId"), undefined);
  const summary = await import("../../app/api/schools/[schoolId]/route");
  const stats = await summary.GET(request("adminA"), { params: Promise.resolve({ schoolId: "A" }) });
  assert.equal(stats.status, 200);
  const usage = (await stats.json()).usageStats;
  assert.equal(usage.totalSpaceCount, 1);
  assert.equal(usage.totalActivityCount, 1);
  assert.equal(usage.submissions.countRange, null);
  for (const key of ["totalStudentCount", "latestTeacherLoginAt", "activeTeachersLast30Days", "activeStudentsLast30Days", "submissionsLast30Days", "aiFeedbackThisMonth"]) assert.equal(usage[key], undefined);
  assert.equal((await summary.GET(new Request("http://localhost/api/synthetic?teacher=teacherA", { headers: { Authorization: "Bearer adminA" } }), { params: Promise.resolve({ schoolId: "A" }) })).status, 400);
});
test("stale administrator membership cannot authorize a disabled or foreign-school profile", async () => {
  const route = await import("../../app/api/schools/[schoolId]/teachers/route");
  await db.doc("schools/A/members/staleAdmin").set({ uid: "staleAdmin", role: "school_admin", status: "active" });
  await db.doc("users/staleAdmin").set({ role: "teacher", schoolId: "B", schoolRole: "school_admin", schoolStatus: "active" });
  assert.equal((await route.GET(request("staleAdmin"), { params: Promise.resolve({ schoolId: "A" }) })).status, 403);
  await db.doc("users/staleAdmin").set({ schoolId: "A", schoolRole: "school_admin", schoolStatus: "active", disabled: true });
  assert.equal((await route.GET(request("staleAdmin"), { params: Promise.resolve({ schoolId: "A" }) })).status, 403);
});

test("legitimate teacher invitation, disabling and reactivation preserve the licence lifecycle", async () => {
  await db.doc("schools/lifecycle").set({ status: "active", teacherSeatLimit: 1 });
  const created = await createSchoolInvites({ schoolId: "lifecycle", invitedBy: "platform", recipients: [{ email: "lifecycle@synthetic.invalid" }] });
  assert.equal(created.ok, true);
  const invite = created.invites![0];
  const input = { uid: "lifecycleTeacher", email: invite.email, token: invite.token };
  // Even a legacy administrator invitation cannot grant administrator rights.
  await db.doc(`schoolInvites/${invite.inviteId}`).update({ role: "school_admin" });
  assert.equal((await acceptSchoolInvite(input)).reason, "invite_not_pending");
  assert.equal((await db.doc("users/lifecycleTeacher").get()).exists, false);
  await db.doc(`schoolInvites/${invite.inviteId}`).update({ role: "school_teacher" });
  assert.equal((await acceptSchoolInvite(input)).ok, true);
  assert.equal((await db.doc("users/lifecycleTeacher").get()).get("schoolRole"), "school_teacher");
  assert.equal((await createSchoolInvites({ schoolId: "lifecycle", invitedBy: "platform", recipients: [{ email: "excess@synthetic.invalid" }] })).ok, false);
  assert.equal((await disableSchoolTeacher({ schoolId: "lifecycle", targetUid: input.uid, performedByUid: "platform" })).ok, true);
  assert.equal((await db.doc(`users/${input.uid}`).get()).get("schoolStatus"), "disabled");
  assert.equal((await activateSchoolTeacher({ schoolId: "lifecycle", targetUid: input.uid, performedByUid: "platform" })).ok, true);
  assert.equal((await db.doc(`users/${input.uid}`).get()).get("schoolStatus"), "active");
});

test("invitation acceptance refuses an active foreign-school teacher and invalid licence limits", async () => {
  await db.doc("schools/acceptance").set({ status: "active", teacherSeatLimit: 2 });
  const created = await createSchoolInvites({ schoolId: "acceptance", invitedBy: "platform", recipients: [{ email: "foreign@synthetic.invalid" }] });
  const invite = created.invites![0];
  const profile = { schoolId: "B", schoolRole: "school_teacher", schoolStatus: "active" };
  await db.doc("users/foreignTeacher").set(profile);
  assert.equal((await acceptSchoolInvite({ uid: "foreignTeacher", email: invite.email, token: invite.token })).reason, "already_school_member");
  assert.deepEqual((await db.doc("users/foreignTeacher").get()).data(), profile);
  await db.doc("schools/acceptance").update({ teacherSeatLimit: 1.5 });
  assert.equal((await acceptSchoolInvite({ uid: "newTeacher", email: invite.email, token: invite.token })).reason, "invalid_seat_limit");
  await db.doc("schools/acceptance/members/newTeacher").set({ role: "school_teacher", status: "disabled" });
  assert.equal((await activateSchoolTeacher({ schoolId: "acceptance", targetUid: "newTeacher" })).reason, "invalid_seat_limit");
});

test("invitation and reactivation compete atomically for the same final licence place", async () => {
  await db.doc("schools/mixedCapacity").set({ status: "active", teacherSeatLimit: 1 });
  await db.doc("schools/mixedCapacity/members/formerMixed").set({ role: "school_teacher", status: "disabled" });
  const results = await Promise.all([
    activateSchoolTeacher({ schoolId: "mixedCapacity", targetUid: "formerMixed" }),
    createSchoolInvites({ schoolId: "mixedCapacity", invitedBy: "platform", recipients: [{ email: "mixed@synthetic.invalid" }] }),
  ]);
  assert.equal(results.filter(result => result.ok).length, 1);
  const active = await db.collection("schools/mixedCapacity/members").where("status", "==", "active").get();
  const pending = await db.collection("schoolInvites").where("schoolId", "==", "mixedCapacity").where("status", "==", "pending").get();
  assert.equal(active.size + pending.size, 1);
});

test("school statistics use metadata, suppress small rooms and freeze content-free monthly results", async () => {
  const { getSchoolStatistics } = await import("../schools/server/aggregateStatistics");
  const now = new Date("2026-10-15T12:00:00Z");
  await db.doc("spaces/aggregate-room").set({ schoolId: "aggregateSchool", ownerId: "teacherA", code: "NEVER-RETURN" });
  await db.doc("spaces/aggregate-room/lessons/activity").set({ title: "NEVER-RETURN" });
  const submittedAt = Timestamp.fromDate(new Date("2026-09-15T12:00:00Z"));
  for (let i = 0; i < 5; i++) {
    const uid = `syntheticAggregatePupil${i}`;
    await db.doc(`spaceMembers/aggregate-room_${uid}`).set({ spaceId: "aggregate-room", uid, role: "student", active: true, participantId: uid });
    const data = { uid, spaceId: "aggregate-room", assignmentId: "activity", submittedAt, status: "submitted", answers: "NEVER-RETURN", teacherFeedback: "NEVER-RETURN" };
    await db.doc(`spaces/aggregate-room/lessons/activity/submissions/${uid}`).set(data);
    await db.doc(`spaceSubmissions/aggregate-${uid}`).set(data);
  }
  const result = await getSchoolStatistics(db, "aggregateSchool", now);
  assert.deepEqual(result, { totalSpaceCount: 1, totalActivityCount: 1, submissions: { period: "2026-09", policyVersion: 1, countRange: { minimum: 5, maximum: 9 } } });
  assert.doesNotMatch(JSON.stringify(result), /NEVER-RETURN|syntheticAggregatePupil|aggregate-room/);
  // Canonical + index documents count once, and late changes cannot expose increments.
  await db.doc("spaces/aggregate-room/lessons/activity/submissions/late").set({ uid: "syntheticAggregatePupil0", submittedAt, status: "submitted" });
  assert.deepEqual(await getSchoolStatistics(db, "aggregateSchool", now), result);
  const stored = (await db.doc("schoolAggregateReports/aggregateSchool/months/2026-09").get()).data();
  assert.deepEqual(stored, result.submissions);
  await db.doc("users/aggregateAdmin").set({ role: "teacher", schoolId: "aggregateSchool", schoolRole: "school_admin", schoolStatus: "active" });
  const directReport = doc(env.authenticatedContext("aggregateAdmin").firestore(), "schoolAggregateReports/aggregateSchool/months/2026-09");
  await assertFails(getDoc(directReport));
  await assertFails(updateDoc(directReport, { countRange: { minimum: 1, maximum: 1 } }));
  assert.equal((await getSchoolStatistics(db, "foreignSchoolWithNoRooms", now)).submissions.countRange, null);
});
