"use client";

import React, { useMemo } from "react";
import { usePathname } from "next/navigation";
import TopNav from "@/components/TopNav";
import LibraryBar from "@/components/LibraryBar";
import SectionShell from "@/components/SectionShell";
import { useAppMode } from "@/components/ModeProvider";
import { navItemsForMode } from "@/lib/navItems";
import type { AppMode } from "@/lib/mode";
import { useTranslations } from "next-intl";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const { mode } = useAppMode();
  const pathname = usePathname();

  const isLibrary = (pathname || "").endsWith("/321lessons");

  function titleForMode(m: AppMode) {
    switch (m) {
      case "teacher":
        return t("modes.teacher");
      case "creator":
        return t("modes.creator");
      case "admin":
        return t("modes.admin");
      case "parent":
        return t("modes.parent");
      case "student":
      default:
        return t("modes.student");
    }
  }

  const items = useMemo(() => {
    return navItemsForMode(mode).map((it) => ({
      href: it.href,
      label: t(it.labelKey as any),
    }));
  }, [mode, t]);

  return (
    <div className="app-scope tw-scope">
      <TopNav />
      <LibraryBar />

      {isLibrary ? (
        <div style={{ maxWidth: 1200, margin: "10px auto", padding: 10 }}>{children}</div>
      ) : (
        <SectionShell title={titleForMode(mode)} items={items}>
          {children}
        </SectionShell>
      )}
    </div>
  );
}