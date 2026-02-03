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
  creatorAppliedAt?: any;

  caps?: { publish?: boolean; sell?: boolean; pdf?: boolean; tts?: boolean; vocab?: boolean };

  org?: {
    country?: string;
    municipality?: string;
    institutionType?: string;
    institutionName?: string;
  };

  createdAt?: any;
  updatedAt?: any;
  lastLoginAt?: any;
};

function defaultRoles() {
  return { student: true, teacher: false, parent: false, creator: false, admin: false };
}

function defaultCaps() {
  return { pdf: true, tts: true, vocab: true, publish: false, sell: false };
}

// Firestore tåler ikke undefined i payload
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export async function ensureUserProfile(user: User, patch?: Partial<UserProfile>) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const profile: UserProfile = {
      displayName: user.displayName || patch?.displayName || "",
      email: user.email || patch?.email || "",
      locale: patch?.locale || "no",
      onboardingComplete: false,

      // create: vi kan sette defaults + patch
      roles: { ...defaultRoles(), ...(patch?.roles || {}) },

      teacherStatus: "none",
      creatorStatus: "none",

      caps: { ...defaultCaps(), ...(patch?.caps || {}) },
      org: { ...(patch?.org || {}) },

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    };

    await setDoc(ref, stripUndefined(profile as any), { merge: false });
    return;
  }

  const existing = (snap.data() || {}) as UserProfile;

  // ✅ Update: aldri skriv roles fra klient
  // (rules stopper det, og det skaper røde streker/feil senere)
  const { roles: _roles, ...patchSafe } = patch || {};

  const payload: Partial<UserProfile> = {
    ...patchSafe,

    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),

    // caps: klient kan oppdatere (om du vil)
    caps: {
      ...defaultCaps(),
      ...(existing.caps || {}),
      ...(patchSafe.caps || {}),
    },

    // teacherStatus: behold eksisterende hvis den finnes
    teacherStatus: (existing.teacherStatus || patchSafe.teacherStatus || "none") as Status,

    // creatorStatus: behold eksisterende hvis den finnes
    creatorStatus: (existing.creatorStatus || patchSafe.creatorStatus || "none") as Status,

    org: {
      ...(existing.org || {}),
      ...(patchSafe.org || {}),
    },
  };

  await setDoc(ref, stripUndefined(payload as any), { merge: true });
}
