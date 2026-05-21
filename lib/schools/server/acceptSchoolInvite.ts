import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { getAdmin } from "@/lib/firebaseAdmin";
import {
  schoolDocRef,
  schoolInviteDocRef,
  schoolInvitesCollectionRef,
  schoolMemberDocRef,
  schoolMembersCollectionRef,
} from "@/lib/schools/server/refs";
import { hashInviteToken } from "@/lib/schools/server/tokens";
import type { SchoolDoc, SchoolInviteDoc } from "@/lib/schools/types";

export type AcceptSchoolInviteInput = {
  token: string;
  uid: string;
  email: string;
  displayName?: string | null;
};

export type AcceptSchoolInviteResult = {
  ok: boolean;
  reason?:
    | "invite_not_found"
    | "invite_not_pending"
    | "invite_expired"
    | "email_mismatch"
    | "school_not_found"
    | "school_not_active"
    | "invalid_seat_limit"
    | "seat_limit_reached";
  schoolId?: string;
  memberId?: string;
  inviteId?: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isExpired(expiresAt: SchoolInviteDoc["expiresAt"]): boolean {
  if (!expiresAt) return false;

  return expiresAt.toMillis() <= Timestamp.now().toMillis();
}

export async function acceptSchoolInvite(
  input: AcceptSchoolInviteInput
): Promise<AcceptSchoolInviteResult> {
  const email = normalizeEmail(input.email);
  const inviteTokenHash = hashInviteToken(input.token);
  const { db } = getAdmin();

  return db.runTransaction(async (transaction) => {
    const inviteSnapshot = await transaction.get(
      schoolInvitesCollectionRef()
        .where("inviteTokenHash", "==", inviteTokenHash)
        .limit(1)
    );

    if (inviteSnapshot.empty) {
      return { ok: false, reason: "invite_not_found" };
    }

    const inviteDoc = inviteSnapshot.docs[0]!;
    const inviteId = inviteDoc.id;
    const invite = {
      id: inviteId,
      ...(inviteDoc.data() as SchoolInviteDoc),
    };

    if (invite.status !== "pending") {
      return {
        ok: false,
        reason: "invite_not_pending",
        inviteId,
      };
    }

    if (isExpired(invite.expiresAt)) {
      return {
        ok: false,
        reason: "invite_expired",
        inviteId,
      };
    }

    if (!invite.schoolId) {
      return {
        ok: false,
        reason: "school_not_found",
        inviteId,
      };
    }

    if (email !== normalizeEmail(invite.email)) {
      return {
        ok: false,
        reason: "email_mismatch",
        schoolId: invite.schoolId,
        inviteId,
      };
    }

    const schoolSnapshot = await transaction.get(schoolDocRef(invite.schoolId));

    if (!schoolSnapshot.exists) {
      return {
        ok: false,
        reason: "school_not_found",
        schoolId: invite.schoolId,
        inviteId,
      };
    }

    const school = schoolSnapshot.data() as SchoolDoc;
    const { teacherSeatLimit } = school;

    if (school.status !== "active") {
      return {
        ok: false,
        reason: "school_not_active",
        schoolId: invite.schoolId,
        inviteId,
      };
    }

    if (!Number.isFinite(teacherSeatLimit) || teacherSeatLimit <= 0) {
      return {
        ok: false,
        reason: "invalid_seat_limit",
        schoolId: invite.schoolId,
        inviteId,
      };
    }

    // TODO: If invite acceptance becomes highly concurrent, consider a
    // transactionally maintained teacher counter instead of query counting.
    const activeTeachersSnapshot = await transaction.get(
      schoolMembersCollectionRef(invite.schoolId)
        .where("role", "==", "school_teacher")
        .where("status", "==", "active")
    );

    if (activeTeachersSnapshot.size >= teacherSeatLimit) {
      return {
        ok: false,
        reason: "seat_limit_reached",
        schoolId: invite.schoolId,
        inviteId,
      };
    }

    const memberRef = schoolMemberDocRef(invite.schoolId, input.uid);
    const inviteRef = schoolInviteDocRef(inviteId);
    const profileRef = db.collection("users").doc(input.uid);
    const memberSnapshot = await transaction.get(memberRef);
    const memberId = memberRef.id;
    const now = FieldValue.serverTimestamp();
    const memberData = {
      schoolId: invite.schoolId,
      uid: input.uid,
      email,
      displayName: input.displayName ?? null,
      role: invite.role,
      status: "active",
      invitedByUid: invite.invitedByUid,
      joinedAt: now,
      updatedAt: now,
      ...(memberSnapshot.exists ? {} : { createdAt: now }),
    };

    transaction.set(memberRef, memberData, { merge: true });
    transaction.set(
      profileRef,
      {
        schoolId: invite.schoolId,
        schoolRole: invite.role,
        schoolStatus: "active",
        updatedAt: now,
      },
      { merge: true }
    );
    transaction.update(inviteRef, {
      status: "accepted",
      acceptedByUid: input.uid,
      acceptedAt: now,
      updatedAt: now,
    });

    return {
      ok: true,
      schoolId: invite.schoolId,
      memberId,
      inviteId,
    };
  });
}
