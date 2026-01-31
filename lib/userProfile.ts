// lib/userProfile.ts
"use client";

import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase";

export type UserProfile = {
  displayName?: string;
  email?: string;
  locale?: string;
  onboardingComplete?: boolean;

  roles?: { student?: boolean; teacher?: boolean; parent?: boolean; admin?: boolean };
  teacherStatus?: "none" | "pending" | "approved" | "rejected";
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

export async function ensureUserProfile(user: User, patch?: Partial<UserProfile>) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const profile: UserProfile = {
      displayName: user.displayName || patch?.displayName || "",
      email: user.email || patch?.email || "",
      locale: patch?.locale || "no",
      onboardingComplete: false,

      roles: { student: true },
      teacherStatus: "none",
      caps: { pdf: true, tts: true, vocab: true, publish: false, sell: false },

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      ...patch,
    };

    await setDoc(ref, profile, { merge: true });
    return;
  }

  // eksisterer: patch “trygt”
  await setDoc(
    ref,
    {
      ...patch,
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      // Sørg for defaults om de mangler
      roles: { student: true, ...(snap.data()?.roles || {}), ...(patch?.roles || {}) },
      caps: { pdf: true, tts: true, vocab: true, publish: false, sell: false, ...(snap.data()?.caps || {}), ...(patch?.caps || {}) },
      teacherStatus: (snap.data()?.teacherStatus || patch?.teacherStatus || "none") as any,
    },
    { merge: true }
  );
}
