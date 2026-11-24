import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { cert, deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from "firebase-admin/app";
import { FieldValue, getFirestore as getAdminFirestore } from "firebase-admin/firestore";
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
  const encryptionKey = randomBytes(32).toString("base64");
  process.env.SCHOOL_PUPIL_CODE_ENCRYPTION_KEY = encryptionKey;
  t.after(() => { delete process.env.SCHOOL_PUPIL_CODE_ENCRYPTION_KEY; });
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

  type ClientProfile = { role: "teacher"; schoolId: string; schoolRole?: "school_teacher" | "school_admin" }
    | { role: "student" };

  async function client(label: string, profile?: ClientProfile) {
    const app = initializeApp({ apiKey: "local-synthetic", projectId, authDomain: projectId + ".invalid" }, label + "-" + suffix);
    clients.push(app);
    const auth = getAuth(app);
    connectAuthEmulator(auth, "http://127.0.0.1:" + authPort, { disableWarnings: true });
    const firestore = getFirestore(app);
    connectFirestoreEmulator(firestore, "127.0.0.1", Number(firestorePort));
    const { user } = profile
      ? await createUserWithEmailAndPassword(auth, label + "-" + suffix + "@example.invalid", "synthetic-" + randomUUID())
      : await signInAnonymously(auth);
    if (profile?.role === "teacher") {
      const { schoolId, schoolRole = "school_teacher" } = profile;
      await Promise.all([
        db.doc("users/" + user.uid).set({ role: "teacher", schoolId, schoolStatus: "active", schoolRole }),
        db.doc("schools/" + schoolId + "/members/" + user.uid).set({ uid: user.uid, schoolId, role: schoolRole, status: "active" }),
      ]);
    }
    if (profile?.role === "student") {
      await db.doc("users/" + user.uid).set({ role: "student", onboardingComplete: true, studentAccessMode: "space_only" });
    }
    return { auth, firestore, uid: user.uid };
  }

  await Promise.all([school, otherSchool].map(id => db.doc("schools/" + id).set({ status: "active" })));
  const [teacher, colleague, stranger, schoolAdmin, coTeacher, desktop, phone, nextPupil] = await Promise.all([
    client("language-teacher", { role: "teacher", schoolId: school }),
    client("maths-teacher", { role: "teacher", schoolId: school }),
    client("foreign-teacher", { role: "teacher", schoolId: otherSchool }),
    client("school-admin", { role: "teacher", schoolId: school, schoolRole: "school_admin" }),
    client("co-teacher", { role: "teacher", schoolId: school }),
    client("desk"), client("phone"), client("next-pupil"),
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

  async function refresh(as: Auth) {
    const result = await joinRoom(await request(as, "/api/spaces/join", { refreshRooms: true }));
    assert.equal(result.status, 200);
    return (await result.json()).added;
  }

  async function reveal(as: Auth, spaceId: string, targetMemberId: string, status = 200) {
    const result = await writeRoster(await request(as, "/api/roster", { action: "reveal_code", targetMemberId }), room(spaceId));
    assert.equal(result.status, status);
    assert.equal(result.headers.get("cache-control"), "private, no-store");
    return result.json();
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
  assert.deepEqual((await visibleRooms(desktop)).map(room => room.spaceId), [language]);

  const mathsMember = (await write(colleague.auth, maths, { sourceMemberId: pupil.sourceMemberId })).member;
  const sameMember = await write(colleague.auth, maths, { sourceMemberId: pupil.sourceMemberId });
  assert.equal(sameMember.reused, true);
  const privatePath = "schools/" + school + "/spacePupils/" + pupil.id;
  const privatePupil = db.doc(privatePath);
  const stored = (await privatePupil.get()).data();
  assert.ok(stored);
  assert.ok(/^v1\./.test(stored.encryptedCode));
  assert.ok(!JSON.stringify(stored).includes(code));
  assert.equal((await reveal(teacher.auth, language, created.id)).studentCode, code);
  const colleagueCode = await reveal(colleague.auth, maths, mathsMember.id);
  assert.equal(colleagueCode.studentCode, code);
  assert.equal(colleagueCode.displayName, "Nora");
  assert.equal(colleagueCode.fullName, undefined);
  assert.equal((await privatePupil.get()).data()?.encryptedCode, stored.encryptedCode);
  const details = await readRoster(await request(teacher.auth, "/api/roster?memberId=" + created.id), room(language));
  assert.equal(details.status, 200);
  assert.deepEqual((await details.json()).pupil, { fullName, displayName: "Nora" });
  assert.equal((await reveal(colleague.auth, language, created.id, 403)).studentCode, undefined);
  assert.equal((await reveal(colleague.auth, maths, created.id, 404)).studentCode, undefined);
  assert.equal((await reveal(stranger.auth, foreign, mathsMember.id, 404)).studentCode, undefined);
  assert.equal((await reveal(desktop.auth, language, created.id, 403)).studentCode, undefined);

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

  assert.equal((await db.doc("spaceMembers/" + maths + "_" + desktop.uid).get()).exists, false);
  assert.equal(await refresh(nextPupil.auth), 0);
  assert.equal((await db.doc("spaceMembers/" + maths + "_" + nextPupil.uid).get()).exists, false);
  assert.equal(await refresh(desktop.auth), 1);
  assert.equal(await refresh(desktop.auth), 0);
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

  delete process.env.SCHOOL_PUPIL_CODE_ENCRYPTION_KEY;
  try {
    assert.equal((await reveal(colleague.auth, maths, mathsMember.id, 503)).error, "pupil_code_read_failed");
    await write(colleague.auth, maths, { action: "rotate_code", targetMemberId: mathsMember.id }, 503);
    assert.equal((await privatePupil.get()).data()?.codeHash, stored.codeHash);
    assert.equal((await privatePupil.get()).data()?.encryptedCode, stored.encryptedCode);
  } finally {
    process.env.SCHOOL_PUPIL_CODE_ENCRYPTION_KEY = encryptionKey;
  }
  await privatePupil.update({ encryptedCode: FieldValue.delete() });
  assert.equal((await reveal(teacher.auth, language, created.id)).studentCode, null);

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
  const second = (await write(colleague.auth, science, { fullName: "Sam Syntetisk" })).member;
  const secondCode = (await write(colleague.auth, science, { action: "rotate_code", targetMemberId: second.id })).studentCode;
  assert.notEqual(secondCode, second.studentCode);
  const conflicting = await enter(desktop.auth, roomCode("NA"), secondCode);
  assert.equal(conflicting.switchRequired, true);
  assert.equal((await db.doc("spaceMembers/" + science + "_" + desktop.uid).get()).exists, false);
  await enter(nextPupil.auth, roomCode("NA"), secondCode);
  await assert.rejects(getDocFromServer(doc(nextPupil.firestore, draftPath)), /permission/i);

  const recovery = { action: "rotate_code", targetMemberId: mathsMember.id };
  const coTeacherMembership = db.doc(`spaceMembers/${maths}_${coTeacher.uid}`);
  const staffMembership = { spaceId: maths, uid: coTeacher.uid, status: "active", active: true, archived: false };
  await write(coTeacher.auth, maths, recovery, 403);
  await write(schoolAdmin.auth, maths, recovery, 403);
  await coTeacherMembership.set({ ...staffMembership, role: "observer", staffRole: "observer" });
  await write(coTeacher.auth, maths, recovery, 403);
  await coTeacherMembership.set({
    ...staffMembership, role: "substitute", status: "substitute",
    substituteSchoolId: school, substituteExpiresAt: new Date(Date.now() + 60_000),
  });
  await write(coTeacher.auth, maths, recovery, 403);
  await coTeacherMembership.set({ ...staffMembership, role: "teacher", staffRole: "co_teacher" });
  await db.doc(`spaceMembers/${maths}_${stranger.uid}`).set({ ...staffMembership, uid: stranger.uid, role: "co_teacher" });
  await write(stranger.auth, maths, recovery, 403);
  const schoolMembership = db.doc(`schools/${school}/members/${coTeacher.uid}`);
  await schoolMembership.update({ status: "disabled" });
  await write(coTeacher.auth, maths, recovery, 403);
  await schoolMembership.update({ status: "active" });
  await write(coTeacher.auth, maths, { ...recovery, targetMemberId: created.id }, 404);
  assert.equal((await reveal(coTeacher.auth, maths, mathsMember.id, 403)).studentCode, undefined);
  assert.equal((await readRoster(await request(coTeacher.auth, "/api/roster?memberId=" + mathsMember.id), room(maths))).status, 403);
  await write(coTeacher.auth, maths, { action: "rename", targetMemberId: mathsMember.id, fullName: "Feil navn" }, 403);
  await write(coTeacher.auth, maths, { fullName: "Ny elev" }, 403);

  const rotatedCode = (await write(coTeacher.auth, maths, recovery)).studentCode;
  assert.notEqual(rotatedCode, code);
  assert.ok(/^[A-Z0-9]{12}$/.test(rotatedCode));
  const audit = await db.collection("teacherRosterAudit").where("actorUid", "==", coTeacher.uid).get();
  assert.equal(audit.size, 1);
  const event = audit.docs[0].data();
  assert.equal(event.action, "rotate_school_pupil_code");
  assert.equal(event.spaceId, maths);
  assert.equal(event.schoolPupilId, pupil.id);
  assert.equal(event.studentCode, undefined);
  await coTeacherMembership.update({ status: "revoked", active: false, archived: true });
  await write(coTeacher.auth, maths, recovery, 403);
  assert.equal((await reveal(teacher.auth, language, created.id)).studentCode, rotatedCode);
  assert.ok((await privatePupil.get()).data()?.encryptedCode);
  assert.equal(await refresh(phone.auth), 0);
  assert.equal(await refresh(desktop.auth), 0);
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
  assert.equal((await reveal(colleague.auth, maths, mathsMember.id, 404)).studentCode, undefined);
  assert.equal(await refresh(phone.auth), 0);
  await enter(phone.auth, roomCode("MA"), rotatedCode, 403);
  assert.equal((await enter(phone.auth, roomCode("NB"), rotatedCode)).preview, false);
  assert.deepEqual((await visibleRooms(phone)).map(room => room.spaceId).sort(), [language, legacyRoom].sort());

  const readded = (await write(colleague.auth, maths, { sourceMemberId: pupil.sourceMemberId })).member;
  assert.equal(readded.participantId, mathsMember.participantId);
  assert.equal(await refresh(phone.auth), 1);
  assert.equal((await getDocFromServer(doc(phone.firestore, draftPath))).exists(), true);

  await signOut(phone.auth);
  await assert.rejects(getDocFromServer(doc(phone.firestore, draftPath)), /permission/i);

  await t.test("a returning student keeps account rooms and their work when using a school code", async () => {
    const account = await client("returning-account", { role: "student" });
    const originalRooms = [foreign, legacyRoom];
    const oldAssignment = "saved-account-work";
    const answers = { question: "Arbeid fra en tidligere økt" };
    const originalMemberships = await Promise.all(originalRooms.map(async spaceId => {
      const ref = db.doc("spaceMembers/" + spaceId + "_" + account.uid);
      const member = {
        spaceId, uid: account.uid, role: "student", participantId: "account-participant-" + spaceId,
        displayName: "Syntetisk elev", status: "active", active: true, archived: false,
      };
      await Promise.all([
        ref.set(member),
        db.doc("spaces/" + spaceId + "/lessons/" + oldAssignment).set({ title: "Tidligere oppgave", status: "active" }),
      ]);
      const status = spaceId === foreign ? "draft" : "submitted";
      const saved = await saveDraft(await request(account.auth, "/api/draft", {
        payload: { uid: account.uid, participantId: member.participantId, status, title: "Tidligere oppgave", answers },
      }), { params: Promise.resolve({ spaceId, assignmentId: oldAssignment }) });
      assert.equal(saved.status, 200);
      const { submissionId } = await saved.json();
      return { member, ref, status, submissionId };
    }));
    const student = (await write(teacher.auth, language, { fullName: "Syntetisk elev" })).member;
    const pupilId = (await db.doc("spaceMembers/" + student.id).get()).get("schoolPupilId");
    // A school enrollment can overlap a room where the account already has separate work.
    await write(teacher.auth, legacyRoom, { sourceMemberId: pupilId });
    assert.deepEqual((await visibleRooms(account)).map(room => room.spaceId).sort(), originalRooms.sort());

    const joined = await enter(account.auth, roomCode("NB"), student.studentCode);
    assert.equal(joined.signedInAccount, true);
    assert.equal(joined.switchRequired, false);
    assert.equal(joined.preview, false);
    assert.equal((await db.doc("spacePupilSessions/" + account.uid).get()).get("pupilId"), pupilId);

    const included = (await write(colleague.auth, maths, { sourceMemberId: pupilId })).member;
    assert.equal(await refresh(account.auth), 1);
    const rooms = await visibleRooms(account);
    assert.deepEqual(rooms.map(room => room.spaceId).sort(), [...originalRooms, language, maths].sort());
    assert.equal(rooms.find(room => room.spaceId === maths)?.participantId, included.participantId);

    const sameRoom = await enter(account.auth, roomCode("LE"), student.studentCode);
    assert.equal(sameRoom.switchRequired, true);
    assert.equal((await enter(account.auth, roomCode("NA"), secondCode)).switchRequired, true);
    for (const { member, ref, status, submissionId } of originalMemberships) {
      assert.deepEqual((await ref.get()).data(), member);
      const room = rooms.find(room => room.spaceId === member.spaceId);
      assert.ok(room);
      const content = await loadStudentContentRoom(account.firestore, room, account.uid);
      assert.equal(content?.tasks.find(task => task.id === oldAssignment)?.status, status);
      const submission = doc(account.firestore, "spaces", member.spaceId, "lessons", oldAssignment, "submissions", submissionId);
      assert.deepEqual((await getDocFromServer(submission)).data()?.answers, answers);
    }
  });

  await t.test("a signed-in student can keep separately verified rooms at two schools", async () => {
    const account = await client("account-with-school-code", { role: "student" });
    const original = (await write(teacher.auth, language, { fullName: "Lokal elev med eldre kode" })).member;
    const originalLogin = await enter(account.auth, roomCode("NB"), original.studentCode);
    assert.equal(originalLogin.preview, false);
    assert.equal(originalLogin.signedInAccount, true);
    const originalMembership = db.doc("spaceMembers/" + language + "_" + account.uid);
    const initialMembership = (await originalMembership.get()).data();
    const oldAssignment = "previous-school-draft";
    const answers = { note: "Syntetisk kladd fra den første skolen" };
    await db.doc("spaces/" + language + "/lessons/" + oldAssignment).set({ title: "Eldre skolearbeid", status: "active" });
    const saved = await saveDraft(await request(account.auth, "/api/draft", {
      payload: { uid: account.uid, participantId: original.participantId, status: "draft", title: "Eldre skolearbeid", answers },
    }), { params: Promise.resolve({ spaceId: language, assignmentId: oldAssignment }) });
    assert.equal(saved.status, 200);
    const { submissionId } = await saved.json();
    const oldDraft = doc(account.firestore, "spaces", language, "lessons", oldAssignment, "submissions", submissionId);

    const added = (await write(stranger.auth, foreign, { fullName: "Lokal elev med eldre kode" })).member;
    const guest = await client("guest-with-school-code");
    assert.equal((await enter(guest.auth, roomCode("NB"), original.studentCode)).preview, false);
    assert.equal((await enter(guest.auth, roomCode("FR"), added.studentCode)).switchRequired, true);
    assert.deepEqual((await visibleRooms(guest)).map(room => room.spaceId), [language]);

    const joined = await enter(account.auth, roomCode("FR"), added.studentCode);
    assert.equal(joined.signedInAccount, true);
    assert.equal(joined.switchRequired, false, "A verified pupil code from another school should keep the student signed in");
    assert.equal(joined.preview, false);
    assert.deepEqual((await visibleRooms(account)).map(room => room.spaceId).sort(), [foreign, language].sort());
    assert.deepEqual((await originalMembership.get()).data(), initialMembership);
    assert.deepEqual((await getDocFromServer(oldDraft)).data()?.answers, answers);

    const otherTeacher = await client("second-school-colleague", { role: "teacher", schoolId: otherSchool });
    const foreignFollowUp = "foreign-follow-up-" + suffix;
    await db.doc("spaces/" + foreignFollowUp).set({
      schoolId: otherSchool, ownerId: otherTeacher.uid, title: "Nytt rom ved den andre skolen", code: roomCode("OF"), isOpen: true,
    });
    const originalPupil = (await db.doc("spaceMembers/" + original.id).get()).get("schoolPupilId");
    const addedPupil = (await db.doc("spaceMembers/" + added.id).get()).get("schoolPupilId");
    await write(colleague.auth, science, { sourceMemberId: originalPupil });
    await write(otherTeacher.auth, foreignFollowUp, { sourceMemberId: addedPupil });
    assert.equal(await refresh(account.auth), 2);
    assert.deepEqual((await visibleRooms(account)).map(room => room.spaceId).sort(), [language, science, foreign, foreignFollowUp].sort());

    assert.equal((await enter(account.auth, roomCode("NA"), secondCode)).switchRequired, true);
    assert.equal((await db.doc("spaceMembers/" + science + "_" + account.uid).get()).get("schoolPupilId"), originalPupil);
    const recovery = (await write(teacher.auth, language, { action: "rotate_code", targetMemberId: original.id })).studentCode;
    assert.equal(await refresh(account.auth), 0);
    await assert.rejects(getDocFromServer(oldDraft), /permission/i);
    assert.deepEqual((await visibleRooms(account)).map(room => room.spaceId).sort(), [foreign, foreignFollowUp].sort());
    assert.equal((await enter(account.auth, roomCode("NB"), recovery)).preview, false);
    assert.deepEqual((await getDocFromServer(oldDraft)).data()?.answers, answers);
    assert.deepEqual((await visibleRooms(account)).map(room => room.spaceId).sort(), [foreign, foreignFollowUp, language, science].sort());
  });
});
