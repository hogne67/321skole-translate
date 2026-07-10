"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { useState } from "react";
import { CalendarDays, Eye, FileText, Home, Map, Menu, NotebookPen, Printer, Settings, ShieldCheck, X } from "lucide-react";

type ActiveKey = "overview" | "official" | "annual" | "local" | "calendar" | "semesters" | "periods" | "activities" | "reflections" | "print" | "settings";

type PlannerWorkspaceNavProps = {
  locale: string;
  plannerId: string;
  title: string;
  status: string;
  active: ActiveKey;
  hasUnsavedChanges?: boolean;
};

const NAV_ITEMS = [
  { key: "overview", label: "Oversikt", href: "", icon: Home },
  { key: "official", label: "Offisielt grunnlag", section: "Offisielt grunnlag", icon: ShieldCheck },
  { key: "annual", label: "Årsplan", section: "Årsplan", icon: FileText },
  { key: "local", label: "Lokalt grunnlag", section: "Lokalt grunnlag", icon: Map },
  { key: "calendar", label: "Skolerute", section: "Skolerute", icon: CalendarDays },
  { key: "semesters", label: "Semesterplaner", section: "Semesterplaner", icon: CalendarDays },
  { key: "periods", label: "Periodeplaner", section: "Periodeplaner", icon: CalendarDays },
  { key: "activities", label: "Aktiviteter", section: "Aktiviteter", icon: Eye },
  { key: "reflections", label: "Refleksjon", section: "Refleksjon", icon: NotebookPen },
  { key: "print", label: "Utskrift", href: "/print", icon: Printer },
  { key: "settings", label: "Innstillinger", section: "Innstillinger", icon: Settings },
] as const;

export function PlannerWorkspaceNav({
  locale,
  plannerId,
  title,
  status,
  active,
  hasUnsavedChanges = false,
}: PlannerWorkspaceNavProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const baseHref = `/${locale}/teacher/planner/${plannerId}`;
  const activeItem = NAV_ITEMS.find((item) => item.key === active) ?? NAV_ITEMS[0];
  const ActiveIcon = activeItem.icon;
  const confirmLeave = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      hasUnsavedChanges &&
      !window.confirm("Du har ulagrede endringer. Vil du gå videre uten å lagre først?")
    ) {
      event.preventDefault();
    }
  };

  return (
    <section className="sticky top-2 z-20 rounded-lg border border-sky-100 bg-sky-50/95 p-3 shadow-sm backdrop-blur sm:top-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 break-words text-lg font-black text-slate-950 sm:text-2xl">{title || "Uten tittel"}</h1>
          <p className="mt-1 text-sm text-slate-600 sm:mt-2">Planlegging, redigering og utskrift i ett arbeidsrom.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 max-sm:w-full">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold capitalize text-slate-600">
            {status || "draft"}
          </span>
          <Link
            href={`/${locale}/teacher/planner`}
            onClick={confirmLeave}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50 max-sm:ml-auto"
          >
            Mine planer
          </Link>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 sm:hidden">
        <button
          type="button"
          onClick={() => setMobileMenuOpen((open) => !open)}
          className="inline-flex h-10 flex-1 items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-black text-slate-900"
          aria-expanded={mobileMenuOpen}
          aria-controls="planner-mobile-nav"
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <ActiveIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{activeItem.label}</span>
          </span>
          {mobileMenuOpen ? <X className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Menu className="h-4 w-4 shrink-0" aria-hidden="true" />}
        </button>
      </div>

      <nav
        id="planner-mobile-nav"
        className={`${mobileMenuOpen ? "mt-2 grid" : "hidden"} max-h-[55vh] gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 sm:mt-4 sm:flex sm:max-h-none sm:flex-wrap sm:overflow-visible sm:border-0 sm:bg-transparent sm:p-0`}
      >
        {NAV_ITEMS.map((item) => {
          const href =
            "section" in item
              ? `${baseHref}?section=${encodeURIComponent(item.section)}`
              : `${baseHref}${item.href}`;
          const isActive = item.key === active;
          const Icon = item.icon;

          return (
            <Link
              key={item.key}
              href={href}
              onClick={(event) => {
                if ("href" in item && item.href === "/print") confirmLeave(event);
                if (!event.defaultPrevented) setMobileMenuOpen(false);
              }}
              className={`inline-flex h-10 items-center justify-start gap-2 rounded-lg border px-4 text-sm font-bold no-underline transition sm:justify-center ${
                isActive
                  ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
                  : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
              }`}
              title={item.label}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
