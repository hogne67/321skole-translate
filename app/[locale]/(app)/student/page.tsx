// app/[locale]/(app)/student/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { DashboardIntro } from "@/components/DashboardIntro";
import UsageCard from "@/components/UsageCard";
import { getBucketLimit, type PlanKey } from "@/lib/featureAccess";
import { useUsage } from "@/lib/useUsage";
import { useUserProfile } from "@/lib/useUserProfile";
import { useLocale, useTranslations } from "next-intl";

function safePlan(plan?: string): PlanKey {
  if (plan === "basic") return "basic";
  if (plan === "plus") return "plus";
  if (plan === "pro") return "pro";
  return "free";
}

export default function StudentDashboard() {
  const locale = useLocale();
  const t = useTranslations("student.dashboard");

  const { profile } = useUserProfile();

  const [isAnon, setIsAnon] = useState(true);
  const [uid, setUid] = useState<string | undefined>(undefined);

  const { usage, loading: usageLoading } = useUsage(uid);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        const user = await ensureAnonymousUser();
        if (!alive) return;

        setIsAnon(Boolean(user.isAnonymous));
        setUid(user.uid);
      } catch {
        if (!alive) return;
        setIsAnon(true);
        setUid(undefined);
      }
    };

    void run();

    return () => {
      alive = false;
    };
  }, []);

  const planValue =
    profile && typeof profile === "object" && "plan" in profile
      ? (profile as { plan?: string }).plan
      : undefined;

  const plan = safePlan(planValue);
  const role = "student" as const;

  const generatorsUsed = usage["premium_generators"] ?? 0;
  const generatorsLimit = getBucketLimit(role, plan, "premium_generators");

  const feedbackUsed = usage["ai_feedback"] ?? 0;
  const feedbackLimit = getBucketLimit(role, plan, "ai_feedback");

  const imagesUsed = usage["image_generation"] ?? 0;
  const imagesLimit = getBucketLimit(role, plan, "image_generation");

  return (
    <main className="mx-auto box-border w-full max-w-5xl min-w-0 space-y-4">
      <DashboardIntro userIsAnon={isAnon} />

      {!usageLoading && (
        <section className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-200 p-4 shadow-md sm:p-5">
          <div className="mb-4 min-w-0">
            <div className="text-base font-semibold text-slate-900">
              {t.has("usage.title") ? t("usage.title") : "Usage"}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {t.has("usage.subtitle")
                ? t("usage.subtitle")
                : "See how much you have used this month."}
            </div>
          </div>

          <div className="grid min-w-0 gap-3">
            <UsageCard
              title="Premium generators"
              used={generatorsUsed}
              limit={generatorsLimit}
            />

            <UsageCard
              title="AI feedback"
              used={feedbackUsed}
              limit={feedbackLimit}
            />

            <UsageCard
              title="Image generation"
              used={imagesUsed}
              limit={imagesLimit}
            />
          </div>
        </section>
      )}

      <section className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-100 p-4 shadow-md sm:p-5">
        <h2 className="text-base font-extrabold text-slate-900">
          {t.has("quickLinks.title") ? t("quickLinks.title") : "Quick links"}
        </h2>

        <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
          <Link
            href={`/${locale}/321lessons`}
            className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-800 no-underline hover:bg-slate-50"
          >
            {t.has("quickLinks.library") ? t("quickLinks.library") : "Open library"}
          </Link>

          <Link
            href={`/${locale}/student/content`}
            className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-800 no-underline hover:bg-slate-50"
          >
            {t.has("quickLinks.myContent") ? t("quickLinks.myContent") : "My content"}
          </Link>
        </div>
      </section>
    </main>
  );
}