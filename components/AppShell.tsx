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

type Role = "student" | "teacher";

function safeRole(role: unknown): Role {
  return role === "teacher" ? "teacher" : "student";
}

function readStringField(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  const v = rec[key];
  return typeof v === "string" ? v : null;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const tModes = useTranslations("modes");
  const tNav = useTranslations("nav");

  const { user, profile } = useUserProfile();
  const pathname = usePathname();

  // If anon -> treat as student
  const roleStr = readStringField(profile, "role");
  const role: Role = user?.isAnonymous ? "student" : safeRole(roleStr);

  const isLibrary = (pathname || "").endsWith("/321lessons");

  const title = role === "teacher" ? tModes("teacher") : tModes("student");

  const items = useMemo(() => {
    return navItemsForRole(role).map((it) => ({
      href: it.href,
      // navItemsForRole should reference keys like: "mySpaces", "dashboard", ...
      // (i.e. inside the "nav" namespace)
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