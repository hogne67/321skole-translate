"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

type CourseWorkspaceNavProps = {
  locale: string;
  courseId: string;
  title: string;
  status: string;
  active: "overview" | "edit" | "sessions" | "content" | "marketing" | "sales" | "participants" | "payments" | "submissions" | "messages";
};

const NAV_ITEMS = [
  { key: "overview", labelKey: "overview", href: "" },
  { key: "edit", labelKey: "edit", href: "/edit" },
  { key: "sessions", labelKey: "sessions", href: "/sessions" },
  { key: "content", labelKey: "content", section: "Content" },
  { key: "marketing", labelKey: "marketing", href: "/marketing" },
  { key: "sales", labelKey: "sales", href: "/sales" },
  { key: "participants", labelKey: "participants", section: "Participants" },
  { key: "payments", labelKey: "payments", section: "Payments" },
  { key: "submissions", labelKey: "submissions", section: "Submissions" },
  { key: "messages", labelKey: "messages", section: "Messages" },
] as const;

export function CourseWorkspaceNav({ locale, courseId, title, status, active }: CourseWorkspaceNavProps) {
  const t = useTranslations("academy");
  const baseHref = `/${locale}/teacher/courses/${courseId}`;

  return (
    <section className="sticky top-3 z-20 rounded-lg border border-sky-100 bg-sky-50/95 p-4 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 break-words text-2xl font-black text-slate-950">
            {title || t("common.untitled")}
          </h1>
          <p className="mt-2 text-sm text-slate-600">{t("workspace.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold capitalize text-slate-600">
            {status || t("common.draft")}
          </span>
          <Link
            href={`/${locale}/teacher/courses`}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
          >
            {t("workspace.backToCourses")}
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

          return (
            <Link
              key={item.key}
              href={href}
              className={`inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-bold no-underline transition ${
                isActive
                  ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
                  : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
              }`}
            >
              {t(`workspace.nav.${item.labelKey}`)}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
