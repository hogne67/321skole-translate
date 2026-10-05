import { FieldValue } from "firebase-admin/firestore";

import { getAdmin } from "@/lib/firebaseAdmin";
import { assertSchoolAssignmentAvailable, resolveSchoolAdministrator } from "@/lib/schools/administrator";
import {
  schoolMemberDocRef,
  schoolsCollectionRef,
} from "@/lib/schools/server/refs";
import type { BillingType, SchoolDoc, SchoolMemberDoc, SchoolPlanKey } from "@/lib/schools/types";

export type CreateSchoolInput = {
  name: string;
  contactName?: string | null;
  contactEmail?: string | null;
  billingType: BillingType;
  planKey: SchoolPlanKey;
  teacherSeatLimit: number;
  adminUid?: string;
  createdByUid?: string;
  adminEmail?: string | null;
  adminDisplayName?: string | null;
};

export type CreatedSchoolDoc = SchoolDoc & {
  contactName?: string | null;
  contactEmail?: string | null;
};

export type CreateSchoolResult = {
  schoolId: string;
  administratorUid: string;
  school: CreatedSchoolDoc;
};

type SchoolWriteData = Omit<CreatedSchoolDoc, "id" | "createdAt" | "updatedAt"> & {
  createdAt: FieldValue;
  updatedAt: FieldValue;
};

type SchoolMemberWriteData = Omit<
  SchoolMemberDoc,
  "id" | "createdAt" | "updatedAt" | "joinedAt"
> & {
  createdAt: FieldValue;
  updatedAt: FieldValue;
  joinedAt: FieldValue;
};

export async function createSchool(input: CreateSchoolInput): Promise<CreateSchoolResult> {
  const { db, auth } = getAdmin();
  const administrator = await resolveSchoolAdministrator(auth, input);
  const schoolRef = schoolsCollectionRef().doc();
  const schoolId = schoolRef.id;
  const now = FieldValue.serverTimestamp();

  const school: SchoolWriteData = {
    name: input.name,
    contactName: input.contactName ?? null,
    contactEmail: input.contactEmail ?? null,
    planKey: input.planKey,
    status: "active",
    billingType: input.billingType,
    teacherSeatLimit: input.teacherSeatLimit,
    activeTeacherCount: 0,
    createdByUid: input.createdByUid ?? administrator.uid,
    createdAt: now,
    updatedAt: now,
  };

  const adminMember: SchoolMemberWriteData = {
    schoolId,
    uid: administrator.uid,
    email: administrator.email ?? null,
    displayName: administrator.displayName || input.adminDisplayName || null,
    role: "school_admin",
    status: "active",
    invitedByUid: null,
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  await db.runTransaction(async (transaction) => {
    const profileRef = db.collection("users").doc(administrator.uid);
    const profile = await transaction.get(profileRef);
    assertSchoolAssignmentAvailable(profile.data(), schoolId);
    transaction.set(schoolRef, school);
    transaction.set(schoolMemberDocRef(schoolId, administrator.uid), adminMember);
    transaction.set(profileRef, {
      schoolId,
      schoolRole: "school_admin",
      schoolStatus: "active",
      updatedAt: now,
    }, { merge: true });
  });

  return {
    schoolId,
    administratorUid: administrator.uid,
    school: {
      id: schoolId,
      name: school.name,
      contactName: school.contactName,
      contactEmail: school.contactEmail,
      planKey: school.planKey,
      status: school.status,
      billingType: school.billingType,
      teacherSeatLimit: school.teacherSeatLimit,
      activeTeacherCount: school.activeTeacherCount,
      createdByUid: school.createdByUid,
    },
  };
}
