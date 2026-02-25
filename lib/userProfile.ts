// lib/userProfile.ts
"use client";

import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase";

/**
 * Profilmodell
 * - Primær: role
 * - teacherStatus er nå strikt union (matcher ModeProvider)
 */

export type Role =
  | "student"
  | "teacher"
  | "admin"
  | "parent"
  | "creator";

export type TeacherStatus =
  | "none"
  | "pending"
  | "approved"
  | "rejected";

export type UserProfile = {
  displayName?: string;
  email?: string;
  locale?: string;

  role?: Role;

  onboardingComplete?: boolean;

  // Status (strikt union)
  teacherStatus?: TeacherStatus;
  creatorStatus?: string;

  // Legacy (overgang – for gamle sider som leser profile.roles)
  roles?: {
    student?: boolean;
    teacher?: boolean;
    admin?: boolean;
    parent?: boolean;
    creator?: boolean;

    teacherStatus?: TeacherStatus;
    creatorStatus?: string;
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

export async function ensureUserProfile(
  user: User,
  patch?: Partial<UserProfile>
) {
  const dbx = requireDb();
  const ref = doc(dbx, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const profile: UserProfile = {
      displayName: user.displayName || patch?.displayName || "",
      email: user.email || patch?.email || "",
      locale: patch?.locale || "no",

      role: patch?.role,
      onboardingComplete: patch?.onboardingComplete ?? false,

      teacherStatus: patch?.teacherStatus ?? "none",
      creatorStatus: patch?.creatorStatus,

      roles: patch?.roles,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    };

    await setDoc(ref, stripUndefined(profile as Record<string, unknown>), {
      merge: false,
    });
    return;
  }

  const payload: Partial<UserProfile> = {
    ...patch,
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  };

  await setDoc(ref, stripUndefined(payload as Record<string, unknown>), {
    merge: true,
  });
}