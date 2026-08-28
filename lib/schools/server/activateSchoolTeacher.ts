import { FieldValue } from "firebase-admin/firestore";

import { getAdmin } from "@/lib/firebaseAdmin";
import { canActivateTeacher } from "@/lib/schools/server/canActivateTeacher";
import { schoolMemberDocRef } from "@/lib/schools/server/refs";
import type { SchoolMemberDoc } from "@/lib/schools/types";

export type ActivateSchoolTeacherInput = {
  schoolId: string;
  targetUid: string;
  performedByUid?: string;
};

export type ActivateSchoolTeacherResult = {
  ok: boolean;
  reason?:
    | "member_not_found"
    | "not_school_teacher"
    | "already_active"
    | "school_not_found"
    | "school_not_active"
    | "invalid_seat_limit"
    | "seat_limit_reached";
  schoolId?: string;
  uid?: string;
  activeTeacherCount?: number;
  teacherSeatLimit?: number;
};

export async function activateSchoolTeacher(
  input: ActivateSchoolTeacherInput
): Promise<ActivateSchoolTeacherResult> {
  const { db } = getAdmin();
  const memberRef = schoolMemberDocRef(input.schoolId, input.targetUid);
  const profileRef = db.collection("users").doc(input.targetUid);

  const memberSnapshot = await memberRef.get();

  if (!memberSnapshot.exists) {
    return {
      ok: false,
      reason: "member_not_found",
      schoolId: input.schoolId,
      uid: input.targetUid,
    };
  }

  const member = memberSnapshot.data() as SchoolMemberDoc;

  if (member.role !== "school_teacher") {
    return {
      ok: false,
      reason: "not_school_teacher",
      schoolId: input.schoolId,
      uid: input.targetUid,
    };
  }

  if (member.status === "active") {
    return {
      ok: false,
      reason: "already_active",
      schoolId: input.schoolId,
      uid: input.targetUid,
    };
  }

  const capacity = await canActivateTeacher(input.schoolId);

  if (!capacity.ok) {
    return {
      ok: false,
      reason: capacity.reason,
      schoolId: input.schoolId,
      uid: input.targetUid,
      activeTeacherCount: capacity.activeTeacherCount,
      teacherSeatLimit: capacity.teacherSeatLimit,
    };
  }

  const now = FieldValue.serverTimestamp();
  const activatedBy = input.performedByUid
    ? { activatedByUid: input.performedByUid }
    : {};

  await db.runTransaction(async (transaction) => {
    transaction.update(memberRef, {
      status: "active",
      activatedAt: now,
      updatedAt: now,
      disabledAt: null,
      disabledByUid: null,
      deactivatedAt: null,
      ...activatedBy,
    });
    transaction.set(
      profileRef,
      {
        schoolId: input.schoolId,
        schoolRole: "school_teacher",
        schoolStatus: "active",
        updatedAt: now,
      },
      { merge: true }
    );
  });

  return {
    ok: true,
    schoolId: input.schoolId,
    uid: input.targetUid,
    activeTeacherCount: capacity.activeTeacherCount,
    teacherSeatLimit: capacity.teacherSeatLimit,
  };
}
