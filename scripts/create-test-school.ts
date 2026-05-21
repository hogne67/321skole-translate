import { FieldValue } from "firebase-admin/firestore";

import type { BillingType, SchoolDoc, SchoolMemberDoc, SchoolPlanKey } from "../lib/schools/types";
import { getAdminForScripts } from "./lib/firebaseAdminForScripts";

type Args = {
  adminUid?: string;
  adminEmail?: string;
  adminDisplayName?: string;
  schoolName?: string;
};

type TestSchoolDoc = SchoolDoc & {
  contactName?: string | null;
  contactEmail?: string | null;
};

type SchoolWriteData = Omit<TestSchoolDoc, "id" | "createdAt" | "updatedAt"> & {
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

type CreateTestSchoolInput = {
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

async function createTestSchool(input: CreateTestSchoolInput) {
  const { db } = getAdminForScripts();
  const batch = db.batch();
  const schoolRef = db.collection("schools").doc();
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
  batch.set(schoolRef.collection("members").doc(input.adminUid), adminMember);

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

function parseArgs(argv: string[]): Args {
  const args: Args = {};

  for (const item of argv) {
    const [key, ...valueParts] = item.split("=");
    const value = valueParts.join("=").trim();

    if (!key.startsWith("--") || !value) continue;

    switch (key.slice(2)) {
      case "adminUid":
        args.adminUid = value;
        break;
      case "adminEmail":
        args.adminEmail = value;
        break;
      case "adminDisplayName":
        args.adminDisplayName = value;
        break;
      case "schoolName":
        args.schoolName = value;
        break;
    }
  }

  return args;
}

function requireArg(name: keyof Args, args: Args): string {
  const value = args[name]?.trim();

  if (!value) {
    throw new Error(`Missing required argument: --${name}=...`);
  }

  return value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const adminUid = requireArg("adminUid", args);
  const adminEmail = requireArg("adminEmail", args);
  const schoolName = requireArg("schoolName", args);

  const result = await createTestSchool({
    name: schoolName,
    contactName: args.adminDisplayName ?? null,
    contactEmail: adminEmail,
    billingType: "manual",
    planKey: "school_5",
    teacherSeatLimit: 5,
    adminUid,
    adminEmail,
    adminDisplayName: args.adminDisplayName ?? null,
  });

  console.log("Test school created");
  console.log("schoolId:", result.schoolId);
  console.log("planKey:", result.school.planKey);
  console.log("teacherSeatLimit:", result.school.teacherSeatLimit);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);

    console.error("Failed to create test school:", message);
    console.error(
      "Usage: npx tsx scripts/create-test-school.ts --adminUid=UID --adminEmail=name@example.com --schoolName=\"Test school\""
    );
    process.exit(1);
  });
