// app/[locale]/(app)/tools/page.tsx"use client";
"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

type ToolBadge = "NEW" | "POPULAR" | "BETA" | "PREMIUM";

type Tool = {
  id: string;
  href: string;
  badge?: ToolBadge;
};

const premiumTools: Tool[] = [
  {
    id: "assignmentGenerator",
    href: "/producer/texts/new",
    badge: "PREMIUM",
  },
  {
    id: "readingTestGenerator",
    href: "/producer/reading-tests/new",
    badge: "PREMIUM",
  },
];

const tools: Tool[] = [
  { id: "translate", href: "/tools/translate", badge: "POPULAR" },
  { id: "generator", href: "/tools/generator", badge: "NEW" },
  { id: "vocab", href: "/tools/vocab", badge: "BETA" },
  { id: "sentenceFixer", href: "/tools/sentence-fixer", badge: "NEW" },
  { id: "speakingTopic", href: "/tools/speaking-topic", badge: "NEW" },
];

function badgeClass(badge?: ToolBadge) {
  if (badge === "PREMIUM") return "bg-sky-600 text-white";
  if (badge === "NEW") return "bg-slate-900 text-white";
  if (badge === "POPULAR") return "border border-amber-200 bg-amber-50 text-amber-800";
  if (badge === "BETA") return "border border-indigo-200 bg-indigo-50 text-indigo-700";
  return "bg-slate-100 text-slate-700";
}

export default function ToolsPage() {
  const locale = useLocale();
  const t = useTranslations("tools.page");

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <section className="mb-10">
        <h1 className="text-3xl font-black tracking-tight text-slate-900">
          {t("title")}
        </h1>

        <p className="mt-2 text-sm text-slate-600">{t("subtitle")}</p>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-xl font-bold text-slate-900">
          {t("premium.title")}
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {premiumTools.map((tool) => (
            <Link
              key={tool.id}
              href={`/${locale}${tool.href}`}
              className="group relative flex min-h-[190px] flex-col justify-between rounded-2xl border border-sky-300 bg-sky-100 p-6 no-underline hover:no-underline shadow-sm transition-all duration-200 hover:border-sky-400 hover:bg-sky-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-sky-300"
            >
              <div className="absolute left-0 top-0 h-1 w-full rounded-t-2xl bg-sky-500" />

              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-bold text-slate-900 no-underline">
                  {t(`premium.items.${tool.id}.title`)}
                </h3>

                {tool.badge && (
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ${badgeClass(
                      tool.badge
                    )}`}
                  >
                    {t(`badges.${tool.badge}`)}
                  </span>
                )}
              </div>

              <p className="mt-3 text-base text-slate-600">
                {t(`premium.items.${tool.id}.description`)}
              </p>

              <div className="mt-6 text-sm font-semibold text-slate-900 no-underline">
                {t("open")}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tools.map((tool) => (
          <Link
            key={tool.id}
            href={`/${locale}${tool.href}`}
            className="group relative flex min-h-[180px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 no-underline hover:no-underline shadow-sm transition-all duration-100 hover:border-sky-200 hover:bg-sky-100 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-sky-200"
          >
            <div className="absolute left-0 top-0 h-1 w-full rounded-t-2xl bg-transparent transition group-hover:bg-sky-400" />

            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900 no-underline">
                {t(`items.${tool.id}.title`)}
              </h2>

              {tool.badge && (
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ${badgeClass(
                    tool.badge
                  )}`}
                >
                  {t(`badges.${tool.badge}`)}
                </span>
              )}
            </div>

            <p className="mt-3 text-base text-slate-600">
              {t(`items.${tool.id}.description`)}
            </p>

            <div className="mt-6 text-sm font-semibold text-slate-800 no-underline">
              {t("open")}
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}