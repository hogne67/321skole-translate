// components/AppShell.tsx
"use client";

import React, { useMemo } from "react";
import { usePathname } from "next/navigation";
import TopNav from "@/components/TopNav";
import LibraryBar from "@/components/LibraryBar";
import SectionShell from "@/components/SectionShell";
import { useUserProfile } from "@/lib/useUserProfile";
import { navItemsForRole } from "@/lib/navItems";
import { useTranslations } from "next-intl";

type AppRole = "student" | "teacher";

function normalizeRole(role: unknown, isAnonymous: boolean): AppRole {
  if (isAnonymous) return "student";
  return role === "teacher" ? "teacher" : "student";
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const tModes = useTranslations("modes");
  const tNav = useTranslations("nav");

  const { user, profile } = useUserProfile();
  const pathname = usePathname();

  const role: AppRole = normalizeRole(profile?.role, !!user?.isAnonymous);

  const isLibrary = (pathname || "").endsWith("/321lessons");
  const title = role === "teacher" ? tModes("teacher") : tModes("student");

  const items = useMemo(() => {
    return navItemsForRole(role).map((it) => ({
      href: it.href,
      // labelKey MUST be like: "mySpaces", "dashboard", "createLesson" (no "nav." prefix)
      label: tNav(it.labelKey),
    }));
  }, [role, tNav]);

  return (
    <div className="app-scope tw-scope">
      <TopNav />
      <LibraryBar />

      {isLibrary ? (
        <div style={{ maxWidth: 1200, margin: "10px auto", padding: 10 }}>{children}</div>
      ) : (
        <SectionShell title={title} items={items}>
          {children}
        </SectionShell>
      )}
    </div>
  );
}