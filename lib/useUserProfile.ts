// lib/useUserProfile.ts
"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { ensureUserProfile } from "@/lib/userProfile"; // ✅ bruker den nye, permanente

export type UserProfile = {
  displayName?: string;
  email?: string;
  locale?: string;
  onboardingComplete?: boolean;

  roles?: {
    student?: boolean;
    teacher?: boolean;
    parent?: boolean;
    admin?: boolean;
  };

  teacherStatus?: "none" | "pending" | "approved" | "rejected";

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

  createdAt?: any;
  updatedAt?: any;
  lastLoginAt?: any;
};

async function readUserProfile(uid: string): Promise<UserProfile | null> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export function useUserProfile() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      setUser(u);
      setProfile(null);

      if (!u) {
        setLoading(false);
        return;
      }

      try {
        // ✅ Permanent: sørg for at profilen finnes + server-side patch av roles/caps/teacherStatus
        await ensureUserProfile(u, { locale: "no" });

        // Les profilen etter ensure
        const data = await readUserProfile(u.uid);
        setProfile(data);
      } catch (e) {
        console.error("useUserProfile: ensure/read failed", e);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  return { user, profile, loading };
}
