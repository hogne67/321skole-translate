import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { test } from "node:test";
import { cert, deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInAnonymously, signOut, type Auth } from "firebase/auth";
import { collection, connectFirestoreEmulator, doc, getDocFromServer, getDocsFromServer, getFirestore, query, updateDoc, where } from "firebase/firestore";
import { NextRequest } from "next/server";
import { listStudentContentMemberships, loadStudentContentRoom, loadStudentContentRoomChoice } from "./studentContentTasks";

const projectId = "demo-school-space-pupils";
const firestorePort = /^127\.0\.0\.1:(\d+)$/.exec(process.env.FIRESTORE_EMULATOR_HOST ?? "")?.[1];
const authPort = /^127\.0\.0\.1:(\d+)$/.exec(process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "")?.[1];

test("one school-code login opens all eligible rooms and follows drafts across browsers and code rotation", {
  skip: !firestorePort || !authPort || process.env.GOOGLE_CLOUD_PROJECT !== projectId,
}, async t => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" } });
  const adminApp = initializeAdminApp({ projectId, credential: cert({ projectId, clientEmail: "demo@example.invalid", privateKey }) });
  const db = getAdminFirestore(adminApp);
  const suffix = randomUUID().slice(0, 8);
  const clients: ReturnType<typeof initializeApp>[] = [];
  t.after(async () => {
    await Promise.all(clients.map(deleteApp));
    await deleteAdminApp(adminApp);
  });
  const school = "school-" + suffix;
  const otherSchool = "foreign-" + suffix;
  const language = "language-" + suffix;
  const maths = "maths-" + suffix;
  const science = "science-" + suffix;
  const foreign = "foreign-room-" + suffix;
  const legacyRoom = "legacy-" + suffix;
  const archived = "archived-" + suffix;
  const deleted = "deleted-" + suffix;
  const revoked = "revoked-" + suffix;
  const legacyParticipant = "older-pupil";
  const legacyMemberId = legacyRoom + "_" + legacyParticipant;
  const roomCode = (prefix: string) => prefix + suffix.toUpperCase();

  async function client(label: string, schoolId?: string, schoolRole = "school_teacher") {
    const app = initializeApp({ apiKey: "local-synthetic", projectId, authDomain: projectId + ".invalid" }, label + "-" + suffix);
    clients.push(app);
    const auth = getAuth(app);
    connectAuthEmulator(auth, "http://127.0.0.1:" + authPort, { disableWarnings: true });
    const firestore = getFirestore(app);
    connectFirestoreEmulator(firestore, "127.0.0.1", Number(firestorePort));
    const { user } = schoolId
      ? await createUserWithEmailAndPassword(auth, label + "-" + suffix + "@example.invalid", "synthetic-" + randomUUID())
      : await signInAnonymously(auth);
    if (schoolId) {
      await Promise.all([
        db.doc("users/" + user.uid).set({ role: "teacher", schoolId, schoolStatus: "active", schoolRole }),
        db.doc("schools/" + schoolId + "/members/" + user.uid).set({ uid: user.uid, schoolId, role: schoolRole, status: "active" }),
      ]);
    }
    return { auth, firestore, uid: user.uid };
  }

  await Promise.all([school, otherSchool].map(id => db.doc("schools/" + id).set({ status: "active" })));
  const [teacher, colleague, stranger, schoolAdmin, desktop, phone, nextPupil] = await Promise.all([
    client("language-teacher", school), client("maths-teacher", school), client("foreign-teacher", otherSchool),
    client("school-admin", school, "school_admin"), client("desk"), client("phone"), client("next-pupil"),
  ]);
  const fixtures = [
    [language, school, teacher.uid, "Norsk", roomCode("NB")],
    [maths, school, colleague.uid, "Matte", roomCode("MA")],
    [science, school, colleague.uid, "Naturfag", roomCode("NA")],
    [foreign, otherSchool, stranger.uid, "Ekstern skole", roomCode("FR")],
    [legacyRoom, school, teacher.uid, "Eldre elevrom", roomCode("LE")],
    [archived, school, teacher.uid, "Arkivert rom", roomCode("AR")],
    [deleted, school, teacher.uid, "Slettet rom", roomCode("DL")],
    [revoked, school, teacher.uid, "Tilgang trukket tilbake", roomCode("RE")],
  ];
  await Promise.all(fixtures.map(([spaceId, schoolId, ownerId, title, code]) =>
    db.doc("spaces/" + spaceId).set({ ownerId, schoolId, title, code, isOpen: true })));
  const assignmentId = "counting";
  await db.doc("spaces/" + maths + "/lessons/" + assignmentId).set({ title: "Tell figurene", status: "active" });
  await db.doc("spaceMembers/" + legacyMemberId).set({
    spaceId: legacyRoom, participantId: legacyParticipant, role: "student", displayName: "Gammel Nora",
    teacherManaged: true, status: "active", active: true, archived: false, isAnon: true,
    studentCode: "A4B6C", studentCodeKey: legacyRoom + ":A4B6C",
  });

  const { GET: readRoster, POST: writeRoster } = await import("../app/api/teacher/spaces/[spaceId]/members/create-student/route");
  const { PATCH: patchMember } = await import("../app/api/teacher/spaces/[spaceId]/members/[memberId]/route");
  const { POST: joinRoom } = await import("../app/api/spaces/join/route");
  const { POST: saveDraft } = await import("../app/api/student/spaces/[spaceId]/lessons/[assignmentId]/submission/route");

  async function request(as: Auth, path: string, body?: object, method = body ? "POST" : "GET") {
    const token = await as.currentUser?.getIdToken();
    assert.ok(token);
    return new NextRequest("http://127.0.0.1" + path, {
      method, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  function room(spaceId: string) {
    return { params: Promise.resolve({ spaceId }) };
  }
  async function write(as: Auth, spaceId: string, body: object, status = 200) {
    const result = await writeRoster(await request(as, "/api/roster", body), room(spaceId));
    const data = await result.json();
    assert.equal(result.status, status, JSON.stringify(data));
    return data;
  }
  async function enter(as: Auth, code: string, studentCode: string, status = 200) {
    const result = await joinRoom(await request(as, "/api/spaces/join", { code, studentCode, submit: true }));
    const data = await result.json();
    assert.equal(result.status, status, JSON.stringify(data));
    return data;
  }

  async function visibleRooms(as: { firestore: typeof desktop.firestore; uid: string }) {
    const snapshot = await getDocsFromServer(query(collection(as.firestore, "spaceMembers"), where("uid", "==", as.uid)));
    const memberships = listStudentContentMemberships(snapshot.docs, as.uid);
    const rooms = await Promise.all(memberships.map(member => loadStudentContentRoomChoice(as.firestore, member)));
    return rooms.filter(room => room !== null);
  }

  const fullName = "Nora Syntetisk";
  const created = (await write(teacher.auth, language, { fullName, displayName: "Nora" })).member;
  const code: string = created.studentCode;
  assert.ok(code);
  const list = await readRoster(await request(colleague.auth, "/api/roster"), room(maths));
  assert.equal(list.status, 200);
  const [pupil] = (await list.json()).students;
  assert.equal(pupil.fullName, fullName);
  assert.equal(pupil.displayName, "Nora");
  assert.equal(pupil.spaces[0].spaceId, language);
  assert.equal(JSON.stringify(pupil).includes(code), false);
  const mathsMember = (await write(colleague.auth, maths, { sourceMemberId: pupil.sourceMemberId })).member;
  const sameMember = await write(colleague.auth, maths, { sourceMemberId: pupil.sourceMemberId });
  assert.equal(sameMember.reused, true);
  for (const spaceId of [archived, deleted]) await write(teacher.auth, spaceId, { sourceMemberId: pupil.sourceMemberId });
  const revokedMember = (await write(teacher.auth, revoked, { sourceMemberId: pupil.sourceMemberId })).member;
  const existingMathEnrollment = await db.doc("spaceMembers/" + mathsMember.id).get();
  await Promise.all([
    db.doc("spaces/" + archived).update({ status: "ARCHIVED" }),
    db.doc("spaces/" + deleted).update({ deletedAt: new Date() }),
    // A room at a different school is excluded even if it has an inconsistent enrollment.
    db.doc("spaceMembers/" + foreign + "_schoolpupil_" + pupil.id)
      .set({ ...existingMathEnrollment.data(), spaceId: foreign }),
    ...[desktop, phone].map(as => db.doc("spaceMembers/" + revoked + "_" + as.uid).set({
      spaceId: revoked, uid: as.uid, role: "student", participantId: revokedMember.participantId,
      schoolPupilId: pupil.id, schoolPupilSchoolId: school, active: false, archived: true, status: "revoked",
    })),
  ]);

  const preview = await joinRoom(await request(desktop.auth, "/api/spaces/join", {
    code: roomCode("NB"), studentCode: code,
  }));
  assert.equal(preview.status, 200);
  assert.equal((await preview.json()).preview, true);
  assert.deepEqual(await visibleRooms(desktop), []);

  const desktopAccess = await enter(desktop.auth, roomCode("NB"), code);
  assert.equal(desktopAccess.displayName, "Nora");
  assert.equal(desktopAccess.preview, false);
  assert.equal(desktopAccess.approvalRequired, undefined);
  assert.equal(JSON.stringify(desktopAccess).includes(fullName), false);
  assert.equal(desktopAccess.participantId, created.participantId);
  const desktopRooms = await visibleRooms(desktop);
  assert.deepEqual(desktopRooms.map(room => room.spaceId).sort(), [language, maths].sort());
  assert.equal(desktopRooms.find(room => room.spaceId === maths)?.participantId, mathsMember.participantId);
  for (const spaceId of [science, foreign, legacyRoom, archived, deleted]) {
    assert.equal((await db.doc("spaceMembers/" + spaceId + "_" + desktop.uid).get()).exists, false);
  }
  assert.equal((await db.doc("spaceMembers/" + revoked + "_" + desktop.uid).get()).get("status"), "revoked");
  await enter(phone.auth, roomCode("NA"), code, 403);
  await enter(phone.auth, roomCode("FR"), code, 403);
  await write(stranger.auth, foreign, { sourceMemberId: pupil.sourceMemberId }, 404);
  assert.equal((await readRoster(await request(schoolAdmin.auth, "/api/roster"), room(language))).status, 403);
  assert.equal((await readRoster(await request(phone.auth, "/api/roster"), room(language))).status, 403);
  assert.equal((await readRoster(await request(colleague.auth, "/api/roster?memberId=" + created.id), room(maths))).status, 404);

  const pupilRow = await getDocFromServer(doc(desktop.firestore, "spaceMembers", language + "_" + desktop.uid));
  assert.equal(pupilRow.data()?.displayName, "Nora");
  assert.equal(pupilRow.data()?.studentCode, undefined);
  assert.equal(pupilRow.data()?.fullName, undefined);
  const privatePath = "schools/" + school + "/spacePupils/" + pupil.id;
  await assert.rejects(getDocFromServer(doc(desktop.firestore, privatePath)), /permission/i);
  await assert.rejects(getDocFromServer(doc(teacher.firestore, privatePath)), /permission/i);
  await assert.rejects(updateDoc(doc(teacher.firestore, "spaceMembers", created.id), { displayName: "Klientendring" }), /permission/i);

  const response = await saveDraft(await request(desktop.auth, "/api/draft", {
    payload: { uid: desktop.uid, participantId: mathsMember.participantId, status: "draft", title: "Tell figurene", answers: { question: "Syntetisk svar" } },
  }), { params: Promise.resolve({ spaceId: maths, assignmentId }) });
  const saved = await response.json();
  assert.equal(response.status, 200, JSON.stringify(saved));
  const draftPath = "spaces/" + maths + "/lessons/" + assignmentId + "/submissions/" + saved.submissionId;
  const phoneAccess = await enter(phone.auth, roomCode("NB"), code);
  assert.equal(phoneAccess.participantId, created.participantId);
  const phoneMaths = (await visibleRooms(phone)).find(room => room.spaceId === maths);
  assert.equal(phoneMaths?.participantId, mathsMember.participantId);
  assert.ok(phoneMaths);
  const phoneContent = await loadStudentContentRoom(phone.firestore, phoneMaths, phone.uid);
  assert.equal(phoneContent?.tasks.find(task => task.id === assignmentId)?.status, "draft");
  assert.deepEqual((await getDocFromServer(doc(phone.firestore, draftPath))).data()?.answers, { question: "Syntetisk svar" });

  const legacy = await enter(nextPupil.auth, roomCode("LE"), "A4B6C");
  assert.equal(legacy.approvalRequired, true);
  await write(teacher.auth, legacyRoom, { targetMemberId: legacyMemberId, sourceMemberId: pupil.sourceMemberId });
  await enter(phone.auth, roomCode("NB"), code);
  assert.equal((await visibleRooms(phone)).find(room => room.spaceId === legacyRoom)?.participantId, legacyParticipant);
  await enter(phone.auth, roomCode("LE"), "A4B6C", 403);

  const renamed = await write(colleague.auth, maths, {
    action: "rename", targetMemberId: mathsMember.id, fullName: "Nora Eksempel", displayName: "No",
  });
  assert.equal(renamed.pupil.displayName, "No");
  assert.equal((await getDocFromServer(doc(phone.firestore, "spaceMembers", language + "_" + phone.uid))).data()?.displayName, "No");
  const secondCode = (await write(colleague.auth, science, { fullName: "Sam Syntetisk" })).member.studentCode;
  const conflicting = await enter(desktop.auth, roomCode("NA"), secondCode);
  assert.equal(conflicting.switchRequired, true);
  assert.equal((await db.doc("spaceMembers/" + science + "_" + desktop.uid).get()).exists, false);
  await enter(nextPupil.auth, roomCode("NA"), secondCode);
  await assert.rejects(getDocFromServer(doc(nextPupil.firestore, draftPath)), /permission/i);

  const rotatedCode = (await write(colleague.auth, maths, { action: "rotate_code", targetMemberId: mathsMember.id })).studentCode;
  assert.notEqual(rotatedCode, code);
  await enter(phone.auth, roomCode("NB"), code, 403);
  await assert.rejects(getDocFromServer(doc(phone.firestore, draftPath)), /permission/i);
  await assert.rejects(getDocFromServer(doc(desktop.firestore, "spaces", maths)), /permission/i);
  const reopened = await enter(phone.auth, roomCode("NB"), rotatedCode);
  assert.equal(reopened.displayName, "No");
  assert.equal(reopened.participantId, created.participantId);
  assert.equal((await getDocFromServer(doc(phone.firestore, draftPath))).exists(), true);
  assert.equal((await visibleRooms(phone)).find(room => room.spaceId === maths)?.participantId, mathsMember.participantId);

  const removed = await patchMember(await request(colleague.auth, "/api/members", { action: "remove" }, "PATCH"), {
    params: Promise.resolve({ spaceId: maths, memberId: mathsMember.id }),
  });
  assert.equal(removed.status, 200);
  await enter(phone.auth, roomCode("MA"), rotatedCode, 403);
  assert.equal((await enter(phone.auth, roomCode("NB"), rotatedCode)).preview, false);
  assert.deepEqual((await visibleRooms(phone)).map(room => room.spaceId).sort(), [language, legacyRoom].sort());

  await signOut(phone.auth);
  await assert.rejects(getDocFromServer(doc(phone.firestore, draftPath)), /permission/i);
});
