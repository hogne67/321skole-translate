"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

export default function DashboardCoursesSection({ manage = false }: { manage?: boolean }) {
  const locale = useLocale();
  const t = useTranslations("academy.dashboardEntry");
  const linkStyle = "inline-flex min-h-10 items-center justify-center rounded-lg border px-4 py-2 text-sm font-bold no-underline";
  return <section className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50/70 p-5">
    <h2 className="m-0 text-xl font-black text-slate-950">{t("title")}</h2>
    <p className="mb-4 mt-2 text-sm text-slate-600">{t("intro")}</p>
    <div className="flex flex-wrap gap-2">
      {manage ? <Link href={`/${locale}/teacher/courses`} className={`${linkStyle} border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800`}>{t("manage")}</Link> : null}
      <Link href={`/${locale}/academy/courses`} className={`${linkStyle} border-slate-300 bg-white text-slate-900 hover:bg-slate-50`}>{t("attending")}</Link>
      <Link href={`/${locale}/academy/courses/marketplace`} className={`${linkStyle} border-slate-300 bg-white text-slate-900 hover:bg-slate-50`}>{t("browse")}</Link>
    </div>
  </section>;
}
