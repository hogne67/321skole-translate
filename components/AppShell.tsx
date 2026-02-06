// components/AppShell.tsx
"use client";

import React from "react";
import TopNav from "@/components/TopNav";
import SectionShell from "@/components/SectionShell";
import { useAppMode } from "@/components/ModeProvider";
import { navItemsForMode } from "@/lib/navItems";
import type { AppMode } from "@/lib/mode";
import { useUserProfile } from "@/lib/useUserProfile";

function titleForMode(mode: AppMode) {
  switch (mode) {
    case "teacher":
      return "Teacher";
    case "creator":
      return "Creator";
    case "admin":
      return "Admin";
    case "parent":
      return "Parent";
    default:
      return "Student";
  }
}

function subtitleForMode(mode: AppMode) {
  switch (mode) {
    case "teacher":
      return "";
    case "creator":
      return "Produksjon: lag og publiser innhold.";
    case "admin":
      return "Administrasjon og moderering.";
    case "parent":
      return "Foreldrevisning og støtte.";
    default:
      return "";
  }
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { mode } = useAppMode();
  const { user } = useUserProfile();

  const isAnon = !!user?.isAnonymous;

  return (
    <>
      <TopNav />
      <SectionShell
        title={titleForMode(mode)}
        subtitle={subtitleForMode(mode)}
        items={navItemsForMode(mode)}
      >
        {children}
      </SectionShell>
    </>
  );
}
