// lib\userProfile.ts
// lib/userProfile.ts
"use client";

import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase";

/**
 * Profilmodell
 * - Arbeidsroller: student | teacher
 * - Systemrolle: admin
 * - parent kommer senere
 * - creator beholdes kun som legacy-kompatibilitet foreløpig
 */

export type Role = "student" | "teacher" | "admin" | "parent" | "creator";
export type AdminLevel = "moderator" | "admin" | "superadmin";

/** Legacy-only (ikke bruk til gating) */
export type TeacherStatus = "none" | "pending" | "approved" | "rejected";
export type PartnerStatus = "none" | "pending" | "active" | "rejected" | "disabled";
export type PartnerLevel = "none" | "partner";

export type UserProfile = {
  displayName?: string;
  email?: string;
  locale?: string;

  role?: Role;
  adminLevel?: AdminLevel;

  onboardingComplete?: boolean;
  disabled?: boolean;

  plan?: string;
  institutionType?: string;
  municipality?: string;

  partnerAccess?: boolean;
  partnerStatus?: PartnerStatus;
  partnerLevel?: PartnerLevel;
  partnerRegion?: string;
  partnerLanguages?: string[];
  partnerApprovedAt?: unknown;
  partnerApprovedBy?: string;

  // ✅ legacy-felt beholdes som optional for gamle docs
  teacherStatus?: TeacherStatus;
  creatorStatus?: string;

  // Legacy (overgang)
  roles?: {
    student?: boolean;
    teacher?: boolean;
    admin?: boolean;
    parent?: boolean;
    creator?: boolean;

    teacherStatus?: TeacherStatus;
    creatorStatus?: string;
  };

  org?: {
    country?: string;
    municipality?: string;
  };

  createdAt?: unknown;
  updatedAt?: unknown;
  lastLoginAt?: unknown;
};

function requireDb() {
  if (!db) {
    throw new Error(
      "Firestore is not initialized (db is null). Check NEXT_PUBLIC_FIREBASE_* env."
    );
  }
  return db;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

export async function ensureUserProfile(user: User, patch?: Partial<UserProfile>) {
  const dbx = requireDb();
  const ref = doc(dbx, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const profile: UserProfile = {
      displayName: user.displayName || patch?.displayName || "",
      email: user.email || patch?.email || "",
      locale: patch?.locale || "no",

      role: patch?.role,
      adminLevel: patch?.adminLevel,

      onboardingComplete: patch?.onboardingComplete ?? false,
      disabled: patch?.disabled ?? false,

      plan: patch?.plan,
      institutionType: patch?.institutionType,
      municipality: patch?.municipality,

      partnerAccess: patch?.partnerAccess,
      partnerStatus: patch?.partnerStatus,
      partnerLevel: patch?.partnerLevel,
      partnerRegion: patch?.partnerRegion,
      partnerLanguages: patch?.partnerLanguages,
      partnerApprovedAt: patch?.partnerApprovedAt,
      partnerApprovedBy: patch?.partnerApprovedBy,

      // legacy optional
      teacherStatus: patch?.teacherStatus,
      creatorStatus: patch?.creatorStatus,
      roles: patch?.roles,
      org: patch?.org,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    };

    await setDoc(ref, stripUndefined(profile as Record<string, unknown>), { merge: false });
    return;
  }

  const payload: Partial<UserProfile> = {
    ...patch,
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  };

  await setDoc(ref, stripUndefined(payload as Record<string, unknown>), { merge: true });
}
