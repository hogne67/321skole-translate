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

type AppRole = "student" | "teacher" | "admin" | "parent" | "creator";

type RolesMap = {
  teacher?: boolean;
  student?: boolean;
  admin?: boolean;
  creator?: boolean;
  parent?: boolean;
};

function normalizeRole(raw: unknown): AppRole | null {
  const r = String(raw ?? "").toLowerCase();

  if (r === "student") return "student";
  if (r === "teacher") return "teacher";
  if (r === "admin") return "admin";
  if (r === "parent") return "parent";
  if (r === "creator") return "creator";

  // gamle aliaser hvis de finnes i eldre docs
  if (r === "content" || r === "review" || r === "reviewer") return "admin";

  return null;
}

function roleFromRolesMap(p: Record<string, unknown>): AppRole | null {
  const roles = isRecord(p.roles) ? (p.roles as RolesMap) : null;
  if (!roles) return null;

  if (roles.admin === true) return "admin";
  if (roles.teacher === true) return "teacher";
  if (roles.creator === true) return "creator";
  if (roles.parent === true) return "parent";
  if (roles.student === true) return "student";

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

  // full rollemodell
  const role = normalizeRole(p.role) ?? roleFromRolesMap(p);
  if (role) p.role = role;

  // onboarding soft-normalisering
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

      if (!db) {
        console.error("useUserProfile: Firestore db is null (firebase init missing?)");
        setProfile(null);
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