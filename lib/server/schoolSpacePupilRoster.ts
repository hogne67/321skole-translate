import "server-only";

import { randomUUID } from "node:crypto";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { isActiveSpaceMember } from "@/lib/security/spaceAccess";
import { getSpaceAccess } from "@/lib/security/spaceAccess.server";
import { joinText } from "@/lib/spaceJoinPolicy";
import { runCapacityTransaction } from "@/lib/server/runCapacityTransaction";
import {
  availableSchoolRoom, createSchoolPupilCode, documentId, schoolPupilCodeHash, schoolPupilRegistrationId,
} from "@/lib/server/schoolSpacePupilCode";

export class SchoolPupilError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type SchoolRoomTeacher = {
  db: Firestore;
  schoolId: string;
  uid: string;
  spaceId: string;
};

function cleanName(value: unknown, limit: number) {
  return joinText(value).replace(/\s+/g, " ").slice(0, limit).trim();
}

function pupilNames(fullValue: unknown, displayValue: unknown) {
  const fullName = cleanName(fullValue, 160);
  if (!fullName) throw new SchoolPupilError("pupil_full_name_required");
  const displayName = cleanName(displayValue, 80) || fullName.split(" ")[0];
  if (fullName.includes(" ") && fullName.toLowerCase() === displayName.toLowerCase()) {
    throw new SchoolPupilError("pupil_display_name_required");
  }
  return { fullName, displayName };
}

function roomParticipant(row: FirebaseFirestore.DocumentSnapshot) {
  return joinText(row.get("participantId")) || joinText(row.get("uid")) || joinText(row.get("userId")) || row.id;
}

async function authorizeSchoolRoomTeacher(a: SchoolRoomTeacher, tx: Transaction) {
  const school = a.db.collection("schools").doc(a.schoolId);
  const [current, schoolDoc, teacher] = await Promise.all([
    getSpaceAccess(a.db, a.spaceId, a.uid, tx),
    tx.get(school),
    tx.get(school.collection("members").doc(a.uid)),
  ]);
  const role = current.profile?.schoolRole;
  if (!current.owner || current.profile?.role !== "teacher" || current.profile.schoolId !== a.schoolId
    || current.profile.schoolStatus !== "active" || (role !== "school_teacher" && role !== "school_admin")
    || !schoolDoc.exists || teacher.get("uid") !== a.uid || teacher.get("status") !== "active"
    || teacher.get("role") !== role || (teacher.get("schoolId") !== undefined && teacher.get("schoolId") !== a.schoolId)
    || current.space?.schoolId !== a.schoolId) {
    throw new SchoolPupilError("pupil_forbidden", 403);
  }
  if (!availableSchoolRoom(current.space ?? undefined)) throw new SchoolPupilError("pupil_room_unavailable", 409);
  return school;
}

async function readTarget(a: SchoolRoomTeacher, tx: Transaction, targetId: string) {
  const row = await tx.get(a.db.collection("spaceMembers").doc(targetId));
  if (row.get("spaceId") !== a.spaceId || row.get("role") !== "student" || !isActiveSpaceMember(row.data())) {
    throw new SchoolPupilError("pupil_not_found", 404);
  }
  return row;
}

async function activeRegistration(a: SchoolRoomTeacher, tx: Transaction, pupilId: string, target: FirebaseFirestore.DocumentSnapshot) {
  const registration = await tx.get(a.db.collection("spaceMembers").doc(schoolPupilRegistrationId(a.spaceId, pupilId)));
  if (!isActiveSpaceMember(registration.data()) || registration.get("participantId") !== roomParticipant(target)
    || registration.get("schoolPupilSchoolId") !== a.schoolId || registration.get("schoolPupilId") !== pupilId) {
    throw new SchoolPupilError("pupil_not_found", 404);
  }
}

