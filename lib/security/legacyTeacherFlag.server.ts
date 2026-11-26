import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";
import { FieldValue, type DocumentData, type Firestore, type Transaction } from "firebase-admin/firestore";
import { isSuperAdmin } from "@/lib/adminAccess";
import { assertActiveProfile, isGloballyEnabled } from "./accountAccess.server";
import { isCurrentSpaceSubstitute, isSpaceTeachingMember } from "./spaceAccess";
import { getSpaceOwnerUid } from "./spaceOwnership";

type Blocker = "platform_privilege" | "school_staff" | "owns_rooms" | "room_staff" | "owns_courses";
type Preview =
  | { state: "ready" | "not_applicable" | "already_disabled" }
  | { state: "review_required"; blockers: Blocker[] };

function isSchoolStaffRole(role: unknown) {
  return role === "school_teacher" || role === "school_admin";
}

async function reviewTeacherDuties(db: Firestore, tx: Transaction, uid: string, profile: DocumentData) {
  const schoolId = profile.schoolId;
  const linkedSchool = typeof schoolId === "string" && schoolId && !schoolId.includes("/")
    ? db.doc(`schools/${schoolId}/members/${uid}`)
    : null;
  const rooms = ["ownerId", "ownerUid"].map(field => tx.get(db.collection("spaces")
    .where(field, "==", uid).select("ownerId", "ownerUid", "kind", "deletedAt", "archived", "status")));
  const staff = ["uid", "userId"].map(field => tx.get(db.collection("spaceMembers")
    .where(field, "==", uid).select("role", "staffRole", "status", "active", "archived", "substituteExpiresAt")));
  const [schoolMember, ownedRooms, memberships, courses] = await Promise.all([
    linkedSchool ? tx.get(linkedSchool) : null,
    Promise.all(rooms),
    Promise.all(staff),
    tx.get(db.collection("courses").where("ownerUid", "==", uid).select().limit(1)),
  ]);

  const blockers: Blocker[] = [];
  if ((profile.schoolStatus === "active" && isSchoolStaffRole(profile.schoolRole)) ||
    (schoolMember?.get("status") === "active" && isSchoolStaffRole(schoolMember.get("role")))) {
    blockers.push("school_staff");
  }
  if (ownedRooms.some(snapshot => snapshot.docs.some(doc => {
    const room = doc.data();
    return getSpaceOwnerUid(room) === uid && room.kind !== "family" && room.kind !== "parent_group" &&
      !room.deletedAt && room.archived !== true && room.status !== "archived";
  }))) {
    blockers.push("owns_rooms");
  }
  if (memberships.some(snapshot => snapshot.docs.some(doc => {
    const member = doc.data();
    return isSpaceTeachingMember(member) || isCurrentSpaceSubstitute(member);
  }))) {
    blockers.push("room_staff");
  }
  if (!courses.empty) blockers.push("owns_courses");
  return blockers;
}

async function previewFlag(db: Firestore, tx: Transaction, uid: string, profile: DocumentData): Promise<Preview> {
  if (profile.roles?.admin === true || profile.admin === true || profile.isAdmin === true || profile.adminLevel) {
    return { state: "review_required", blockers: ["platform_privilege"] };
  }
  if (profile.role !== "student" || !isGloballyEnabled(profile)) return { state: "not_applicable" };
  if (profile.roles?.teacher === false) return { state: "already_disabled" };
  if (profile.roles?.teacher !== true) return { state: "not_applicable" };
  const blockers = await reviewTeacherDuties(db, tx, uid, profile);
  return blockers.length ? { state: "review_required", blockers } : { state: "ready" };
}

export async function manageLegacyTeacherFlag(db: Firestore, actor: DecodedIdToken, uid: string, reason?: string) {
  if (actor.uid === uid || actor.firebase?.sign_in_provider === "anonymous") {
    return { status: 403, body: { error: "forbidden" } };
  }

  const userRef = db.doc(`users/${uid}`);
  return db.runTransaction(async tx => {
    // Bind the authorization decision to the same transaction as the profile change.
    const actorProfile = (await tx.get(db.doc(`users/${actor.uid}`))).data();
    assertActiveProfile(actorProfile, actor);
    if (!isSuperAdmin(actorProfile)) return { status: 403, body: { error: "forbidden" } };

    const target = (await tx.get(userRef)).data();
    if (!target) return { status: 404, body: { error: "user_not_found" } };
    const preview = await previewFlag(db, tx, uid, target);
    if (reason === undefined) return { status: 200, body: preview };
    if (preview.state === "already_disabled") return { status: 200, body: { ok: true, changed: false } };
    if (preview.state !== "ready") return { status: 409, body: preview };

    tx.update(userRef, { "roles.teacher": false });
    tx.create(db.collection("adminAuditEvents").doc(), {
      type: "legacy_teacher_flag_disabled",
      actorUid: actor.uid,
      targetUid: uid,
      field: "roles.teacher",
      before: true,
      after: false,
      reason,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { status: 200, body: { ok: true, changed: true } };
  });
}
