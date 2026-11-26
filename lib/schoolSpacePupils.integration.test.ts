import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { cert, deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore as getAdminFirestore, Timestamp } from "firebase-admin/firestore";
import { deleteApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator, createUserWithEmailAndPassword, EmailAuthProvider, getAuth,
  GoogleAuthProvider, linkWithCredential, OAuthProvider, signInAnonymously, signInWithCredential,
  signInWithEmailAndPassword, signOut, type Auth, type AuthCredential,
} from "firebase/auth";
import { collection, connectFirestoreEmulator, doc, getDocFromServer, getDocsFromServer, getFirestore, query, updateDoc, where } from "firebase/firestore";
import { NextRequest } from "next/server";
import { getBucketLimit } from "./featureAccess";
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

  type ClientProfile = { role: "teacher"; schoolId?: string; schoolRole?: "school_teacher" | "school_admin" }
    | { role: "student" };

  async function client(label: string, profile?: ClientProfile, credential?: AuthCredential) {
    const app = initializeApp({ apiKey: "local-synthetic", projectId, authDomain: projectId + ".invalid" }, label + "-" + suffix);
    clients.push(app);
    const auth = getAuth(app);
    connectAuthEmulator(auth, "http://127.0.0.1:" + authPort, { disableWarnings: true });
    const firestore = getFirestore(app);
    connectFirestoreEmulator(firestore, "127.0.0.1", Number(firestorePort));
    const { user } = credential ? await signInWithCredential(auth, credential) : profile
      ? await createUserWithEmailAndPassword(auth, label + "-" + suffix + "@example.invalid", "synthetic-" + randomUUID())
      : await signInAnonymously(auth);
    if (profile?.role === "teacher" && profile.schoolId) {
      const { schoolId, schoolRole = "school_teacher" } = profile;
      await Promise.all([
        db.doc("users/" + user.uid).set({ role: "teacher", schoolId, schoolStatus: "active", schoolRole }),
        db.doc("schools/" + schoolId + "/members/" + user.uid).set({ uid: user.uid, schoolId, role: schoolRole, status: "active" }),
      ]);
    }
    if (profile?.role === "teacher" && !profile.schoolId) {
      await db.doc("users/" + user.uid).set({ role: "teacher", onboardingComplete: true });
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

  await t.test("a teacher accepting a school invitation keeps the private room and uses separate room rosters", async () => {
    const privateTeacher = await client("private-teacher-invited", { role: "teacher" });
    const schoolId = "new-school-" + suffix;
    await db.doc("schools/" + schoolId).set({ name: "Syntetisk skole", status: "active", teacherSeatLimit: 3 });
    const { POST: createSpace } = await import("../app/api/teacher/spaces/create/route");
    const { GET: getTeacherSchool } = await import("../app/api/teacher/spaces/school/route");
    const { createSchoolInvites } = await import("./schools/server/createSchoolInvite");
    const { acceptSchoolInvite } = await import("./schools/server/acceptSchoolInvite");
    const requestForTeacher = (path: string, body?: object) => request(privateTeacher.auth, path, body);
    const privateRoom = await createSpace(await requestForTeacher("/api/spaces/create", { title: "Privat rom", area: "private" }));
    assert.equal(privateRoom.status, 200);
    const { spaceId: privateId } = await privateRoom.json();
    const privatePupil = (await write(privateTeacher.auth, privateId, { displayName: "Privat syntetisk elev" })).member;
    const originalPrivateRoom = (await db.doc("spaces/" + privateId).get()).data();
    const originalPupil = (await db.doc("spaceMembers/" + privatePupil.id).get()).data();
    assert.equal(originalPrivateRoom?.schoolId, null);
    assert.deepEqual(await (await getTeacherSchool(await requestForTeacher("/api/teacher/spaces/school"))).json(), { school: null });

    const email = privateTeacher.auth.currentUser?.email;
    assert.ok(email);
    const created = await createSchoolInvites({ schoolId, invitedBy: teacher.uid, recipients: [{ email }] });
    assert.ok(created.ok && created.invites?.[0]?.token);
    const accepted = await acceptSchoolInvite({ token: created.invites[0].token, email, uid: privateTeacher.uid });
    assert.equal(accepted.ok, true);
    assert.deepEqual(await (await getTeacherSchool(await requestForTeacher("/api/teacher/spaces/school"))).json(),
      { school: { id: schoolId, name: "Syntetisk skole", allowPupilCodeAccess: true } });

    const newRoom = await createSpace(await requestForTeacher("/api/spaces/create", { title: "Skolerom", area: "school", schoolId }));
    assert.equal(newRoom.status, 200);
    const { spaceId: schoolRoomId } = await newRoom.json();
    assert.equal((await db.doc("spaces/" + schoolRoomId).get()).get("schoolId"), schoolId);
    await write(privateTeacher.auth, schoolRoomId, { fullName: "Skolens syntetiske elev", displayName: "Skoleelev" });
    const list = async (id: string) => {
      const result = await readRoster(await requestForTeacher("/api/roster"), room(id));
      assert.equal(result.status, 200);
      return (await result.json()).students.map((pupil: { displayName: string }) => pupil.displayName);
    };
    assert.deepEqual(await list(privateId), ["Privat syntetisk elev"]);
    assert.deepEqual(await list(schoolRoomId), ["Skoleelev"]);
    assert.deepEqual((await db.doc("spaces/" + privateId).get()).data(), originalPrivateRoom);
    assert.deepEqual((await db.doc("spaceMembers/" + privatePupil.id).get()).data(), originalPupil);

    const privateCreation = await createSpace(await requestForTeacher("/api/spaces/create", { title: "Utenfor skolelisensen", area: "private" }));
    assert.equal(privateCreation.status, 403);
    const otherSchoolCreation = await createSpace(await requestForTeacher("/api/spaces/create", { title: "Annen skole", area: "school", schoolId: otherSchool }));
    assert.equal(otherSchoolCreation.status, 403);
  });

  await t.test("only the invited verified account joins a school room with its room code", async () => {
    const { POST: invite, GET: pendingInvites, DELETE: withdraw } =
      await import("../app/api/teacher/spaces/[spaceId]/members/invite-account/route");
    const schoolId = "account-school-" + suffix;
    const [owner, pupil, outsider] = await Promise.all([
      client("account-teacher", { role: "teacher", schoolId }),
      client("account-pupil", { role: "student" }),
      client("other-account-pupil", { role: "student" }),
    ]);
    const invitedRoom = "account-room-" + suffix;
    const anotherRoom = "other-account-room-" + suffix;
    const privateRoom = "original-account-room-" + suffix;
    const email = pupil.auth.currentUser?.email;
    const originalParticipant = "original-account-participant";
    assert.ok(email);
    const originalMembership = {
      uid: pupil.uid, spaceId: privateRoom, role: "student", participantId: originalParticipant,
      displayName: "Opprinnelig elev", active: true, archived: false, status: "active",
    };
    const originalAssignment = "tidligere-arbeid";
    const originalPath = "spaces/" + privateRoom + "/lessons/" + originalAssignment;
    await Promise.all([
      db.doc("schools/" + schoolId).set({ status: "active", teacherSeatLimit: 3 }),
      db.doc("spaces/" + invitedRoom).set({ ownerId: owner.uid, schoolId, code: roomCode("AC"), title: "Kontorom", isOpen: true }),
      db.doc("spaces/" + anotherRoom).set({ ownerId: owner.uid, schoolId, code: roomCode("AX"), title: "Annet rom", isOpen: true }),
      db.doc("spaces/" + privateRoom).set({ ownerId: owner.uid, schoolId: null, code: roomCode("PV"), title: "Privatrom", isOpen: true }),
      db.doc("spaceMembers/" + privateRoom + "_" + pupil.uid).set(originalMembership),
      db.doc(originalPath).set({ title: "Tidligere arbeid", status: "active" }),
    ]);
    const saved = await saveDraft(await request(pupil.auth, "/api/draft", {
      payload: { uid: pupil.uid, participantId: originalParticipant, status: "draft", title: "Tidligere arbeid", answers: { question: "Egen kladd" } },
    }), { params: Promise.resolve({ spaceId: privateRoom, assignmentId: originalAssignment }) });
    assert.equal(saved.status, 200);
    const { submissionId } = await saved.json();
    const originalDraft = db.doc(originalPath + "/submissions/" + submissionId);
    const originalDraftData = (await originalDraft.get()).data();
    const originalProfile = (await db.doc("users/" + pupil.uid).get()).data();
    const office = "/api/teacher/spaces/members/invite-account";
    const addEmail = async (as: Auth, spaceId: string, value: string) =>
      invite(await request(as, office, { email: value }), room(spaceId));
    const list = async (as: Auth, spaceId: string) =>
      pendingInvites(await request(as, office), room(spaceId));
    const enterAccount = async (as: Auth, code: string, error?: string) => {
      const reply = await joinRoom(await request(as, "/api/spaces/join", { method: "account", code, submit: true }));
      const body = await reply.json();
      assert.equal(reply.status, error ? 403 : 200, JSON.stringify(body));
      if (error) assert.equal(body.error, error);
      return body;
    };
    assert.equal((await addEmail(teacher.auth, invitedRoom, email)).status, 403);
    assert.equal((await list(teacher.auth, invitedRoom)).status, 403);
    assert.equal((await addEmail(owner.auth, privateRoom, email)).status, 200);
    assert.equal((await addEmail(owner.auth, invitedRoom, "invalid-address")).status, 400);

    assert.equal((await addEmail(owner.auth, invitedRoom, " " + email.toUpperCase() + " ")).status, 200);
    assert.equal((await addEmail(owner.auth, invitedRoom, email)).status, 200);
    const pending = (await (await list(owner.auth, invitedRoom)).json()).invitations;
    assert.equal(pending.length, 1);
    assert.equal(pending[0].email, email);
    const invitationPath = "spaces/" + invitedRoom + "/accountInvitations/" + pending[0].id;
    await assert.rejects(getDocFromServer(doc(owner.firestore, invitationPath)), /permission/i);
    assert.equal((await withdraw(await request(owner.auth, office, { invitationId: pending[0].id }, "DELETE"), room(anotherRoom))).status, 409);

    await enterAccount(nextPupil.auth, roomCode("AC"), "account_required");
    await enterAccount(pupil.auth, roomCode("AC"), "account_email_unverified");
    for (const account of [pupil, outsider]) {
      await getAdminAuth(adminApp).updateUser(account.uid, { emailVerified: true });
      const user = account.auth.currentUser;
      assert.ok(user);
      await user.getIdToken(true);
    }
    await enterAccount(pupil.auth, roomCode("PV"));
    await enterAccount(pupil.auth, roomCode("AX"), "account_invitation_required");
    await enterAccount(outsider.auth, roomCode("AC"), "account_invitation_required");
    assert.equal((await withdraw(await request(owner.auth, office, { invitationId: pending[0].id }, "DELETE"), room(invitedRoom))).status, 200);
    await enterAccount(pupil.auth, roomCode("AC"), "account_invitation_required");
    assert.equal((await addEmail(owner.auth, invitedRoom, email)).status, 200);
    const profile = db.doc("users/" + pupil.uid);
    await profile.update({ schoolId: otherSchool, schoolStatus: "active" });
    await enterAccount(pupil.auth, roomCode("AC"), "account_invitation_required");
    await profile.set(originalProfile!);

    const issuingTeacher = db.doc(`schools/${schoolId}/members/${owner.uid}`);
    await issuingTeacher.update({ status: "inactive" });
    await enterAccount(pupil.auth, roomCode("AC"), "room_unavailable");
    assert.equal((await db.doc(invitationPath).get()).get("status"), "pending");
    await issuingTeacher.update({ status: "active" });

    const capacityRows = Array.from({ length: getBucketLimit("teacher", "plus", "members") }, (_, index) =>
      db.doc("spaceMembers/" + anotherRoom + "_capacity_" + index));
    const fillCapacity = db.batch();
    for (const row of capacityRows) {
      fillCapacity.create(row, { spaceId: anotherRoom, participantId: row.id, role: "student", active: true, status: "active" });
    }
    await fillCapacity.commit();
    await enterAccount(pupil.auth, roomCode("AC"), "account_capacity_reached");
    assert.equal((await db.doc(invitationPath).get()).get("status"), "pending");
    const freeCapacity = db.batch();
    for (const row of capacityRows) freeCapacity.delete(row);
    await freeCapacity.commit();

    const accepted = await enterAccount(pupil.auth, roomCode("AC"));
    assert.deepEqual(accepted, { ok: true, spaceId: invitedRoom, title: "Kontorom", preview: false });
    assert.deepEqual(await enterAccount(pupil.auth, roomCode("AC")), accepted);
    const membership = db.doc("spaceMembers/" + invitedRoom + "_" + pupil.uid);
    assert.equal((await membership.get()).get("participantId"), pupil.uid);
    assert.deepEqual((await visibleRooms(pupil)).map(value => value.spaceId).sort(), [invitedRoom, privateRoom].sort());
    assert.deepEqual((await db.doc("spaceMembers/" + privateRoom + "_" + pupil.uid).get()).data(), originalMembership);
    assert.deepEqual((await originalDraft.get()).data(), originalDraftData);
    assert.deepEqual((await profile.get()).data(), originalProfile);
    assert.deepEqual((await (await list(owner.auth, invitedRoom)).json()).invitations, []);
    assert.equal((await addEmail(owner.auth, invitedRoom, email)).status, 409);
    assert.equal((await withdraw(await request(owner.auth, office, { invitationId: pending[0].id }, "DELETE"), room(invitedRoom))).status, 409);
    const recorded = (await db.doc(invitationPath).get()).data();
    assert.equal(recorded?.status, "accepted");
    assert.equal(recorded?.email, undefined);

    const removed = await patchMember(await request(owner.auth, "/api/member", { action: "remove" }, "PATCH"),
      { params: Promise.resolve({ spaceId: invitedRoom, memberId: membership.id }) });
    assert.equal(removed.status, 200);
    await enterAccount(pupil.auth, roomCode("AC"), "access_revoked");
    await membership.delete();
    await enterAccount(pupil.auth, roomCode("AC"), "account_invitation_required");
  });

  await t.test("private teacher invitations use the private roster and a verified account", async () => {
    const { POST: invite, GET: pendingInvites, DELETE: withdraw } =
      await import("../app/api/teacher/spaces/[spaceId]/members/invite-account/route");
    const [owner, pupil, outsider] = await Promise.all([
      client("private-invite-owner", { role: "teacher" }),
      client("private-invite-pupil", { role: "student" }),
      client("private-invite-outsider", { role: "student" }),
    ]);
    const invitedRoom = "private-invite-room-" + suffix;
    const quotaRoom = "private-quota-room-" + suffix;
    const familyRoom = "private-family-room-" + suffix;
    const schoolRoom = "school-quota-room-" + suffix;
    const email = pupil.auth.currentUser?.email;
    assert.ok(email);
    await Promise.all([
      db.doc("spaces/" + invitedRoom).set({ ownerUid: owner.uid, code: roomCode("PI"), title: "Privat invitasjonsrom", isOpen: true }),
      db.doc("spaces/" + quotaRoom).set({ ownerId: owner.uid, schoolId: null, code: roomCode("PQ"), isOpen: true }),
      db.doc("spaces/" + schoolRoom).set({ ownerId: owner.uid, schoolId: school, code: roomCode("SQ"), isOpen: true }),
      db.doc("spaces/" + familyRoom).set({ ownerId: owner.uid, kind: "family", code: roomCode("PF"), isOpen: true }),
    ]);
    const office = "/api/teacher/spaces/members/invite-account";
    async function addEmail(as: Auth, spaceId: string) {
      return invite(await request(as, office, { email }), room(spaceId));
    }
    async function enterAccount(as: Auth, error?: string) {
      const result = await joinRoom(await request(as, "/api/spaces/join", { method: "account", code: roomCode("PI"), submit: true }));
      const data = await result.json();
      assert.equal(result.status, error ? 403 : 200, JSON.stringify(data));
      if (error) assert.equal(data.error, error);
    }
    assert.equal((await addEmail(teacher.auth, invitedRoom)).status, 403);
    assert.equal((await addEmail(owner.auth, familyRoom)).status, 403);
    assert.equal((await addEmail(owner.auth, invitedRoom)).status, 200);
    let pending = await (await pendingInvites(await request(owner.auth, office), room(invitedRoom))).json();
    assert.equal(pending.invitations[0].email, email);
    await enterAccount(nextPupil.auth, "account_required");
    await enterAccount(pupil.auth, "account_email_unverified");
    for (const account of [pupil, outsider]) {
      await getAdminAuth(adminApp).updateUser(account.uid, { emailVerified: true });
      await account.auth.currentUser?.getIdToken(true);
    }
    await enterAccount(outsider.auth, "account_invitation_required");
    assert.equal((await withdraw(await request(owner.auth, office, {
      invitationId: pending.invitations[0].id,
    }, "DELETE"), room(invitedRoom))).status, 200);
    await enterAccount(pupil.auth, "account_invitation_required");
    assert.equal((await addEmail(owner.auth, invitedRoom)).status, 200);

    const ownerProfile = db.doc("users/" + owner.uid);
    await ownerProfile.update({ schoolId: school, schoolRole: "school_teacher", schoolStatus: "active" });
    const pupilProfile = db.doc("users/" + pupil.uid);
    const before = (await pupilProfile.get()).data();
    assert.ok(before);
    await pupilProfile.update({ schoolId: school, schoolStatus: "active" });
    await enterAccount(pupil.auth, "account_invitation_required");
    await pupilProfile.set(before);
    const ownerMembership = db.doc("spaceMembers/" + invitedRoom + "_" + owner.uid);
    await ownerMembership.set({ spaceId: invitedRoom, uid: owner.uid, status: "revoked", active: false });
    await enterAccount(pupil.auth, "room_unavailable");
    await ownerMembership.delete();

    const fillCapacity = db.batch();
    const roomLimit = getBucketLimit("teacher", "free", "members");
    const capacityRows = Array.from({ length: roomLimit }, (_, index) => {
      const privateSlot = db.doc("spaceMembers/" + quotaRoom + "_capacity_" + index);
      const schoolSlot = db.doc("spaceMembers/" + schoolRoom + "_capacity_" + index);
      for (const [roomId, ref] of [[quotaRoom, privateSlot], [schoolRoom, schoolSlot]] as const) {
        fillCapacity.create(ref, { spaceId: roomId, participantId: ref.id, role: "student", status: "active", active: true });
      }
      return privateSlot;
    });
    await fillCapacity.commit();
    await enterAccount(pupil.auth, "account_capacity_reached");
    pending = await (await pendingInvites(await request(owner.auth, office), room(invitedRoom))).json();
    assert.equal(pending.invitations.length, 1);
    await capacityRows[0].delete();
    await enterAccount(pupil.auth);
    const canonical = db.doc("spaceMembers/" + invitedRoom + "_" + pupil.uid);
    assert.equal((await canonical.get()).get("participantId"), pupil.uid);
    assert.deepEqual((await visibleRooms(pupil)).map(value => value.spaceId), [invitedRoom]);
    assert.deepEqual((await pupilProfile.get()).data(), before);
    await canonical.update({ active: false, status: "revoked" });
    await enterAccount(pupil.auth, "access_revoked");
  });

  await t.test("school admin can switch to accounts only while preserving pupil work", async () => {
    const { PATCH: setPupilAccess } = await import("../app/api/schools/[schoolId]/pupil-access/route");
    const { POST: postBoardText } = await import("../app/api/spaces/[spaceId]/board/text-response/route");
    const { POST: inviteAccount } = await import("../app/api/teacher/spaces/[spaceId]/members/invite-account/route");
    const settings = async (as: Auth, schoolId: string, allowPupilCodeAccess: unknown) =>
      setPupilAccess(await request(as, "/api/schools/pupil-access", { allowPupilCodeAccess }, "PATCH"),
        { params: Promise.resolve({ schoolId }) });
    const [guest, signedPupil, invitedAccount] = await Promise.all([
      client("school-policy-guest"), client("school-policy-account", { role: "student" }),
      client("school-policy-invited-account", { role: "student" }),
    ]);
    const invitedUser = invitedAccount.auth.currentUser;
    assert.ok(invitedUser?.email);
    await getAdminAuth(adminApp).updateUser(invitedAccount.uid, { emailVerified: true });
    await invitedUser.getIdToken(true);
    await db.doc("schools/" + school).update({ teacherSeatLimit: 5 });
    const pupil = (await write(colleague.auth, maths, { fullName: "Elev Tilgang", displayName: "Tilgang" })).member;
    assert.ok(pupil.studentCode);
    const joined = await enter(guest.auth, roomCode("MA"), pupil.studentCode);
    assert.equal(joined.preview, false);
    const memberRef = db.doc("spaceMembers/" + maths + "_" + guest.uid);
    const originalMembership = (await memberRef.get()).data();
    const save = async () => saveDraft(await request(guest.auth, "/api/draft", {
      payload: { uid: guest.uid, participantId: joined.participantId, status: "draft",
        answers: { question: "Kladdeinnhold til lokal test" } },
    }), { params: Promise.resolve({ spaceId: maths, assignmentId }) });
    const saved = await save();
    assert.equal(saved.status, 200);
    const subId = (await saved.json()).submissionId;
    const draft = db.doc("spaces/" + maths + "/lessons/" + assignmentId + "/submissions/" + subId);
    const originalDraft = (await draft.get()).data();
    const lesson = "spaces/" + maths + "/lessons/" + assignmentId;
    assert.ok((await getDocFromServer(doc(guest.firestore, lesson))).exists());
    await db.doc("spaces/" + maths + "/board/state").set({ active: true, mode: "text", sessionId: "policy-board" });
    const postToBoard = async () => postBoardText(await request(guest.auth, "/api/board", {
      sessionId: "policy-board", text: "Syntetisk tavlesvar",
    }), room(maths));
    assert.equal((await postToBoard()).status, 200);

    // Both canonical legacy code access and independent account access can exist for this login.
    await Promise.all([
      db.doc("spaceMembers/" + maths + "_" + signedPupil.uid).set({
        uid: signedPupil.uid, spaceId: maths, participantId: signedPupil.uid, role: "student", status: "active", active: true,
      }),
      db.doc("spaceMembers/" + legacyRoom + "_" + signedPupil.uid).set({
        uid: signedPupil.uid, spaceId: legacyRoom, participantId: "older-policy-account", role: "student", status: "active", active: true,
        studentCode: "Z2345", approvedAt: new Date(), isAnon: false,
      }),
    ]);
    assert.equal((await settings(teacher.auth, school, false)).status, 403);
    assert.equal((await settings(schoolAdmin.auth, otherSchool, false)).status, 403);
    assert.equal((await settings(schoolAdmin.auth, school, "false")).status, 400);
    assert.equal((await db.doc("schools/" + school).get()).get("allowPupilCodeAccess"), undefined);

    const disabled = await settings(schoolAdmin.auth, school, false);
    assert.equal(disabled.status, 200);
    assert.deepEqual(await disabled.json(), { ok: true, allowPupilCodeAccess: false });
    try {
      assert.equal((await enter(guest.auth, roomCode("MA"), pupil.studentCode, 403)).error, "school_pupil_code_disabled");
      assert.equal((await enter(guest.auth, roomCode("LE"), "A4B6C", 403)).error, "school_pupil_code_disabled");
      assert.equal(await refresh(guest.auth), 0);
      assert.equal((await reveal(colleague.auth, maths, pupil.id, 403)).error, "school_pupil_code_disabled");
      assert.equal((await write(colleague.auth, maths, { fullName: "En ny kodeelev" }, 403)).error, "school_pupil_code_disabled");
      await assert.rejects(getDocFromServer(doc(guest.firestore, lesson)), /permission/i);
      await assert.rejects(getDocFromServer(doc(signedPupil.firestore, "spaces", legacyRoom)), /permission/i);
      assert.ok((await getDocFromServer(doc(signedPupil.firestore, lesson))).exists());
      assert.ok((await getDocFromServer(doc(colleague.firestore, lesson))).exists());
      assert.equal((await inviteAccount(await request(colleague.auth, "/api/room-invite", {
        email: invitedUser.email,
      }), room(maths))).status, 200);
      assert.equal((await joinRoom(await request(invitedAccount.auth, "/api/spaces/join", {
        method: "account", code: roomCode("MA"), submit: true,
      }))).status, 200);
      assert.ok((await getDocFromServer(doc(invitedAccount.firestore, lesson))).exists());
      assert.equal((await save()).status, 403);
      assert.equal((await postToBoard()).status, 403);
      assert.deepEqual((await draft.get()).data(), originalDraft);
      assert.ok((await getDocFromServer(doc(colleague.firestore, draft.path))).exists());
      assert.deepEqual((await memberRef.get()).data(), originalMembership);
      assert.equal((await db.doc("schools/" + otherSchool).get()).get("allowPupilCodeAccess"), undefined);
    } finally {
      assert.equal((await settings(schoolAdmin.auth, school, true)).status, 200);
    }
    assert.ok((await getDocFromServer(doc(guest.firestore, lesson))).exists());
  });

  await t.test("school provider policy follows the current verified authentication session", async () => {
    const { PATCH: setPupilAccess } = await import("../app/api/schools/[schoolId]/pupil-access/route");
    const { POST: inviteAccount } = await import("../app/api/teacher/spaces/[spaceId]/members/invite-account/route");
    const settings = async (as: Auth, schoolId: string, body: object) =>
      setPupilAccess(await request(as, "/api/schools/pupil-access", body, "PATCH"), { params: Promise.resolve({ schoolId }) });
    const payloadPart = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    function emulatorIdToken(subject: string) {
      return payloadPart({ alg: "none", typ: "JWT" }) + "." + payloadPart({
        iss: "https://emulated-provider.invalid", aud: "local-test", sub: subject, email: subject + "@example.invalid", email_verified: true,
      }) + ".";
    }
    const feideCredential = new OAuthProvider("oidc.feide").credential({ idToken: emulatorIdToken("feide-" + suffix) });
    const googleCredential = GoogleAuthProvider.credential(emulatorIdToken("google-" + suffix));
    const [feide, google, email, guest] = await Promise.all([
      client("provider-feide", { role: "student" }, feideCredential),
      client("provider-google", { role: "student" }, googleCredential),
      client("provider-email", { role: "student" }),
      client("provider-code"),
    ]);
    const adminAuth = getAdminAuth(adminApp);
    const scopes = [[feide, "oidc.feide"], [google, "google.com"], [email, "password"]] as const;
    for (const [account, provider] of scopes) {
      const user = account.auth.currentUser;
      assert.ok(user?.email);
      await adminAuth.updateUser(user.uid, { emailVerified: true });
      assert.equal((await adminAuth.verifyIdToken(await user.getIdToken(true))).firebase.sign_in_provider, provider);
      assert.equal((await inviteAccount(await request(colleague.auth, "/api/invite", { email: user.email }), room(maths))).status, 200);
    }
    const providerBody = (pupilAccountProviders: unknown) => ({ allowPupilCodeAccess: true, pupilAccountProviders });
    for (const invalid of [[], ["email", "email"], ["custom"], "google"]) {
      assert.equal((await settings(schoolAdmin.auth, school, providerBody(invalid))).status, 400);
    }
    assert.equal((await settings(teacher.auth, school, providerBody(["email"]))).status, 403);
    assert.equal((await settings(schoolAdmin.auth, otherSchool, providerBody(["email"]))).status, 403);

    const pupil = (await write(colleague.auth, maths, { fullName: "Elev Med Kode", displayName: "Kode" })).member;
    assert.ok(pupil.studentCode);
    const privateRoom = "provider-private-" + suffix;
    await Promise.all([
      db.doc("spaces/" + privateRoom).set({ title: "Privat uten skolevalg", ownerId: teacher.uid, schoolId: null }),
      db.doc("spaceMembers/" + privateRoom + "_" + email.uid).set({
        spaceId: privateRoom, uid: email.uid, participantId: email.uid, role: "student", status: "active",
      }),
    ]);
    const accountJoin = async (as: Auth, status: number) => {
      const response = await joinRoom(await request(as, "/api/spaces/join", { method: "account", code: roomCode("MA"), submit: true }));
      const data = await response.json();
      assert.equal(response.status, status, JSON.stringify(data));
      return data;
    };
    const lessonPath = "spaces/" + maths + "/lessons/" + assignmentId;
    const save = async (account: { auth: Auth; uid: string }) => saveDraft(await request(account.auth, "/api/draft", {
      payload: { uid: account.uid, participantId: account.uid, status: "draft", answers: { question: "Lokalt arbeid" } },
    }), { params: Promise.resolve({ spaceId: maths, assignmentId }) });
    const schoolRef = db.doc("schools/" + school);
    try {
      const choice = await settings(schoolAdmin.auth, school, providerBody(["google", "feide"]));
      assert.equal(choice.status, 200);
      assert.deepEqual((await choice.json()).pupilAccountProviders, ["feide", "google"]);
      assert.deepEqual((await (await settings(schoolAdmin.auth, school, { allowPupilCodeAccess: true })).json()),
        { ok: true, allowPupilCodeAccess: true });
      assert.deepEqual((await schoolRef.get()).get("pupilAccountProviders"), ["feide", "google"]);
      const blocked = await accountJoin(email.auth, 403);
      assert.equal(blocked.error, "school_pupil_provider_disabled");
      assert.deepEqual(blocked.pupilAccountProviders, ["feide", "google"]);
      assert.ok((await getDocFromServer(doc(email.firestore, "spaces", privateRoom))).exists());
      assert.equal((await enter(email.auth, roomCode("MA"), pupil.studentCode, 403)).error, "school_pupil_provider_disabled");
      assert.equal((await enter(guest.auth, roomCode("MA"), pupil.studentCode)).preview, false);
      await accountJoin(feide.auth, 200);
      await accountJoin(google.auth, 200);
      assert.ok((await getDocFromServer(doc(feide.firestore, lessonPath))).exists());
      const saved = await save(google);
      assert.equal(saved.status, 200);
      const draft = db.doc(lessonPath + "/submissions/" + (await saved.json()).submissionId);
      const original = (await draft.get()).data();

      assert.equal((await settings(schoolAdmin.auth, school, providerBody(["feide"]))).status, 200);
      await assert.rejects(getDocFromServer(doc(google.firestore, lessonPath)), /permission/i);
      assert.equal((await save(google)).status, 403);
      assert.deepEqual((await draft.get()).data(), original);
      assert.ok((await getDocFromServer(doc(guest.firestore, lessonPath))).exists());
      assert.ok((await getDocFromServer(doc(colleague.firestore, lessonPath))).exists());
      assert.ok((await getDocFromServer(doc(feide.firestore, lessonPath))).exists());

      const linkedEmail = "provider-linked-" + suffix + "@example.invalid";
      const linkedPassword = "synthetic-linked-" + randomUUID();
      assert.ok(feide.auth.currentUser);
      await linkWithCredential(feide.auth.currentUser, EmailAuthProvider.credential(linkedEmail, linkedPassword));
      const signedWithPassword = (await signInWithEmailAndPassword(feide.auth, linkedEmail, linkedPassword)).user;
      assert.equal(signedWithPassword.uid, feide.uid);
      await adminAuth.updateUser(signedWithPassword.uid, { emailVerified: true });
      const linkedToken = await adminAuth.verifyIdToken(await signedWithPassword.getIdToken(true));
      assert.equal(linkedToken.firebase.sign_in_provider, "password");
      assert.ok(Object.hasOwn(linkedToken.firebase.identities, "oidc.feide"));
      assert.equal((await accountJoin(feide.auth, 403)).error, "school_pupil_provider_disabled");
      await assert.rejects(getDocFromServer(doc(feide.firestore, lessonPath)), /permission/i);
      assert.equal((await save(feide)).status, 403);

      assert.equal((await settings(schoolAdmin.auth, school, providerBody(["email"]))).status, 200);
      await accountJoin(email.auth, 200);
      await accountJoin(feide.auth, 200);
      assert.ok((await getDocFromServer(doc(feide.firestore, lessonPath))).exists());
      const loaded = await loadStudentContentRoom(email.firestore, { spaceId: maths, participantId: email.uid }, email.uid);
      assert.ok(loaded?.tasks.some(task => task.id === assignmentId));
      assert.equal((await db.doc("schools/" + otherSchool).get()).get("pupilAccountProviders"), undefined);
    } finally {
      await schoolRef.update({ pupilAccountProviders: FieldValue.delete() });
    }
  });

  await t.test("verified account keeps work when a room owner links the existing code pupil", async () => {
    const { POST: inviteAccount, GET: listInvites, DELETE: withdrawInvite } =
      await import("../app/api/teacher/spaces/[spaceId]/members/invite-account/route");
    const { GET: listSubmissions } = await import("../app/api/student/submissions/route");
    const { POST: archiveSubmission } = await import("../app/api/content/archive-submission/route");
    const [oldDevice, account, conflictAccount, newGuest] = await Promise.all([
      client("transfer-code-device"),
      client("transfer-account", { role: "student" }),
      client("transfer-conflicting-account", { role: "student" }),
      client("transfer-new-guest"),
    ]);
    for (const target of [account, conflictAccount]) {
      assert.ok(target.auth.currentUser?.email);
      await getAdminAuth(adminApp).updateUser(target.uid, { emailVerified: true });
      await target.auth.currentUser.getIdToken(true);
    }

    const transferRoom = "pupil-transfer-room-" + suffix;
    const otherRoom = "pupil-transfer-other-room-" + suffix;
    const oldAccountRoom = "pupil-transfer-existing-account-room-" + suffix;
    const oldAccountMember = db.doc(`spaceMembers/${oldAccountRoom}_${account.uid}`);
    const existingAccountMembership = {
      spaceId: oldAccountRoom, uid: account.uid, participantId: account.uid,
      role: "student", status: "active", active: true, archived: false,
    };
    const roomDocument = (ownerId: string, title: string, code: string) => ({ ownerId, title, code, schoolId: school, isOpen: true });
    await Promise.all([
      db.doc("spaces/" + transferRoom).set(roomDocument(teacher.uid, "Koblingsrom", roomCode("TR"))),
      db.doc("spaces/" + otherRoom).set(roomDocument(colleague.uid, "Rom uten kobling", roomCode("TO"))),
      db.doc("spaces/" + oldAccountRoom).set({ ownerId: teacher.uid, title: "Tidligere rom på kontoen", isOpen: true }),
      oldAccountMember.set(existingAccountMembership),
      db.doc("schools/" + school).update({ teacherSeatLimit: 5 }),
    ]);
    const pupil = (await write(teacher.auth, transferRoom, { fullName: "Syntetisk Kodeelev", displayName: "Syntetisk" })).member;
    const pupilId = (await db.doc("spaceMembers/" + pupil.id).get()).get("schoolPupilId");
    const secondRegistration = (await write(colleague.auth, otherRoom, { sourceMemberId: pupilId })).member;
    assert.notEqual(secondRegistration.participantId, pupil.participantId);
    const firstJoin = await enter(oldDevice.auth, roomCode("TR"), pupil.studentCode);
    assert.equal(firstJoin.participantId, pupil.participantId);
    assert.deepEqual((await visibleRooms(oldDevice)).map(value => value.spaceId).sort(), [transferRoom, otherRoom].sort());
    const preservedOtherMember = db.doc("spaceMembers/" + otherRoom + "_" + oldDevice.uid);
    const otherBefore = (await preservedOtherMember.get()).data();

    async function save(as: typeof account, taskId: string, status: string, answer: string, submissionId?: string) {
      return saveDraft(await request(as.auth, "/api/draft", {
        ...(submissionId ? { submissionId } : {}),
        payload: { uid: as.uid, participantId: pupil.participantId, status, answers: { open: answer } },
      }), { params: Promise.resolve({ spaceId: transferRoom, assignmentId: taskId }) });
    }
    const tasks = [
      { id: "transfer-draft", title: "Kladd fra kodeøkten", status: "draft", answer: "En lokal kladd til testen" },
      { id: "transfer-submitted", title: "Innlevering fra kodeøkten", status: "submitted", answer: "Lokalt levert arbeid" },
    ];
    const stored = [];
    for (const task of tasks) {
      const lesson = db.doc("spaces/" + transferRoom + "/lessons/" + task.id);
      await lesson.set({ title: task.title, status: "active" });
      const response = await save(oldDevice, task.id, task.status, task.answer);
      assert.equal(response.status, 200);
      const { submissionId } = await response.json();
      const ref = lesson.collection("submissions").doc(submissionId);
      stored.push({ ...task, submissionId, ref, original: (await ref.get()).data() });
    }
    const legacyLesson = db.doc("spaces/" + transferRoom + "/lessons/earlier-text");
    const legacyLessonId = transferRoom + "_earlier-text_" + oldDevice.uid;
    const legacyLessonRef = legacyLesson.collection("submissions").doc(legacyLessonId);
    const legacyLessonIndex = db.doc("spaceSubmissions/" + legacyLessonId);
    const legacyText = { uid: oldDevice.uid, spaceId: transferRoom, lessonId: legacyLesson.id, status: "draft",
      answers: { open: "Kladd fra før deltaker-ID ble lagret" } };
    const unprovenRef = legacyLesson.collection("submissions").doc(transferRoom + "_earlier-text_" + newGuest.uid);
    const unprovenText = { ...legacyText, uid: newGuest.uid };
    const otherRoomLesson = db.doc("spaces/" + otherRoom + "/lessons/earlier-text");
    const otherRoomTextRef = otherRoomLesson.collection("submissions").doc(otherRoom + "_earlier-text_" + oldDevice.uid);
    const otherRoomText = { ...legacyText, spaceId: otherRoom };
    const legacyWriting = db.doc("spaces/" + transferRoom + "/writingActivities/earlier-writing");
    const legacyWritingRef = legacyWriting.collection("submissions").doc(oldDevice.uid);
    const legacyWritingData = { studentUid: oldDevice.uid, status: "planning_submitted",
      answersByFieldId: { title: "Tittel fra kodeøkten" } };
    await Promise.all([
      legacyLesson.set({ title: "Eldre tekstoppgave", status: "active" }),
      legacyLessonRef.set(legacyText),
      legacyLessonIndex.set(legacyText),
      unprovenRef.set(unprovenText),
      otherRoomLesson.set({ title: "Tekst i det andre rommet", status: "active" }),
      otherRoomTextRef.set(otherRoomText),
      legacyWriting.set({ title: "Eldre skriveaktivitet", status: "active" }),
      legacyWritingRef.set(legacyWritingData),
    ]);
    const legacyGuestMember = db.doc("spaceMembers/" + transferRoom + "_" + oldDevice.uid);
    const guestBefore = (await legacyGuestMember.get()).data();
    const sendInvite = async (as: Auth, sourceMemberId: string, to: typeof account) =>
      inviteAccount(await request(as, "/api/invite", { sourceMemberId, email: to.auth.currentUser?.email }), room(transferRoom));
    const accept = async (as: Auth) =>
      joinRoom(await request(as, "/api/spaces/join", { method: "account", code: roomCode("TR"), submit: true }));
    assert.equal((await sendInvite(colleague.auth, pupil.id, account)).status, 403);
    assert.ok((await sendInvite(teacher.auth, secondRegistration.id, account)).status >= 400);

    const existingRef = db.doc("spaceMembers/" + transferRoom + "_" + conflictAccount.uid);
    const existing = {
      uid: conflictAccount.uid, participantId: conflictAccount.uid, spaceId: transferRoom,
      role: "student", status: "active", active: true, archived: false,
    };
    await existingRef.set(existing);
    assert.equal((await sendInvite(teacher.auth, pupil.id, conflictAccount)).status, 200);
    const refused = await accept(conflictAccount.auth);
    assert.ok(refused.status >= 400);
    assert.equal((await refused.json()).error, "account_transfer_conflict");
    assert.deepEqual((await existingRef.get()).data(), existing);
    assert.deepEqual((await legacyGuestMember.get()).data(), guestBefore);
    await assert.rejects(getDocFromServer(doc(conflictAccount.firestore, stored[0].ref.path)), /permission/i);

    await existingRef.delete();
    const unindexedAccountRef = legacyLesson.collection("submissions").doc(conflictAccount.uid);
    const unindexedAccountWork = { ...legacyText, uid: conflictAccount.uid };
    await unindexedAccountRef.set(unindexedAccountWork);
    const refusedAgain = await accept(conflictAccount.auth);
    assert.equal(refusedAgain.status, 409);
    assert.equal((await refusedAgain.json()).error, "account_transfer_conflict");
    assert.deepEqual((await unindexedAccountRef.get()).data(), unindexedAccountWork);
    assert.deepEqual((await legacyLessonRef.get()).data(), legacyText);

    const pending = await listInvites(await request(teacher.auth, "/api/invite"), room(transferRoom));
    const { invitations } = await pending.json();
    const wrongInvite = invitations.find((entry: { email: string }) => entry.email === conflictAccount.auth.currentUser?.email);
    assert.ok(wrongInvite);
    assert.equal((await withdrawInvite(await request(teacher.auth, "/api/invite", {
      invitationId: wrongInvite.id,
    }, "DELETE"), room(transferRoom))).status, 200);
    assert.equal((await sendInvite(teacher.auth, pupil.id, account)).status, 200);
    const accountProfile = db.doc("users/" + account.uid);
    const legacyProfile = {
      roles: { student: true }, displayName: "Syntetisk elev med eldre konto", studentAccessMode: "space_only",
      org: { country: "NO", municipality: "Oslo" },
    };
    await accountProfile.set({ role: "student", ...legacyProfile, roles: { student: true, teacher: true } });
    const wrongRole = await accept(account.auth);
    assert.equal(wrongRole.status, 403);
    assert.equal((await wrongRole.json()).error, "account_role_ineligible");
    await accountProfile.set({ ...legacyProfile, org: { country: "NO" } });
    const incomplete = await accept(account.auth);
    assert.equal(incomplete.status, 403);
    assert.equal((await incomplete.json()).error, "account_profile_incomplete");
    assert.deepEqual((await legacyGuestMember.get()).data(), guestBefore);
    await accountProfile.set(legacyProfile);
    assert.deepEqual((await visibleRooms(account)).map(value => value.spaceId), [oldAccountRoom]);
    const admitted = await accept(account.auth);
    assert.equal(admitted.status, 200, JSON.stringify(await admitted.clone().json()));
    assert.equal((await accept(account.auth)).status, 200);
    const linked = (await db.doc("spaceMembers/" + transferRoom + "_" + account.uid).get()).data();
    assert.equal(linked?.participantId, pupil.participantId);
    assert.equal(linked?.schoolPupilCodeAccess, false);
    assert.equal(linked?.schoolPupilAccountUid, account.uid);
    assert.equal((await db.doc("spaceMembers/" + pupil.id).get()).get("schoolPupilAccountUid"), account.uid);
    assert.equal((await db.doc("spaceMembers/" + otherRoom + "_" + account.uid).get()).exists, false);
    assert.deepEqual((await accountProfile.get()).data(), legacyProfile);
    assert.deepEqual((await oldAccountMember.get()).data(), existingAccountMembership);
    assert.deepEqual((await visibleRooms(account)).map(value => value.spaceId).sort(), [oldAccountRoom, transferRoom].sort());

    const work = await loadStudentContentRoom(account.firestore, { spaceId: transferRoom, participantId: pupil.participantId }, account.uid);
    assert.deepEqual(work?.tasks.map(({ id, status }) => [id, status]).sort(), [
      ...tasks.map(({ id, status }) => [id, status]),
      [legacyLesson.id, "draft"], [legacyWriting.id, "planningSubmitted"],
    ].sort());
    assert.deepEqual((await legacyLessonRef.get()).data(), { ...legacyText, participantId: pupil.participantId });
    assert.deepEqual((await legacyLessonIndex.get()).data(), { ...legacyText, participantId: pupil.participantId });
    assert.deepEqual((await getDocFromServer(doc(account.firestore, legacyWritingRef.path))).data(), {
      ...legacyWritingData, uid: oldDevice.uid, participantId: pupil.participantId,
    });
    await updateDoc(doc(account.firestore, legacyWritingRef.path), { answersByFieldId: { title: "Fortsatt på elevkontoen" } });
    assert.deepEqual((await legacyWritingRef.get()).get("answersByFieldId"), { title: "Fortsatt på elevkontoen" });
    assert.deepEqual((await unprovenRef.get()).data(), unprovenText);
    assert.deepEqual((await otherRoomTextRef.get()).data(), otherRoomText);
    assert.deepEqual((await unindexedAccountRef.get()).data(), unindexedAccountWork);
    await assert.rejects(getDocFromServer(doc(account.firestore, unprovenRef.path)), /permission/i);
    await assert.rejects(getDocFromServer(doc(oldDevice.firestore, legacyWritingRef.path)), /permission/i);
    assert.equal((await legacyGuestMember.get()).get("active"), false);
    for (const { ref, original, answer } of stored) {
      const read = await getDocFromServer(doc(account.firestore, ref.path));
      assert.deepEqual(read.get("answers"), { open: answer });
      assert.deepEqual((await ref.get()).data(), original);
      await assert.rejects(getDocFromServer(doc(oldDevice.firestore, ref.path)), /permission/i);
    }
    assert.equal((await enter(newGuest.auth, roomCode("TR"), pupil.studentCode, 403)).error, "school_pupil_account_required");
    assert.equal((await enter(oldDevice.auth, roomCode("TO"), pupil.studentCode)).preview, false);
    await refresh(oldDevice.auth);
    assert.equal((await legacyGuestMember.get()).get("active"), false);
    const otherAfter = (await preservedOtherMember.get()).data();
    assert.equal(otherAfter?.participantId, otherBefore?.participantId);
    assert.equal(otherAfter?.active, true);

    const list = await listSubmissions(await request(account.auth, "/api/student/submissions?source=spaceSubmissions"));
    assert.equal(list.status, 200);
    const { documents } = await list.json();
    assert.ok(stored.every(row => documents.some((entry: { id: string }) => entry.id === row.submissionId)));
    assert.ok(documents.some((entry: { id: string }) => entry.id === legacyLessonId));
    assert.equal((await save(account, legacyLesson.id, "draft", "Eldre tekstkladd fortsatte", legacyLessonId)).status, 200);
    assert.deepEqual((await legacyLessonRef.get()).get("answers"), { open: "Eldre tekstkladd fortsatte" });
    assert.equal((await legacyLessonRef.get()).get("uid"), oldDevice.uid);
    const continuedDraft = stored[0];
    const continued = await save(account, continuedDraft.id, "draft", "Kladden fortsatte på ny enhet", continuedDraft.submissionId);
    assert.equal(continued.status, 200);
    assert.deepEqual((await continuedDraft.ref.get()).get("answers"), { open: "Kladden fortsatte på ny enhet" });
    assert.equal((await continuedDraft.ref.get()).get("uid"), oldDevice.uid);
    assert.equal((await continuedDraft.ref.get()).get("participantId"), pupil.participantId);
    assert.equal((await save(oldDevice, continuedDraft.id, "draft", "Syntetisk gammel økt")).status, 403);
    const archived = await archiveSubmission(await request(account.auth, "/api/archive", { submissionId: stored[1].submissionId }));
    assert.equal(archived.status, 200);
    assert.equal((await db.doc("spaceSubmissions/" + stored[1].submissionId).get()).get("archived"), true);
    assert.deepEqual((await stored[1].ref.get()).data(), stored[1].original);
  });

  await t.test("an account resumes geometry under the original submission IDs", async () => {
    const { POST: inviteAccount } = await import("../app/api/teacher/spaces/[spaceId]/members/invite-account/route");
    const { POST: saveGeometry } = await import("../app/api/spaces/[spaceId]/lessons/[assignmentId]/geometry-submit/route");
    const { GET: readGeometry } = await import("../app/api/spaces/[spaceId]/lessons/[assignmentId]/geometry-submission/[studentUid]/route");
    const [guest, account] = await Promise.all([client("geometry-code-device"), client("geometry-account", { role: "student" })]);
    await getAdminAuth(adminApp).updateUser(account.uid, { emailVerified: true });
    await account.auth.currentUser?.getIdToken(true);

    const spaceId = "geometry-transfer-" + suffix;
    const code = roomCode("GT");
    const space = db.doc("spaces/" + spaceId);
    const draftLesson = space.collection("lessons").doc("geometry-draft");
    const legacyLesson = space.collection("lessons").doc("geometry-legacy");
    await Promise.all([
      space.set({ ownerId: teacher.uid, schoolId: school, title: "Geometri", code, isOpen: true }),
      draftLesson.set({ title: "Geometrikladd", taskType: "math_geometry", status: "active" }),
      legacyLesson.set({ title: "Eldre geometriinnlevering", taskType: "math_geometry", status: "active" }),
    ]);
    const pupil = (await write(teacher.auth, spaceId, { fullName: "Geometrielev Lokal", displayName: "Geometrielev" })).member;
    await enter(guest.auth, code, pupil.studentCode);
    const worksheet = {
      title: "Syntetisk geometri", language: "nb", level: "grade_5_7", topic: "area", difficulty: "easy",
      instructions: "Regn ut arealet.", showAnswerKey: false, showFormulas: false, selectedShapes: ["square"],
      tasks: [{ id: "example", type: "area", prompt: "Finn arealet.", figure: { kind: "square", sideCm: 3 }, answer: "9", expected: { areaValue: 9 } }],
    };
    const draftAnswers = { example: { taskId: "example", areaValue: 7 } };
    const deliveredAnswers = { example: { taskId: "example", areaValue: 9 } };
    const draftParams = { params: Promise.resolve({ spaceId, assignmentId: draftLesson.id }) };
    const legacyParams = { params: Promise.resolve({ spaceId, assignmentId: legacyLesson.id }) };
    const legacyReadParams = { params: Promise.resolve({ spaceId, assignmentId: legacyLesson.id, studentUid: guest.uid }) };
    const draftResponse = await saveDraft(await request(guest.auth, "/api/draft", { payload: {
      uid: guest.uid, participantId: pupil.participantId, taskType: "math_geometry", status: "draft", worksheet, answersByTaskId: draftAnswers,
    } }), draftParams);
    assert.equal(draftResponse.status, 200);
    const { submissionId } = await draftResponse.json();
    const oldResponse = await saveGeometry(await request(guest.auth, "/api/geometry", { worksheet, answersByTaskId: deliveredAnswers }), legacyParams);
    assert.equal(oldResponse.status, 200);
    assert.equal((await oldResponse.json()).id, guest.uid);
    const legacyRef = legacyLesson.collection("submissions").doc(guest.uid);
    const feedback = { text: "Syntetisk lærerkommentar" };
    await legacyRef.update({ teacherFeedback: feedback });
    const unrelatedIndex = db.doc("spaceSubmissions/" + guest.uid);
    const separateRecord = { uid: guest.uid, spaceId: legacyRoom, assignmentId: "unrelated", status: "draft" };
    await unrelatedIndex.set(separateRecord);

    const invite = await inviteAccount(await request(teacher.auth, "/api/invite", {
      sourceMemberId: pupil.id, email: account.auth.currentUser?.email,
    }), room(spaceId));
    assert.equal(invite.status, 200);
    const accepted = await joinRoom(await request(account.auth, "/api/spaces/join", { method: "account", code, submit: true }));
    assert.equal(accepted.status, 200, JSON.stringify(await accepted.clone().json()));
    const content = await loadStudentContentRoom(account.firestore, { spaceId, participantId: pupil.participantId }, account.uid);
    assert.equal(content?.tasks.find(task => task.id === draftLesson.id)?.status, "draft");
    assert.ok(content?.tasks.find(task => task.id === draftLesson.id)?.href.endsWith("?sid=" + submissionId));
    assert.equal(content?.tasks.find(task => task.id === legacyLesson.id)?.status, "submitted");
    assert.ok(content?.tasks.find(task => task.id === legacyLesson.id)?.href.endsWith("?sid=" + guest.uid));
    const restoredDraft = await getDocFromServer(doc(account.firestore, draftLesson.collection("submissions").doc(submissionId).path));
    assert.deepEqual(restoredDraft.get("answersByTaskId"), draftAnswers);
    const restoredLegacy = await readGeometry(await request(account.auth, "/api/geometry"), legacyReadParams);
    assert.equal(restoredLegacy.status, 200);
    assert.deepEqual((await restoredLegacy.json()).submission.answersByTaskId, deliveredAnswers);
    assert.equal((await readGeometry(await request(guest.auth, "/api/geometry"), legacyReadParams)).status, 403);

    const saveLegacy = await saveGeometry(await request(account.auth, "/api/geometry", { worksheet, answersByTaskId: draftAnswers }), legacyParams);
    assert.equal(saveLegacy.status, 200, JSON.stringify(await saveLegacy.clone().json()));
    assert.equal((await saveLegacy.json()).id, guest.uid);
    assert.equal((await legacyLesson.collection("submissions").get()).size, 1);
    assert.equal((await legacyRef.get()).get("uid"), guest.uid);
    assert.deepEqual((await legacyRef.get()).get("teacherFeedback"), feedback);
    assert.deepEqual((await legacyRef.get()).get("answersByTaskId"), draftAnswers);
    assert.deepEqual((await unrelatedIndex.get()).data(), separateRecord);

    const submitDraft = await saveGeometry(await request(account.auth, "/api/geometry", { worksheet, answersByTaskId: deliveredAnswers }), draftParams);
    assert.equal(submitDraft.status, 200);
    assert.equal((await submitDraft.json()).id, submissionId);
    assert.equal((await draftLesson.collection("submissions").get()).size, 1);
    const draftIndex = await db.doc("spaceSubmissions/" + submissionId).get();
    assert.equal(draftIndex.get("uid"), guest.uid);
    assert.deepEqual(draftIndex.get("answersByTaskId"), deliveredAnswers);

    const duplicate = legacyLesson.collection("submissions").doc("another-code-session");
    await duplicate.set({ ...((await legacyRef.get()).data()), uid: duplicate.id, answersByTaskId: deliveredAnswers });
    const ambiguous = await saveGeometry(await request(account.auth, "/api/geometry", { worksheet, answersByTaskId: {} }), legacyParams);
    assert.equal(ambiguous.status, 409);
    assert.deepEqual((await legacyRef.get()).get("answersByTaskId"), draftAnswers);
    assert.deepEqual((await duplicate.get()).get("answersByTaskId"), deliveredAnswers);
  });

  await t.test("an upgraded account with the same UID rejects its earlier anonymous session", async () => {
    const { POST: inviteAccount } = await import("../app/api/teacher/spaces/[spaceId]/members/invite-account/route");
    const sameUid = await client("transfer-same-uid");
    const originalGuest = sameUid.auth.currentUser;
    assert.ok(originalGuest);
    const roomCodeValue = roomCode("TU");
    const targetRoom = "transfer-same-uid-" + suffix;
    const assignmentId = "same-uid-work";
    const roomRef = db.doc("spaces/" + targetRoom);
    await roomRef.set({ ownerId: teacher.uid, schoolId: school, title: "Kode til konto", code: roomCodeValue, isOpen: true });
    await roomRef.collection("lessons").doc(assignmentId).set({ title: "Fortsett kladden", status: "active" });
    const pupil = (await write(teacher.auth, targetRoom, { fullName: "Kodeelev Lokal", displayName: "Kodeelev" })).member;
    const joined = await enter(sameUid.auth, roomCodeValue, pupil.studentCode);
    const oldSubmissionId = targetRoom + "_" + assignmentId + "_" + sameUid.uid;
    const oldSubmission = roomRef.collection("lessons").doc(assignmentId).collection("submissions").doc(oldSubmissionId);
    const uidDraft = { spaceId: targetRoom, assignmentId, uid: sameUid.uid, status: "draft", answers: { open: "Opprinnelig kladd" } };
    await Promise.all([oldSubmission.set(uidDraft), db.doc("spaceSubmissions/" + oldSubmissionId).set(uidDraft)]);
    const oldToken = await originalGuest.getIdToken();
    const email = "converted-guest-" + suffix + "@example.invalid";
    const password = "synthetic-transfer-" + randomUUID();
    await linkWithCredential(originalGuest, EmailAuthProvider.credential(email, password));
    const signedIn = (await signInWithEmailAndPassword(sameUid.auth, email, password)).user;
    assert.equal(signedIn.uid, sameUid.uid);
    await getAdminAuth(adminApp).updateUser(signedIn.uid, { emailVerified: true });
    await signedIn.getIdToken(true);
    await db.doc("users/" + sameUid.uid).set({ role: "student", onboardingComplete: true });
    const invitation = await inviteAccount(await request(teacher.auth, "/api/invite", {
      sourceMemberId: pupil.id, email,
    }), room(targetRoom));
    assert.equal(invitation.status, 200);
    const admitted = await joinRoom(await request(sameUid.auth, "/api/spaces/join", {
      method: "account", code: roomCodeValue, submit: true,
    }));
    assert.equal(admitted.status, 200, JSON.stringify(await admitted.clone().json()));
    assert.deepEqual((await oldSubmission.get()).data(), { ...uidDraft, participantId: joined.participantId });
    const payload = { uid: sameUid.uid, participantId: joined.participantId, status: "draft", answers: { open: "Syntetisk kladd" } };
    const params = { params: Promise.resolve({ spaceId: targetRoom, assignmentId }) };
    const denied = await saveDraft(new NextRequest("http://127.0.0.1/api/draft", {
      method: "POST", headers: { Authorization: "Bearer " + oldToken, "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId: oldSubmissionId, payload }),
    }), params);
    assert.ok([401, 403].includes(denied.status));
    assert.equal((await saveDraft(await request(sameUid.auth, "/api/draft", { submissionId: oldSubmissionId, payload }), params)).status, 200);
    assert.deepEqual((await oldSubmission.get()).get("answers"), { open: "Syntetisk kladd" });
  });

  await t.test("only the room owner can readmit a removed linked pupil with their same account", async restoreCase => {
    const { POST: inviteAccount } = await import("../app/api/teacher/spaces/[spaceId]/members/invite-account/route");
    const schoolRef = db.doc("schools/" + school);
    const originalSchool = (await schoolRef.get()).data()!;
    restoreCase.after(async () => { await schoolRef.set(originalSchool); });
    await schoolRef.update({ allowPupilCodeAccess: true, pupilAccountProviders: ["email"] });
    const [account, olderDevice, recentDevice, freshGuest] = await Promise.all([
      client("readmission-account", { role: "student" }), client("readmission-older-device"),
      client("readmission-recent-device"), client("readmission-fresh-guest"),
    ]);
    await getAdminAuth(adminApp).updateUser(account.uid, { emailVerified: true });
    await account.auth.currentUser!.getIdToken(true);
    const spaceId = "pupil-readmission-" + suffix;
    const code = roomCode("RA");
    const roomRef = db.doc("spaces/" + spaceId);
    await roomRef.set({ ownerId: teacher.uid, schoolId: school, title: "Syntetisk rom for tilbakeføring", code, isOpen: true });
    const lessonRef = roomRef.collection("lessons").doc("before-readmission");
    await lessonRef.set({ title: "Syntetisk kladd", status: "active" });
    const pupil = (await write(teacher.auth, spaceId, { fullName: "Lokal Elev", displayName: "Lokal" })).member;
    const registration = db.doc("spaceMembers/" + pupil.id);
    const pupilId = (await registration.get()).get("schoolPupilId");
    await enter(olderDevice.auth, code, pupil.studentCode);
    const preTransfer = await saveDraft(await request(olderDevice.auth, "/api/draft", { payload: {
      uid: olderDevice.uid, participantId: pupil.participantId, status: "draft", answers: { open: "Eksisterende kladd" },
    } }), { params: Promise.resolve({ spaceId, assignmentId: lessonRef.id }) });
    assert.equal(preTransfer.status, 200);
    const { submissionId } = await preTransfer.json();
    const originalWork = lessonRef.collection("submissions").doc(submissionId);
    const untouched = (await originalWork.get()).data();
    const newCode = (await write(teacher.auth, spaceId, { action: "rotate_code", targetMemberId: pupil.id })).studentCode;
    await enter(recentDevice.auth, code, newCode);
    const invite = await inviteAccount(await request(teacher.auth, "/api/invite", {
      sourceMemberId: pupil.id, email: account.auth.currentUser?.email,
    }), room(spaceId));
    assert.equal(invite.status, 200);
    const joinAsAccount = async () => joinRoom(await request(account.auth, "/api/spaces/join", { code, method: "account", submit: true }));
    const admitted = await joinAsAccount();
    assert.equal(admitted.status, 200, JSON.stringify(await admitted.clone().json()));

    const olderRef = db.doc(`spaceMembers/${spaceId}_${olderDevice.uid}`);
    const recentRef = db.doc(`spaceMembers/${spaceId}_${recentDevice.uid}`);
    const historicalBefore = [(await olderRef.get()).data(), (await recentRef.get()).data()];
    assert.deepEqual(historicalBefore.map(row => row?.status), ["school_code_rotated", "school_pupil_account_linked"]);
    const removed = await patchMember(await request(teacher.auth, "/api/member", { action: "remove" }, "PATCH"), {
      params: Promise.resolve({ spaceId, memberId: pupil.id }),
    });
    assert.equal(removed.status, 200);
    assert.deepEqual([(await olderRef.get()).data(), (await recentRef.get()).data()], historicalBefore);
    assert.equal((await joinAsAccount()).status, 403);
    await assert.rejects(getDocFromServer(doc(account.firestore, originalWork.path)), /permission/i);

    await schoolRef.update({ allowPupilCodeAccess: false });
    const roster = await readRoster(await request(teacher.auth, "/api/roster"), room(spaceId));
    assert.equal(roster.status, 200);
    const { students } = await roster.json();
    assert.deepEqual(students.map((student: { id: string; restoreAccount?: boolean }) => [student.id, student.restoreAccount]), [[pupilId, true]]);
    await write(colleague.auth, spaceId, { sourceMemberId: pupilId }, 403);
    const restored = await write(teacher.auth, spaceId, { sourceMemberId: pupilId });
    assert.equal(restored.restored, true);
    assert.equal((await joinAsAccount()).status, 200);
    assert.equal((await db.doc(`spaceMembers/${spaceId}_${account.uid}`).get()).get("participantId"), pupil.participantId);
    assert.deepEqual((await getDocFromServer(doc(account.firestore, originalWork.path))).get("answers"), { open: "Eksisterende kladd" });
    assert.deepEqual((await originalWork.get()).data(), untouched);
    assert.deepEqual([(await olderRef.get()).data(), (await recentRef.get()).data()], historicalBefore);
    await assert.rejects(getDocFromServer(doc(recentDevice.firestore, originalWork.path)), /permission/i);
    await schoolRef.update({ allowPupilCodeAccess: true });
    assert.equal((await enter(freshGuest.auth, code, newCode, 403)).error, "school_pupil_account_required");
  });

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

  await t.test("a transferred account can read only its pupil's attached legacy writing image", async t => {
    const { POST: inviteAccount, GET: listInvites } = await import("../app/api/teacher/spaces/[spaceId]/members/invite-account/route");
    const { authorizeLegacyFile } = await import("./security/legacySpaceFile.server");
    const previousBucket = process.env.FIREBASE_STORAGE_BUCKET;
    process.env.FIREBASE_STORAGE_BUCKET = `${projectId}.appspot.com`;
    t.after(() => {
      if (previousBucket === undefined) delete process.env.FIREBASE_STORAGE_BUCKET;
      else process.env.FIREBASE_STORAGE_BUCKET = previousBucket;
    });
    const [original, account, peer] = await Promise.all([
      client("image-original"), client("image-account", { role: "student" }), client("image-peer"),
    ]);
    const spaceId = "image-transfer-" + suffix;
    const activityId = "writing-image";
    const code = roomCode("TI");
    const space = db.doc("spaces/" + spaceId);
    await space.set({ schoolId: school, ownerId: teacher.uid, title: "Syntetisk skriverom", code, isOpen: true });
    const pupil = (await write(teacher.auth, spaceId, { fullName: "Syntetisk skriver" })).member;
    const otherPupil = (await write(teacher.auth, spaceId, { fullName: "Syntetisk medelev" })).member;
    assert.equal((await enter(original.auth, code, pupil.studentCode)).preview, false);
    assert.equal((await enter(peer.auth, code, otherPupil.studentCode)).preview, false);
    const writing = space.collection("writingActivities").doc(activityId);
    const submission = writing.collection("submissions").doc(original.uid);
    const path = `writing-print-images/${original.uid}/${spaceId}/${activityId}/original.png`;
    await writing.set({ title: "Skriv en setning" });
    await submission.set({ uid: original.uid, participantId: pupil.participantId, spaceId, activityId,
      printProfile: { imageUrl: `/api/space-files/legacy-image?path=${encodeURIComponent(path)}` } });
    async function read(as: typeof original, requestedPath = path) {
      const decoded = await getAdminAuth(adminApp).verifyIdToken(await as.auth.currentUser!.getIdToken(), true);
      return authorizeLegacyFile(as.uid, requestedPath, "image", false, decoded);
    }
    assert.ok((await read(original)).startsWith(submission.path));
    await assert.rejects(() => read(peer), /No file access/);
    const current = account.auth.currentUser!;
    await getAdminAuth(adminApp).updateUser(account.uid, { emailVerified: true });
    await current.getIdToken(true);
    const createInvite = async () => inviteAccount(await request(teacher.auth, "/api/invite", {
      sourceMemberId: pupil.id, email: current.email,
    }), { params: Promise.resolve({ spaceId }) });
    const listPending = async () => (await listInvites(await request(teacher.auth, "/api/invite"), { params: Promise.resolve({ spaceId }) })).json();
    const joinAsAccount = async () => joinRoom(await request(account.auth, "/api/spaces/join", { method: "account", code, submit: true }));
    assert.equal((await createInvite()).status, 200);
    const { invitations } = await listPending();
    assert.equal(invitations.length, 1);
    await space.collection("accountInvitations").doc(invitations[0].id).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    assert.deepEqual(await listPending(), { invitations: [] });
    assert.equal((await joinAsAccount()).status, 403);
    assert.ok((await read(original)).startsWith(submission.path));
    assert.equal((await createInvite()).status, 200);
    assert.equal((await joinAsAccount()).status, 200);
    assert.ok((await read(account)).startsWith(submission.path));
    await assert.rejects(() => read(account, path.replace("original.png", "unattached.png")), /not uniquely attached/);
    await assert.rejects(() => read(original), /No file access/);
    await assert.rejects(() => read(peer), /No file access/);
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
