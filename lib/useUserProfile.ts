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
  return v === "pending" || v === "approved" || v === "rejected" ? v : "none";
}

type Role2 = "student" | "teacher";

type RolesMap = {
  teacher?: boolean;
  student?: boolean;
  admin?: boolean;
  creator?: boolean;
  teacherStatus?: unknown;
};

function normalizeRole(raw: unknown): Role2 | null {
  const r = String(raw ?? "").toLowerCase();

  if (r === "teacher") return "teacher";
  if (r === "student") return "student";

  // gamle “produsent/ansatt”-roller -> teacher
  if (r === "admin" || r === "creator" || r === "content" || r === "review" || r === "reviewer") return "teacher";

  if (r === "parent") return "student";

  return null;
}

function roleFromRolesMap(p: Record<string, unknown>): Role2 | null {
  const roles = isRecord(p.roles) ? (p.roles as RolesMap) : null;
  if (!roles) return null;

  if (roles.teacher === true) return "teacher";
  if (roles.student === true) return "student";

  // fallbacks om dere har hatt andre flagg
  if (roles.admin === true || roles.creator === true) return "teacher";

  return null;
}

function hasMinimumOnboardingData(p: Record<string, unknown>): boolean {
  const displayName = String(p.displayName ?? "").trim();
  const org = isRecord(p.org) ? (p.org as Record<string, unknown>) : {};
  const country = String(org.country ?? "").trim();
  const municipality = String(org.municipality ?? "").trim();

  return displayName.length > 0 && country.length > 0 && municipality.length > 0;
}

function normalizeProfile(raw: unknown): UserProfile | null {
  if (!isRecord(raw)) return null;

  const p: Record<string, unknown> = { ...raw };

  // ---- teacherStatus normalization ----
  const roles = isRecord(p.roles) ? (p.roles as RolesMap) : null;

  const rawTeacherStatus = p.teacherStatus ?? (roles ? roles.teacherStatus : undefined);
  const normalizedStatus = normalizeTeacherStatus(rawTeacherStatus);

  p.teacherStatus = normalizedStatus;

  if (roles) {
    roles.teacherStatus = normalizedStatus;
    p.roles = roles;
  }

  // ---- role normalization (2-role model) ----
  const role = normalizeRole(p.role) ?? roleFromRolesMap(p);
  if (role) p.role = role;

  // ---- onboardingComplete normalization (soft) ----
  if (p.onboardingComplete !== true && hasMinimumOnboardingData(p)) {
    p.onboardingComplete = true;
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