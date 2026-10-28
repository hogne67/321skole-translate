"use client";
import { useLocale, useTranslations } from "next-intl";
import type { SchoolStatistics } from "@/lib/schools/server/aggregateStatistics";

export default function SchoolStatisticsCards({ statistics, teachers }: { statistics?: SchoolStatistics; teachers: number }) {
  const t = useTranslations("schoolAdmin.aggregate");
  const locale = useLocale();
  const range = statistics?.submissions.countRange;
  const period = statistics?.submissions.period;
  const month = period ? new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period}-01T12:00:00Z`)) : "—";
  const metrics = [
    { label: t("teachers"), value: String(teachers), help: t("current") },
    { label: t("spaces"), value: String(statistics?.totalSpaceCount ?? "—"), help: t("current") },
    { label: t("activities"), value: String(statistics?.totalActivityCount ?? "—"), help: t("current") },
    { label: t("submissions"), value: range ? `${range.minimum}–${range.maximum}` : "—", help: range ? month : t("suppressed") },
  ];
  return <section className="rounded-lg border border-slate-200 bg-white p-5">
    <h2 className="text-xl font-semibold">{t("title")}</h2>
    <p className="mt-2 text-slate-600">{t("description")}</p>
    <p className="mt-2 text-sm text-slate-600">{t("period", { month })}</p>
    <dl className="mt-4 grid gap-4 sm:grid-cols-2">
      {metrics.map(metric => <div key={metric.label} className="rounded-lg border border-slate-200 p-4">
        <dt className="font-medium">{metric.label}</dt>
        <dd className="mt-1 text-2xl font-semibold">{metric.value}</dd>
        <dd className="mt-1 text-sm text-slate-600">{metric.help}</dd>
      </div>)}
    </dl>
  </section>;
}
