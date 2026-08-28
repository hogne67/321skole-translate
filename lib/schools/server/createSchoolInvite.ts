import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { getAdmin } from "@/lib/firebaseAdmin";
import { getSchool } from "@/lib/schools/server/getSchool";
import { schoolInviteDocRef, schoolInvitesCollectionRef } from "@/lib/schools/server/refs";
import { createInviteToken, hashInviteToken } from "@/lib/schools/server/tokens";
import type { SchoolInviteDoc } from "@/lib/schools/types";

const INVITE_EXPIRES_IN_DAYS = 14;

export type CreateSchoolInviteInput = {
  schoolId: string;
  email: string;
  invitedBy: string;
};

export type CreateSchoolInviteResult = {
  ok: boolean;
  reason?: "school_not_found" | "school_not_active" | "pending_invite_exists";
  inviteId?: string;
  token?: string;
};

type SchoolInviteWriteData = Omit<
  SchoolInviteDoc,
  "id" | "createdAt" | "updatedAt" | "expiresAt"
> & {
  createdAt: FieldValue;
  updatedAt: FieldValue;
  expiresAt: Timestamp;
};

function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getInviteExpiresAt(): Timestamp {
  const expiresAtMs = Date.now() + INVITE_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000;

  return Timestamp.fromMillis(expiresAtMs);
}

export async function createSchoolInvite(
  input: CreateSchoolInviteInput
): Promise<CreateSchoolInviteResult> {
  const school = await getSchool(input.schoolId);

  if (!school) {
    return { ok: false, reason: "school_not_found" };
  }

  if (school.status !== "active") {
    return { ok: false, reason: "school_not_active" };
  }

  const email = normalizeInviteEmail(input.email);
  const existingPendingInvite = await schoolInvitesCollectionRef()
    .where("schoolId", "==", input.schoolId)
    .where("email", "==", email)
    .where("status", "==", "pending")
    .limit(1)
    .get();

  if (!existingPendingInvite.empty) {
    return {
      ok: false,
      reason: "pending_invite_exists",
      inviteId: existingPendingInvite.docs[0]?.id,
    };
  }

  const { db } = getAdmin();
  const batch = db.batch();
  const inviteRef = schoolInvitesCollectionRef().doc();
  const token = createInviteToken();
  const now = FieldValue.serverTimestamp();
  const invite: SchoolInviteWriteData = {
    schoolId: input.schoolId,
    email,
    role: "school_teacher",
    status: "pending",
    invitedByUid: input.invitedBy,
    acceptedByUid: null,
    inviteTokenHash: hashInviteToken(token),
    inviteToken: token,
    expiresAt: getInviteExpiresAt(),
    acceptedAt: null,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  batch.set(schoolInviteDocRef(inviteRef.id), invite);

  await batch.commit();

  return {
    ok: true,
    inviteId: inviteRef.id,
    token,
  };
}
