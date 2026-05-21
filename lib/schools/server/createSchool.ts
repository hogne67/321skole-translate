import { FieldValue } from "firebase-admin/firestore";

import { getAdmin } from "@/lib/firebaseAdmin";
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
  adminUid: string;
  adminEmail?: string | null;
  adminDisplayName?: string | null;
};

export type CreatedSchoolDoc = SchoolDoc & {
  contactName?: string | null;
  contactEmail?: string | null;
};

export type CreateSchoolResult = {
  schoolId: string;
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
  const { db } = getAdmin();
  const batch = db.batch();
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
    createdByUid: input.adminUid,
    createdAt: now,
    updatedAt: now,
  };

  const adminMember: SchoolMemberWriteData = {
    schoolId,
    uid: input.adminUid,
    email: input.adminEmail ?? null,
    displayName: input.adminDisplayName ?? null,
    role: "school_admin",
    status: "active",
    invitedByUid: null,
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  batch.set(schoolRef, school);
  batch.set(schoolMemberDocRef(schoolId, input.adminUid), adminMember);

  await batch.commit();

  return {
    schoolId,
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
