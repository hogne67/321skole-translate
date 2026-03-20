// app/[locale]/(app)/parent/page.tsx
"use client";

import { useEffect, useState } from "react";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { DashboardIntro } from "@/components/DashboardIntro";
import UsageCard from "@/components/UsageCard";
import { useUsage } from "@/lib/useUsage";
import { getBucketLimit, type PlanKey } from "@/lib/featureAccess";
import { useUserProfile } from "@/lib/useUserProfile";

function safePlan(plan?: string): PlanKey {
  if (plan === "basic") return "basic";
  if (plan === "plus") return "plus";
  if (plan === "pro") return "pro";
  return "free";
}

export default function ParentPage() {
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
      }
    };

    run();

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
    <main style={{ maxWidth: 1100, margin: "14px auto", padding: 12 }}>
      <DashboardIntro userIsAnon={isAnon} />

      {!loading && (
        <div style={{ marginTop: 20 }}>
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
    </main>
  );
}