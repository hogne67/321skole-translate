"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AppMode } from "@/lib/mode";
import { allowedModesForProfile, defaultModeForProfile } from "@/lib/mode";
import { useUserProfile } from "@/lib/useUserProfile";

type ModeCtx = {
  mode: AppMode;
  setMode: (m: AppMode) => void;
  allowed: AppMode[];
};

const Ctx = createContext<ModeCtx | null>(null);

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useUserProfile();

  const [mode, setModeState] = useState<AppMode>("student");

  const allowed = useMemo<AppMode[]>(() => {
    if (loading) return ["student"];
    return allowedModesForProfile(profile);
  }, [loading, profile]);

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

    const stored =
      (typeof window !== "undefined" && window.localStorage.getItem("appMode")) || null;

    const fallback = defaultModeForProfile(profile);

    const initial =
      stored && allowed.includes(stored as AppMode) ? (stored as AppMode) : fallback;

    setModeState(initial);
  }, [loading, profile, allowed]);

  const value = useMemo(() => ({ mode, setMode, allowed }), [mode, setMode, allowed]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppMode() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppMode must be used inside <ModeProvider>");
  return v;
}