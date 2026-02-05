// lib/userProfile.ts
"use client";

import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase";

export type Status = "none" | "pending" | "approved" | "rejected";

export type UserProfile = {
  displayName?: string;
  email?: string;
  locale?: string;
  onboardingComplete?: boolean;

  roles?: {
    student?: boolean;
    teacher?: boolean;
    parent?: boolean;
    creator?: boolean;
    admin?: boolean;
  };

  teacherStatus?: Status;
  creatorStatus?: Status;

  // settes når bruker søker om creator (fra /creator/apply)
  creatorAppliedAt?: unknown;

  caps?: {
    publish?: boolean;
    sell?: boolean;
    pdf?: boolean;
    tts?: boolean;
    vocab?: boolean;
  };

  org?: {
    country?: string;
    municipality?: string;
    institutionType?: string;
    institutionName?: string;
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

function defaultRoles() {
  return {
    student: true,
    teacher: false,
    parent: false,
    creator: false,
    admin: false,
  };
}

function defaultCaps() {
  return {
    pdf: true,
    tts: true,
    vocab: true,
    publish: false,
    sell: false,
  };
}

// Firestore tåler ikke undefined i payload
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

  // =========================
  // CREATE
  // =========================
  if (!snap.exists()) {
    const profile: UserProfile = {
      displayName: user.displayName || patch?.displayName || "",
      email: user.email || patch?.email || "",
      locale: patch?.locale || "no",
      onboardingComplete: false,

      roles: { ...defaultRoles(), ...(patch?.roles || {}) },

      teacherStatus: "none",
      creatorStatus: "none",

      caps: { ...defaultCaps(), ...(patch?.caps || {}) },
      org: { ...(patch?.org || {}) },

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    };

    await setDoc(ref, stripUndefined(profile as Record<string, unknown>), {
      merge: false,
    });
    return;
  }

  // =========================
  // UPDATE
  // =========================
  const existing = (snap.data() || {}) as UserProfile;

  // ❗ Viktig: aldri skriv roles fra klient
  const patchSafe: Partial<UserProfile> = patch
    ? (Object.fromEntries(
        Object.entries(patch).filter(([k]) => k !== "roles")
      ) as Partial<UserProfile>)
    : {};

  const payload: Partial<UserProfile> = {
    ...patchSafe,

    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),

    caps: {
      ...defaultCaps(),
      ...(existing.caps || {}),
      ...(patchSafe.caps || {}),
    },

    teacherStatus:
      (existing.teacherStatus ||
        patchSafe.teacherStatus ||
        "none") as Status,

    creatorStatus:
      (existing.creatorStatus ||
        patchSafe.creatorStatus ||
        "none") as Status,

    org: {
      ...(existing.org || {}),
      ...(patchSafe.org || {}),
    },
  };

  await setDoc(ref, stripUndefined(payload as Record<string, unknown>), {
    merge: true,
  });
}
