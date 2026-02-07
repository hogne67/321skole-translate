// components/AppShell.tsx
"use client";

import React from "react";
import { usePathname } from "next/navigation";

import TopNav from "@/components/TopNav";
import LibraryBar from "@/components/LibraryBar";
import SectionShell from "@/components/SectionShell";

import { useAppMode } from "@/components/ModeProvider";
import { navItemsForMode } from "@/lib/navItems";
import type { AppMode } from "@/lib/mode";

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

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { mode } = useAppMode();
  const pathname = usePathname();

  // ✅ Library skal føles som “egen hovedseksjon” og ikke drukne i submeny
  const isLibrary = pathname === "/321lessons";

  return (
    <>
      <TopNav />
      <LibraryBar />

      {isLibrary ? (
        // Full bredde under LibraryBar
        <div style={{ maxWidth: 1200, margin: "10px auto", padding: 10 }}>
          {children}
        </div>
      ) : (
        <SectionShell title={titleForMode(mode)} items={navItemsForMode(mode)}>
          {children}
        </SectionShell>
      )}
    </>
  );
}