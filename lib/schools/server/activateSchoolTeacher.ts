import { runCapacityTransaction } from "@/lib/server/runCapacityTransaction";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { schoolMemberDocRef, schoolDocRef, schoolMembersCollectionRef, schoolInvitesCollectionRef } from "./refs";

export type ActivateSchoolTeacherInput = { schoolId: string; targetUid: string; performedByUid?: string };
export type ActivateSchoolTeacherResult = {
  ok: boolean; reason?: "member_not_found" | "not_school_teacher" | "already_active" | "school_not_found" | "school_not_active"
    | "invalid_seat_limit" | "seat_limit_reached" | "already_school_member" | "account_disabled";
  schoolId?: string; uid?: string; activeTeacherCount?: number; teacherSeatLimit?: number;
};
export async function activateSchoolTeacher(input: ActivateSchoolTeacherInput): Promise<ActivateSchoolTeacherResult> {
  const { db } = getAdmin();
  const schoolRef = schoolDocRef(input.schoolId);
  const memberRef = schoolMemberDocRef(input.schoolId, input.targetUid);
  const profileRef = db.collection("users").doc(input.targetUid);
  return runCapacityTransaction(db, async transaction => {
    const [school, member, profile, teachers, pending] = await Promise.all([
      transaction.get(schoolRef), transaction.get(memberRef), transaction.get(profileRef),
      transaction.get(schoolMembersCollectionRef(input.schoolId).where("role", "==", "school_teacher").where("status", "==", "active")),
      transaction.get(schoolInvitesCollectionRef().where("schoolId", "==", input.schoolId).where("status", "==", "pending")),
    ]);
    const base = { schoolId: input.schoolId, uid: input.targetUid };
    if (!member.exists) return { ...base, ok: false, reason: "member_not_found" };
    if (member.get("role") !== "school_teacher") return { ...base, ok: false, reason: "not_school_teacher" };
    if (profile.get("disabled") === true) return { ...base, ok: false, reason: "account_disabled" };
    if (profile.get("schoolId") && profile.get("schoolId") !== input.schoolId && profile.get("schoolStatus") === "active") return { ...base, ok: false, reason: "already_school_member" };
    if (member.get("status") === "active") return { ...base, ok: false, reason: "already_active" };
    if (!school.exists) return { ...base, ok: false, reason: "school_not_found" };
    if (school.get("status") !== "active") return { ...base, ok: false, reason: "school_not_active" };
    const limit = school.get("teacherSeatLimit");
    if (!Number.isInteger(limit) || limit <= 0) return { ...base, ok: false, reason: "invalid_seat_limit" };
    const reserved = pending.docs.filter(doc => !doc.get("expiresAt") || doc.get("expiresAt").toMillis() > Date.now()).length;
    if (teachers.size + reserved >= limit) return { ...base, ok: false, reason: "seat_limit_reached", activeTeacherCount: teachers.size, teacherSeatLimit: limit };
    const now = FieldValue.serverTimestamp();
    transaction.update(memberRef, { status: "active", activatedAt: now, updatedAt: now, disabledAt: null, disabledByUid: null, deactivatedAt: null,
      ...(input.performedByUid ? { activatedByUid: input.performedByUid } : {}) });
    transaction.set(profileRef, { schoolId: input.schoolId, schoolRole: "school_teacher", schoolStatus: "active", updatedAt: now }, { merge: true });
    // Invitation creation/acceptance use this same document as their capacity lock.
    transaction.update(schoolRef, { updatedAt: now });
    return { ...base, ok: true, activeTeacherCount: teachers.size + 1, teacherSeatLimit: limit };
  });
}