export async function readSchoolPupilRoster(a: SchoolRoomTeacher, requestedMember: string | null) {
  return runCapacityTransaction(a.db, async tx => {
    const school = await authorizeSchoolRoomTeacher(a, tx);
    if (requestedMember !== null) {
      const memberId = documentId(requestedMember);
      if (!memberId) throw new SchoolPupilError("pupil_not_found", 404);
      const target = await readTarget(a, tx, memberId);
      const pupilId = documentId(target.get("schoolPupilId"));
      if (!pupilId) throw new SchoolPupilError("pupil_not_found", 404);
      await activeRegistration(a, tx, pupilId, target);
      const pupil = await tx.get(school.collection("spacePupils").doc(pupilId));
      if (!pupil.exists) throw new SchoolPupilError("pupil_not_found", 404);
      return { pupil: { fullName: pupil.get("fullName"), displayName: pupil.get("displayName") } };
    }

    const [pupils, registrations, rooms] = await Promise.all([
      tx.get(school.collection("spacePupils")),
      tx.get(a.db.collection("spaceMembers").where("schoolPupilSchoolId", "==", a.schoolId)
        .where("schoolPupilRegistration", "==", true)),
      tx.get(a.db.collection("spaces").where("schoolId", "==", a.schoolId)),
    ]);
    const titles = new Map(rooms.docs.filter(room => availableSchoolRoom(room.data())).map(room => [room.id, joinText(room.get("title"))]));
    const roomsByPupil = new Map<string, { spaceId: string; title: string; displayName: string }[]>();
    for (const registration of registrations.docs) {
      const data = registration.data();
      const title = titles.get(data.spaceId);
      if (title === undefined || !isActiveSpaceMember(data)) continue;
      const pupilRooms = roomsByPupil.get(data.schoolPupilId) ?? [];
      pupilRooms.push({ spaceId: data.spaceId, title, displayName: joinText(data.displayName) });
      roomsByPupil.set(data.schoolPupilId, pupilRooms);
    }
    return {
      students: pupils.docs.map(pupil => ({
        id: pupil.id, sourceMemberId: pupil.id, fullName: joinText(pupil.get("fullName")),
        displayName: joinText(pupil.get("displayName")), spaces: roomsByPupil.get(pupil.id) ?? [],
      })).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    };
  });
}

async function freshCode(tx: Transaction, school: FirebaseFirestore.DocumentReference) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const value = createSchoolPupilCode();
    const hash = schoolPupilCodeHash(school.id, value);
    const ref = school.collection("spacePupilCodes").doc(hash);
    if (!(await tx.get(ref)).exists) return { value, hash, ref };
  }
  throw new SchoolPupilError("pupil_code_unavailable", 503);
}

type SchoolPupilInput = {
  action?: unknown;
  sourceMemberId?: unknown;
  targetMemberId?: unknown;
  fullName?: unknown;
  displayName?: unknown;
};

