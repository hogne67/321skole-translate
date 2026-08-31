// app/[locale]/(app)/tools/page.tsx
"use client";

import Link from "next/link";
import StudentSelfStudyPrompt from "@/components/StudentSelfStudyPrompt";
import { isSpaceOnlyStudent } from "@/lib/studentAccessMode";
import { useUserProfile } from "@/lib/useUserProfile";
import { useLocale, useTranslations } from "next-intl";

type ToolBadge = "NEW" | "POPULAR" | "BETA" | "PREMIUM";

type Tool = {
  id: string;
  href: string;
  badge?: ToolBadge;
};

const premiumTools: Tool[] = [
  { id: "quizGenerator", href: "/tools/quiz", badge: "NEW" },
  { id: "assignmentGenerator", href: "/producer/texts/new", badge: "PREMIUM" },
  { id: "writingActivityGenerator", href: "/producer/text/new", badge: "NEW" },
  { id: "imageWritingGenerator", href: "/producer/image-writing", badge: "NEW" },
  { id: "readingTestGenerator", href: "/producer/reading-tests/new", badge: "PREMIUM" },
  { id: "geometryGenerator", href: "/producer/math/geometry?new=1", badge: "NEW" },
  { id: "academyGenerator", href: "/teacher/courses/generate", badge: "PREMIUM" },
  { id: "podcastWorkshop", href: "/tools/podcast-workshop", badge: "BETA" },
];

const tools: Tool[] = [
  { id: "translate", href: "/tools/translate", badge: "POPULAR" },
  { id: "generator", href: "/tools/generator", badge: "NEW" },
  { id: "vocab", href: "/tools/vocab", badge: "NEW" },
  { id: "audioReading", href: "/tools/audio-reading", badge: "NEW" },
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
  const t = useTranslations("toolsIndex");
  const { user, profile, loading } = useUserProfile();
  const isGuestPreview = Boolean(user?.isAnonymous);
  const role = profile?.role === "student" || isGuestPreview ? "student" : profile?.role;
  const spaceOnlyStudent = role === "student" && isSpaceOnlyStudent(profile, {
    isAnonymous: isGuestPreview,
  });
  const visiblePremiumTools =
    locale === "nb"
      ? [...premiumTools, { id: "plannerGenerator", href: "/teacher/planner", badge: "PREMIUM" as const }]
      : premiumTools;

  function toolHref(href: string) {
    const localizedHref = `/${locale}${href}`;
    if (!isGuestPreview) return localizedHref;
    return `/${locale}/login?next=${encodeURIComponent(localizedHref)}`;
  }

  if (spaceOnlyStudent) {
    return <StudentSelfStudyPrompt isAnonymous={isGuestPreview} nextHref={`/${locale}/tools`} />;
  }

  if (loading) return null;

  return (
    <main className="mx-auto w-full max-w-5xl min-w-0 px-3 py-6 sm:px-4 sm:py-8">
      {/* Header */}
      <section className="mb-6">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{t("subtitle")}</p>
      </section>

      {/* Premium */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-slate-900 sm:text-xl">
          {t("premium.title")}
        </h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visiblePremiumTools.map((tool) => (
            <Link
              key={tool.id}
              href={toolHref(tool.href)}
              className="group relative flex min-h-[160px] flex-col justify-between rounded-2xl border border-sky-300 bg-sky-100 p-4 sm:p-5 no-underline shadow-sm transition-all hover:border-sky-400 hover:bg-sky-200 hover:shadow-md"
            >
              <div className="absolute left-0 top-0 h-1 w-full rounded-t-2xl bg-sky-500" />

              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-bold text-slate-900 break-words">
                  {t(`premium.items.${tool.id}.title`)}
                </h3>

                {tool.badge && (
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${badgeClass(tool.badge)}`}>
                    {t(`badges.${tool.badge}`)}
                  </span>
                )}
              </div>

              <p className="mt-2 text-sm text-slate-600 break-words">
                {t(`premium.items.${tool.id}.description`)}
              </p>

              <div className="mt-4 text-sm font-semibold text-slate-900 group-hover:text-sky-800">
                {isGuestPreview ? t("loginOpen") : t("open")}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Regular tools */}
      <section>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <Link
              key={tool.id}
              href={toolHref(tool.href)}
              className="group relative flex min-h-[150px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 no-underline shadow-sm transition-all hover:border-sky-200 hover:bg-sky-50 hover:shadow-md"
            >
              <div className="absolute left-0 top-0 h-1 w-full rounded-t-2xl bg-transparent transition group-hover:bg-sky-400" />

              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-bold text-slate-900 break-words">
                  {t(`items.${tool.id}.title`)}
                </h2>

                {tool.badge && (
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${badgeClass(tool.badge)}`}>
                    {t(`badges.${tool.badge}`)}
                  </span>
                )}
              </div>

              <p className="mt-2 text-sm text-slate-600 break-words">
                {t(`items.${tool.id}.description`)}
              </p>

              <div className="mt-4 text-sm font-semibold text-slate-800">
                {isGuestPreview ? t("loginOpen") : t("open")}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
