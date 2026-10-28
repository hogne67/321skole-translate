import { FieldValue } from "firebase-admin/firestore";

import { getAdmin } from "@/lib/firebaseAdmin";
import { schoolMemberDocRef } from "@/lib/schools/server/refs";
import type { SchoolMemberDoc } from "@/lib/schools/types";

export type DisableSchoolTeacherInput = {
  schoolId: string;
  targetUid: string;
  performedByUid?: string;
};

export type DisableSchoolTeacherResult = {
  ok: boolean;
  reason?: "member_not_found" | "not_school_teacher" | "already_school_member";
  schoolId?: string;
  uid?: string;
};

export async function disableSchoolTeacher(
  input: DisableSchoolTeacherInput
): Promise<DisableSchoolTeacherResult> {
  const { db } = getAdmin();
  const memberRef = schoolMemberDocRef(input.schoolId, input.targetUid);
  const profileRef = db.collection("users").doc(input.targetUid);

  return db.runTransaction(async (transaction) => {
    const memberSnapshot = await transaction.get(memberRef);
    const profileSnapshot = await transaction.get(profileRef);
    if (profileSnapshot.get("schoolId") && profileSnapshot.get("schoolId") !== input.schoolId) {
      return { ok: false, reason: "already_school_member", schoolId: input.schoolId, uid: input.targetUid };
    }

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

    const now = FieldValue.serverTimestamp();
    const disabledBy = input.performedByUid
      ? { disabledByUid: input.performedByUid }
      : {};

    transaction.update(memberRef, {
      status: "disabled",
      disabledAt: now,
      updatedAt: now,
      ...disabledBy,
    });
    transaction.set(
      profileRef,
      {
        schoolStatus: "disabled",
        updatedAt: now,
      },
      { merge: true }
    );

    return {
      ok: true,
      schoolId: input.schoolId,
      uid: input.targetUid,
    };
  });
}
