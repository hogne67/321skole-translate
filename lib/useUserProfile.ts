// lib/useUserProfile.ts
"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { ensureUserProfile, type UserProfile } from "@/lib/userProfile";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function normalizeProfile(raw: unknown): UserProfile | null {
  if (!isRecord(raw)) return null;

  // Copy as mutable record
  const p: Record<string, unknown> = { ...raw };

  // If teacherStatus is missing at top-level but exists under roles, lift it
  if (typeof p.teacherStatus !== "string") {
    const roles = p.roles;
    if (isRecord(roles) && typeof roles.teacherStatus === "string") {
      p.teacherStatus = roles.teacherStatus;
    }
  }

  return p as UserProfile;
}

export function useUserProfile() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      setUser(u);
      setProfile(null);

      // rydd gammel snapshot hvis vi bytter bruker
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (!u) {
        setLoading(false);
        return;
      }

      // ✅ Even anon users can have a profile later (after linking)
      // For now: if anon, we simply stop listening to users/{uid}.
      if (u.isAnonymous) {
        setLoading(false);
        return;
      }

      const ref = doc(db, "users", u.uid);

      unsubProfile = onSnapshot(
        ref,
        async (snap) => {
          try {
            if (!snap.exists()) {
              await ensureUserProfile(u);
              return; // neste snapshot kommer når docen finnes
            }

            const normalized = normalizeProfile(snap.data());
            setProfile(normalized);
          } catch (e) {
            console.error("useUserProfile: ensure/read failed", e);
            setProfile(null);
          } finally {
            setLoading(false);
          }
        },
        (err) => {
          console.error("useUserProfile: snapshot error", err);
          setProfile(null);
          setLoading(false);
        }
      );
    });

    return () => {
      if (unsubProfile) unsubProfile();
      unsubAuth();
    };
  }, []);

  return { user, profile, loading };
}