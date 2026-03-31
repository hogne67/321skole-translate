"use client";

import { useEffect, useState } from "react";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { DashboardIntro } from "@/components/DashboardIntro";
import UsageCard from "@/components/UsageCard";
import { useUsage } from "@/lib/useUsage";
import { getBucketLimit, type PlanKey } from "@/lib/featureAccess";
import { useUserProfile } from "@/lib/useUserProfile";
import { useTranslations } from "next-intl";

function safePlan(plan?: string): PlanKey {
  if (plan === "basic") return "basic";
  if (plan === "plus") return "plus";
  if (plan === "pro") return "pro";
  return "free";
}

export default function ParentPage() {
  const t = useTranslations("dashboardPage");
  const { profile } = useUserProfile();

  const [isAnon, setIsAnon] = useState(true);
  const [uid, setUid] = useState<string | undefined>(undefined);

  const { usage, loading } = useUsage(uid);

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
  const role = "parent" as const;

  const generatorsUsed = usage["premium_generators"] ?? 0;
  const generatorsLimit = getBucketLimit(role, plan, "premium_generators");

  const feedbackUsed = usage["ai_feedback"] ?? 0;
  const feedbackLimit = getBucketLimit(role, plan, "ai_feedback");

  const imagesUsed = usage["image_generation"] ?? 0;
  const imagesLimit = getBucketLimit(role, plan, "image_generation");

  return (
    <main className="mx-auto box-border w-full max-w-5xl min-w-0 space-y-4">
      <DashboardIntro
        userIsAnon={isAnon}
        helloAnon={t("dashboardIntro.helloAnon")}
        helloUser={t.raw("dashboardIntro.helloUser")}
        guestLabel={t("dashboardIntro.guest")}
        loggedInLabel={t("dashboardIntro.loggedIn")}
        youAre={t.raw("dashboardIntro.youAre")}
        activity={t.raw("dashboardIntro.activity")}
        recommendRegister={t("dashboardIntro.recommendRegister")}
        remainingLabel={t.raw("dashboardIntro.remaining")}
        roleLabelStudent={t("dashboardIntro.roles.student")}
        roleLabelTeacher={t("dashboardIntro.roles.teacher")}
        roleLabelParent={t("dashboardIntro.roles.parent")}
        roleFallback={t("dashboardIntro.roleFallback")}
        planFree={t("dashboardIntro.plans.free")}
        planBasic={t("dashboardIntro.plans.basic")}
        planPlus={t("dashboardIntro.plans.plus")}
        planPro={t("dashboardIntro.plans.pro")}
        actionSeePlans={t("dashboardIntro.actions.seePlans")}
        actionRegisterLogin={t("dashboardIntro.actions.registerLogin")}
        actionOpenLibrary={t("dashboardIntro.actions.openLibrary")}
      />

      {!loading && (
        <section className="box-border w-full min-w-0 max-w-full rounded-2xl border border-slate-300 bg-slate-200 p-4 shadow-md sm:p-5">
          <div className="mb-4 min-w-0">
            <div className="text-base font-semibold text-slate-900">
              {t("usage.title")}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {t("usage.subtitle")}
            </div>
          </div>

          <div className="grid min-w-0 gap-3">
            <UsageCard
              title={t("usage.cards.premiumGenerators")}
              used={generatorsUsed}
              limit={generatorsLimit}
              unlimitedLabel={t("usage.labels.unlimited")}
              usedLabel={t.raw("usage.labels.used")}
              remainingLabel={t.raw("usage.labels.remaining")}
              nearLimitLabel={t("usage.labels.nearLimit")}
              seePlansLabel={t("usage.labels.seePlans")}
              limitReachedLabel={t("usage.labels.limitReached")}
              upgradeLabel={t("usage.labels.upgrade")}
            />

            <UsageCard
              title={t("usage.cards.aiFeedback")}
              used={feedbackUsed}
              limit={feedbackLimit}
              unlimitedLabel={t("usage.labels.unlimited")}
              usedLabel={t.raw("usage.labels.used")}
              remainingLabel={t.raw("usage.labels.remaining")}
              nearLimitLabel={t("usage.labels.nearLimit")}
              seePlansLabel={t("usage.labels.seePlans")}
              limitReachedLabel={t("usage.labels.limitReached")}
              upgradeLabel={t("usage.labels.upgrade")}
            />

            <UsageCard
              title={t("usage.cards.imageGeneration")}
              used={imagesUsed}
              limit={imagesLimit}
              unlimitedLabel={t("usage.labels.unlimited")}
              usedLabel={t.raw("usage.labels.used")}
              remainingLabel={t.raw("usage.labels.remaining")}
              nearLimitLabel={t("usage.labels.nearLimit")}
              seePlansLabel={t("usage.labels.seePlans")}
              limitReachedLabel={t("usage.labels.limitReached")}
              upgradeLabel={t("usage.labels.upgrade")}
            />
          </div>
        </section>
      )}
    </main>
  );
}