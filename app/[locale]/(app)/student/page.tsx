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
    <main className="mx-auto w-full max-w-5xl px-4 py-3">
      <DashboardIntro userIsAnon={isAnon} />

      {!usageLoading && (
        <div className="mt-4 grid gap-3">
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
      )}

      <div className="mt-6 rounded-2xl border bg-background p-4">
        <h2 className="text-base font-extrabold text-foreground">
          {t.has("quickLinks.title") ? t("quickLinks.title") : "Quick links"}
        </h2>

        <div className="mt-3 flex flex-wrap gap-3">
          <Link
            href={`/${locale}/321lessons`}
            className="inline-flex rounded-xl border px-4 py-2 text-sm font-medium no-underline hover:bg-slate-50"
          >
            {t.has("quickLinks.library") ? t("quickLinks.library") : "Open library"}
          </Link>

          <Link
            href={`/${locale}/student/content`}
            className="inline-flex rounded-xl border px-4 py-2 text-sm font-medium no-underline hover:bg-slate-50"
          >
            {t.has("quickLinks.myContent") ? t("quickLinks.myContent") : "My content"}
          </Link>
        </div>
      </div>
    </main>
  );
}