export async function writeSchoolPupil(
  a: SchoolRoomTeacher,
  body: SchoolPupilInput,
  checkTeacherCapacity: (tx: Transaction) => Promise<FirebaseFirestore.DocumentReference>,
) {
  const targetId = documentId(body.targetMemberId);
  const sourceId = documentId(body.sourceMemberId);
  const action = body.action;
  if ((body.targetMemberId && !targetId) || (body.sourceMemberId && !sourceId)
    || (action !== undefined && action !== "rename" && action !== "rotate_code")) {
    throw new SchoolPupilError("pupil_invalid_request");
  }
  return runCapacityTransaction(a.db, async tx => {
    const school = await authorizeSchoolRoomTeacher(a, tx);
    const target = targetId ? await readTarget(a, tx, targetId) : null;
    if (action === "rename" || action === "rotate_code") {
      const pupilId = documentId(target?.get("schoolPupilId"));
      if (!target || !pupilId) throw new SchoolPupilError("pupil_not_found", 404);
      await activeRegistration(a, tx, pupilId, target);
      const pupil = await tx.get(school.collection("spacePupils").doc(pupilId));
      if (!pupil.exists) throw new SchoolPupilError("pupil_not_found", 404);
      const memberships = await tx.get(a.db.collection("spaceMembers").where("schoolPupilId", "==", pupilId)
        .where("schoolPupilSchoolId", "==", a.schoolId));
      const updatedAt = FieldValue.serverTimestamp();
      if (action === "rename") {
        const names = pupilNames(body.fullName, body.displayName);
        tx.update(pupil.ref, { ...names, updatedAt });
        for (const member of memberships.docs) {
          tx.update(member.ref, { displayName: names.displayName, studentName: names.displayName, updatedAt });
        }
        return { pupil: names };
      }
      const hashedCode = joinText(pupil.get("codeHash"));
      const code = await freshCode(tx, school);
      tx.create(code.ref, { pupilId });
      if (/^[0-9a-f]{64}$/.test(hashedCode)) tx.delete(school.collection("spacePupilCodes").doc(hashedCode));
      tx.update(pupil.ref, { codeHash: code.hash, updatedAt });
      for (const member of memberships.docs) {
        if (member.get("schoolPupilCodeAccess") === true && isActiveSpaceMember(member.data())) {
          tx.update(member.ref, { status: "school_code_rotated", active: false, archived: true, updatedAt });
        }
      }
      return { studentCode: code.value };
    }

    if (target?.get("schoolPupilId") && target.get("schoolPupilId") !== sourceId) {
      throw new SchoolPupilError("pupil_already_linked", 409);
    }
    const pupils = school.collection("spacePupils");
    const pupilRef = sourceId ? pupils.doc(sourceId) : pupils.doc();
    const pupil = sourceId ? await tx.get(pupilRef) : null;
    if (sourceId && !pupil?.exists) throw new SchoolPupilError("pupil_not_found", 404);
    const registration = await tx.get(a.db.collection("spaceMembers").doc(schoolPupilRegistrationId(a.spaceId, pupilRef.id)));
    if (target && registration.exists && registration.get("participantId") !== roomParticipant(target)) {
      throw new SchoolPupilError("pupil_already_linked", 409);
    }
    if (isActiveSpaceMember(registration.data())) return { reused: true };
    const quotaLock = !pupil && !target ? await checkTeacherCapacity(tx) : null;
    const names = pupil
      ? { fullName: joinText(pupil.get("fullName")), displayName: joinText(pupil.get("displayName")) }
      : pupilNames(body.fullName ?? body.displayName, body.fullName === undefined ? undefined : body.displayName);
    const participantId = target ? roomParticipant(target) : joinText(registration.get("participantId")) || "participant_" + randomUUID();
    const legacy = target ? await tx.get(a.db.collection("spaceMembers").where("spaceId", "==", a.spaceId)) : null;
    const code = pupil ? null : await freshCode(tx, school);
    const updatedAt = FieldValue.serverTimestamp();
    if (quotaLock) tx.set(quotaLock, { updatedAt });
    if (code) {
      tx.create(pupilRef, { ...names, codeHash: code.hash, createdAt: updatedAt, updatedAt });
      tx.create(code.ref, { pupilId: pupilRef.id });
    }
    const teacherStudentId = joinText(target?.get("teacherStudentId")) || pupilRef.id;
    const identity = {
      schoolPupilId: pupilRef.id, schoolPupilSchoolId: a.schoolId, teacherStudentId,
      displayName: names.displayName, studentName: names.displayName, updatedAt,
    };
    tx.set(registration.ref, {
      spaceId: a.spaceId, participantId, role: "student", ...identity,
      schoolPupilRegistration: true, teacherManaged: true, isAnon: true,
      active: true, archived: false, status: "active",
      ...(!registration.exists ? { createdAt: updatedAt, createdByUid: a.uid } : {}),
    }, { merge: true });
    for (const member of legacy?.docs ?? []) {
      if (member.id === registration.id || member.get("role") !== "student" || roomParticipant(member) !== participantId) continue;
      tx.update(member.ref, {
        ...identity, participantId, studentCode: FieldValue.delete(), studentCodeKey: FieldValue.delete(),
        ...(member.get("isAnon") === true && (member.get("uid") || member.get("userId"))
          ? { schoolPupilCodeAccess: true } : {}),
        ...(member.get("status") === "pending_approval" ? {
          status: "cancelled", active: false, archived: true,
          approvalCode: FieldValue.delete(), approvalExpiresAt: FieldValue.delete(),
        } : {}),
      });
    }
    return {
      member: {
        id: registration.id, participantId, displayName: names.displayName, fullName: names.fullName,
        ...(code ? { studentCode: code.value } : {}),
      },
    };
  });
}
