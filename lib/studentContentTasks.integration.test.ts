import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { collection, doc, getDocFromServer, getDocsFromServer, query, setDoc, where, type Firestore } from "firebase/firestore";
import { listStudentContentMemberships, loadStudentContentRoom, loadStudentContentRoomChoice } from "./studentContentTasks";

const loopbackPort = /^127\.0\.0\.1:(\d+)$/.exec(process.env.FIRESTORE_EMULATOR_HOST ?? "")?.[1];
const projectId = "demo-student-content";
const spaceId = "classroom";
const lessonId = "reading";
const firstPupil = "pupil-nora";
const secondPupil = "pupil-samir";
const firstDevice = "guest-on-first-device";
const secondDevice = "guest-on-second-device";
const nextPupil = "guest-after-switch";

function membership(uid: string, participantId: string, status = "active", room = spaceId) {
  return { spaceId: room, uid, participantId, role: "student", status, active: status === "active", archived: false };
}

async function scopes(db: Firestore, uid: string) {
  const rows = await getDocsFromServer(query(collection(db, "spaceMembers"), where("uid", "==", uid)));
  return listStudentContentMemberships(rows.docs, uid);
}

test("student content follows approved room identity across devices and pupil switch", { skip: !loopbackPort }, async (t) => {
  const env = await initializeTestEnvironment({
    projectId,
    firestore: { host: "127.0.0.1", port: Number(loopbackPort), rules: await readFile("firestore.rules", "utf8") },
  });
  const admin = initializeApp({ projectId });
  t.after(async () => {
    await env.cleanup();
    await deleteApp(admin);
  });

  t.mock.method(getAuth(admin), "verifyIdToken", async (token: string) => {
    assert.ok([firstDevice, secondDevice].includes(token));
    return { uid: token, firebase: { sign_in_provider: "anonymous" } } as DecodedIdToken;
  });
  const { POST: saveDraft } = await import("../app/api/student/spaces/[spaceId]/lessons/[assignmentId]/submission/route");

  async function writeDraft(uid: string, answer: string, submissionId?: string) {
    const response = await saveDraft(new Request("http://localhost/isolated-draft", {
      method: "POST",
      headers: { Authorization: `Bearer ${uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        submissionId,
        payload: { uid, participantId: firstPupil, status: "draft", title: "Les teksten", answers: { question: answer } },
      }),
    }), { params: Promise.resolve({ spaceId, assignmentId: lessonId }) });
    const saved = await response.json() as { ok: boolean; submissionId: string };
    assert.equal(response.status, 200, JSON.stringify(saved));
    assert.equal(saved.ok, true);
    return saved.submissionId;
  }

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const fixtures = {
      [`spaces/${spaceId}`]: { title: "Syntetisk gruppe", isOpen: false, ownerId: "teacher-test" },
      [`spaces/${spaceId}/lessons/${lessonId}`]: { title: "Les teksten", status: "active" },
      [`spaces/${spaceId}/lessons/archive`]: { title: "Tidligere øving", archived: true },
      [`spaces/${spaceId}/writingActivities/letter`]: { title: "Skriv et brev", status: "active" },
      [`spaces/${spaceId}/writingActivities/letter/submissions/legacy-uid`]: { studentUid: firstPupil, status: "planning_submitted" },
      "spaces/other-room": { title: "Et annet syntetisk rom", ownerId: "other-teacher" },
      "spaces/other-room/lessons/writing": { title: "Skriv en setning", status: "active" },
      "spaces/other-room/lessons/writing/submissions/other-room_writing_other-pupil": {
        spaceId: "other-room", assignmentId: "writing", participantId: "other-pupil", uid: "an-earlier-device", status: "draft",
      },
      "spaces/archived-room": { title: "Arkivert rom", ownerId: "other-teacher", archived: true },
      [`spaceMembers/${spaceId}_${firstDevice}`]: membership(firstDevice, firstPupil),
      [`spaceMembers/${spaceId}_${secondDevice}`]: membership(secondDevice, firstPupil),
      [`spaceMembers/${spaceId}_${nextPupil}`]: membership(nextPupil, secondPupil),
      [`spaceMembers/${spaceId}_pending-guest`]: membership("pending-guest", firstPupil, "pending_approval"),
      [`spaceMembers/${spaceId}_removed-guest`]: membership("removed-guest", firstPupil, "revoked"),
      [`spaceMembers/other-room_${nextPupil}`]: membership(nextPupil, "other-pupil", "active", "other-room"),
      [`spaceMembers/archived-room_${nextPupil}`]: membership(nextPupil, "archived-pupil", "active", "archived-room"),
    };
    await Promise.all(Object.entries(fixtures).map(([path, data]) => setDoc(doc(db, path), data)));
  });

  const guest = (uid: string) => {
    const context = env.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } });
    return (context.firestore() as unknown as { _delegate: Firestore })._delegate;
  };

  await t.test("a saved draft opens on a second approved device with a different UID", async () => {
    const first = guest(firstDevice);
    const next = guest(secondDevice);
    const firstScope = await scopes(first, firstDevice);
    const before = await loadStudentContentRoom(first, firstScope[0], firstDevice);
    assert.equal(before?.tasks.find((task) => task.id === lessonId)?.status, "todo");

    const submissionId = await writeDraft(firstDevice, "Syntetisk svar");

    const nextScope = await scopes(next, secondDevice);
    const room = await loadStudentContentRoom(next, nextScope[0], secondDevice);
    const draft = room?.tasks.find((task) => task.id === lessonId);
    assert.equal(draft?.status, "draft");
    assert.equal(draft?.href, `/student/spaces/${spaceId}/assignments/${lessonId}?sid=${submissionId}`);
    const reopened = await getDocFromServer(doc(next, "spaces", spaceId, "lessons", lessonId, "submissions", submissionId));
    assert.deepEqual(reopened.data()?.answers, { question: "Syntetisk svar" });
    assert.equal(await writeDraft(secondDevice, "Fortsetter kladden", submissionId), submissionId);
    const updated = await getDocFromServer(doc(first, "spaces", spaceId, "lessons", lessonId, "submissions", submissionId));
    assert.deepEqual(updated.data()?.answers, { question: "Fortsetter kladden" });
    assert.equal(room?.tasks.find((task) => task.id === "letter")?.status, "planningSubmitted");
    assert.equal(room?.tasks.find((task) => task.id === "archive")?.archived, true);
  });

  await t.test("room choices retain each approved pupil identity and exclude archived rooms", async () => {
    const db = guest(nextPupil);
    const memberships = await scopes(db, nextPupil);
    const choices = (await Promise.all(memberships.map((member) => loadStudentContentRoomChoice(db, member))))
      .filter((choice) => choice !== null);
    assert.deepEqual(choices.map(({ spaceId }) => spaceId).sort(), ["classroom", "other-room"]);
    const classroom = choices.find((choice) => choice.spaceId === spaceId);
    const otherRoom = choices.find((choice) => choice.spaceId === "other-room");
    assert.ok(classroom && otherRoom);
    assert.equal(classroom.participantId, secondPupil);
    assert.equal(otherRoom.participantId, "other-pupil");
    assert.equal(otherRoom.title, "Et annet syntetisk rom");

    const room = await loadStudentContentRoom(db, classroom, nextPupil);
    assert.equal(room?.tasks.find((task) => task.id === lessonId)?.status, "todo");
    assert.equal(room?.tasks.find((task) => task.id === lessonId)?.href, `/student/spaces/${spaceId}/assignments/${lessonId}`);
    assert.equal(room?.tasks.find((task) => task.id === "letter")?.status, "todo");
    const otherWork = await loadStudentContentRoom(db, otherRoom, nextPupil);
    assert.deepEqual(otherWork?.tasks.map(({ id, status }) => ({ id, status })), [{ id: "writing", status: "draft" }]);

    for (const uid of ["pending-guest", "removed-guest", "guest-without-room"]) {
      assert.deepEqual(await scopes(guest(uid), uid), []);
    }
  });
});
