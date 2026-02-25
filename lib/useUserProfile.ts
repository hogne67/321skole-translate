// lib/useUserProfile.ts
"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { ensureUserProfile, type UserProfile, type TeacherStatus } from "@/lib/userProfile";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function normalizeTeacherStatus(v: unknown): TeacherStatus {
  return v === "pending" ||
    v === "approved" ||
    v === "rejected"
    ? v
    : "none";
}

function normalizeProfile(raw: unknown): UserProfile | null {
  if (!isRecord(raw)) return null;

  const p: Record<string, unknown> = { ...raw };

  // ---- teacherStatus normalization ----
  const rawTeacherStatus =
    p.teacherStatus ??
    (isRecord(p.roles) ? p.roles.teacherStatus : undefined);

  const normalizedStatus = normalizeTeacherStatus(rawTeacherStatus);

  p.teacherStatus = normalizedStatus;

  if (isRecord(p.roles)) {
    p.roles.teacherStatus = normalizedStatus;
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

      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (!u) {
        setLoading(false);
        return;
      }

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
              return;
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