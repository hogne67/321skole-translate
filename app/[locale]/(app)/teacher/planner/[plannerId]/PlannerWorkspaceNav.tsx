"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { CalendarDays, Eye, FileText, Home, NotebookPen, Printer, Settings } from "lucide-react";

type ActiveKey = "overview" | "annual" | "semesters" | "periods" | "activities" | "reflections" | "print" | "settings";

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
  { key: "annual", label: "Årsplan", section: "Årsplan", icon: FileText },
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
  const baseHref = `/${locale}/teacher/planner/${plannerId}`;
  const confirmLeave = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      hasUnsavedChanges &&
      !window.confirm("Du har ulagrede endringer. Vil du gå videre uten å lagre først?")
    ) {
      event.preventDefault();
    }
  };

  return (
    <section className="sticky top-3 z-20 rounded-lg border border-sky-100 bg-sky-50/95 p-4 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 break-words text-2xl font-black text-slate-950">{title || "Uten tittel"}</h1>
          <p className="mt-2 text-sm text-slate-600">Planlegging, redigering og utskrift i ett arbeidsrom.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold capitalize text-slate-600">
            {status || "draft"}
          </span>
          <Link
            href={`/${locale}/teacher/planner`}
            onClick={confirmLeave}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
          >
            Mine planer
          </Link>
        </div>
      </div>

      <nav className="mt-4 flex flex-wrap gap-2">
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
              onClick={"href" in item && item.href === "/print" ? confirmLeave : undefined}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-bold no-underline transition ${
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
