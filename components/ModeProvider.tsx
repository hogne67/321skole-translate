// components/ModeProvider.tsx
"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AppMode } from "@/lib/mode";
import { allowedModesForProfile, defaultModeForProfile } from "@/lib/mode";
import { useUserProfile } from "@/lib/useUserProfile";
import type { UserProfile } from "@/lib/userProfile";

type ModeCtx = {
  mode: AppMode;
  setMode: (m: AppMode) => void;
  allowed: AppMode[];
};

const Ctx = createContext<ModeCtx | null>(null);

/**
 * Adapter: mode.ts trenger typisk bare et lite utdrag av profilen.
 * Dette gjør ModeProvider robust mot type-endringer i UserProfile.
 */
type ProfileForMode = {
  role?: string;
  teacherStatus?: "none" | "pending" | "approved" | "rejected";
  roles?: Record<string, unknown>;
};

function toProfileForMode(p: UserProfile | null): ProfileForMode | null {
  if (!p) return null;

  const teacherStatus =
    p.teacherStatus === "none" ||
    p.teacherStatus === "pending" ||
    p.teacherStatus === "approved" ||
    p.teacherStatus === "rejected"
      ? p.teacherStatus
      : undefined;

  return {
    role: p.role,
    teacherStatus,
    // behold legacy roles-map hvis mode.ts fortsatt sjekker den
    roles: (p.roles as Record<string, unknown> | undefined) ?? undefined,
  };
}

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useUserProfile();

  const [mode, setModeState] = useState<AppMode>("student");

  const profileForMode = useMemo(() => toProfileForMode(profile), [profile]);

  const allowed = useMemo<AppMode[]>(() => {
    if (loading) return ["student"];
    return allowedModesForProfile(profileForMode);
  }, [loading, profileForMode]);

  const setMode = useCallback(
    (m: AppMode) => {
      if (!allowed.includes(m)) return;
      setModeState(m);
      if (typeof window !== "undefined") window.localStorage.setItem("appMode", m);
    },
    [allowed]
  );

  useEffect(() => {
    if (loading) return;

    const stored = (typeof window !== "undefined" && window.localStorage.getItem("appMode")) || null;
    const fallback = defaultModeForProfile(profileForMode);

    const initial = stored && allowed.includes(stored as AppMode) ? (stored as AppMode) : fallback;

    setModeState(initial);
  }, [loading, profileForMode, allowed]);

  const value = useMemo(() => ({ mode, setMode, allowed }), [mode, setMode, allowed]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppMode() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppMode must be used inside <ModeProvider>");
  return v;
}