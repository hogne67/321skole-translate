import type { Timestamp } from "firebase/firestore";

export type SchoolPlanKey = "school_5" | "school_10" | "school_25" | "custom";

export type SchoolStatus =
  | "inactive"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled";

export type BillingType = "stripe" | "manual";

export type SchoolMemberRole = "school_admin" | "school_teacher";

export type SchoolMemberStatus = "invited" | "active" | "disabled";

export type SchoolInviteStatus =
  | "pending"
  | "accepted"
  | "expired"
  | "revoked";

export type SchoolDoc = {
  id?: string;
  name: string;
  planKey: SchoolPlanKey;
  status: SchoolStatus;
  billingType: BillingType;
  teacherSeatLimit: number;
  activeTeacherCount?: number;
  createdByUid?: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type SchoolMemberDoc = {
  id?: string;
  schoolId?: string;
  uid: string;
  email?: string | null;
  displayName?: string | null;
  role: SchoolMemberRole;
  status: SchoolMemberStatus;
  invitedByUid?: string | null;
  joinedAt?: Timestamp;
  disabledAt?: Timestamp | null;
  disabledByUid?: string | null;
  deactivatedAt?: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type SchoolInviteDoc = {
  id?: string;
  schoolId?: string;
  email: string;
  role: SchoolMemberRole;
  status: SchoolInviteStatus;
  invitedByUid: string;
  acceptedByUid?: string | null;
  inviteTokenHash?: string;
  expiresAt?: Timestamp | null;
  acceptedAt?: Timestamp | null;
  revokedAt?: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};
