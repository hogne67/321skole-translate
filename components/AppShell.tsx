// components/AppShell.tsx
"use client";

import React, { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import TopNav from "@/components/TopNav";
import LibraryBar from "@/components/LibraryBar";
import SectionShell from "@/components/SectionShell";
import { useUserProfile } from "@/lib/useUserProfile";
import { navItemsForRole } from "@/lib/navItems";
import { useTranslations } from "next-intl";

type AppRole = "student" | "teacher" | "parent" | "admin" | "creator";

function normalizeRole(role: unknown, isAnonymous: boolean): AppRole {
  if (isAnonymous) return "student";
  if (role === "teacher") return "teacher";
  if (role === "parent") return "parent";
  if (role === "admin") return "admin";
  if (role === "creator") return "creator";
  return "student";
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const tModes = useTranslations("modes");
  const tNav = useTranslations("nav");

  const { user, profile } = useUserProfile();
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;

    const scrollNow = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    scrollNow();

    const r1 = requestAnimationFrame(scrollNow);
    const r2 = requestAnimationFrame(() => {
      requestAnimationFrame(scrollNow);
    });

    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [pathname]);

  const role: AppRole = normalizeRole(profile?.role, !!user?.isAnonymous);

  const isLibrary = (pathname || "").endsWith("/321lessons");
  const isProducer = (pathname || "").includes("/producer");

  const title =
    role === "teacher"
      ? tModes("teacher")
      : role === "parent"
        ? tModes("parent")
        : role === "admin" || role === "creator"
          ? tModes("teacher")
          : tModes("student");

  const items = useMemo(() => {
    const baseItems = navItemsForRole(role).map((it) => ({
      href: it.href,
      label: tNav(it.labelKey),
    }));

    if (
      profile?.schoolId &&
      profile.schoolRole === "school_admin" &&
      profile.schoolStatus === "active"
    ) {
      return [
        ...baseItems,
        {
          href: "/school",
          label: "Skoleadministrasjon",
        },
      ];
    }

    return baseItems;
  }, [profile?.schoolId, profile?.schoolRole, profile?.schoolStatus, role, tNav]);

  return (
    <div className="app-scope tw-scope appShellRoot">
      <TopNav />
      <LibraryBar />

      {isLibrary ? (
        <div className="libraryWrap">{children}</div>
      ) : (
        <SectionShell title={title} items={items} fullWidth={isProducer}>
          {children}
        </SectionShell>
      )}

      <style jsx>{`
        .appShellRoot {
          width: 100%;
          min-width: 0;
          overflow-x: clip;
        }

        .libraryWrap {
          max-width: 1200px;
          margin: 10px auto;
          padding: 10px;
          width: 100%;
          min-width: 0;
          overflow-x: clip;
        }

        :global(html),
        :global(body) {
          max-width: 100%;
          overflow-x: clip;
        }
      `}</style>
    </div>
  );
}
