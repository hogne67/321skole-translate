// lib/useUserProfile.ts
"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { ensureUserProfile, type UserProfile } from "@/lib/userProfile";

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

      // Anon: ingen profil i Firestore (MVP)
      if (u.isAnonymous) {
        setLoading(false);
        return;
      }

      try {
        // 1) les først (unngå unødvendig write)
        let data = await readUserProfile(u.uid);

        // 2) hvis mangler: opprett profilen
        if (!data) {
          await ensureUserProfile(u);
          data = await readUserProfile(u.uid);
        }

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
