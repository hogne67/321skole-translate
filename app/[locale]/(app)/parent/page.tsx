"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { DashboardIntro } from "@/components/DashboardIntro";
import { useUsage } from "@/lib/useUsage";
import {
  getBucketLimit,
  getEffectivePlan,
  type BillingSnapshot,
  type PlanKey,
} from "@/lib/featureAccess";
import { useUserProfile } from "@/lib/useUserProfile";
import { useLocale, useTranslations } from "next-intl";

function safePlan(plan?: string): PlanKey {
  if (plan === "basic") return "basic";
  if (plan === "plus") return "plus";
  if (plan === "pro") return "pro";
  return "free";
}

function getBillingSnapshot(profile: unknown): BillingSnapshot | null {
  if (!profile || typeof profile !== "object") return null;

  const p = profile as Record<string, unknown>;
  const billing = p.billing;

  if (!billing || typeof billing !== "object") return null;

  const b = billing as Record<string, unknown>;

  return {
    plan: typeof b.plan === "string" ? b.plan : null,
    status: typeof b.status === "string" ? b.status : null,
  };
}

function percent(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
}

function getProgressTone(used: number, limit: number): {
  badgeBg: string;
  badgeColor: string;
  badgeBorder: string;
  fill: string;
} {
  const p = percent(used, limit);

  if (p >= 100) {
    return {
      badgeBg: "#fef2f2",
      badgeColor: "#b91c1c",
      badgeBorder: "#fecaca",
      fill: "#dc2626",
    };
  }

  if (p >= 85) {
    return {
      badgeBg: "#fff7ed",
      badgeColor: "#c2410c",
      badgeBorder: "#fdba74",
      fill: "#f97316",
    };
  }

  if (p >= 60) {
    return {
      badgeBg: "#fffbeb",
      badgeColor: "#a16207",
      badgeBorder: "#fde68a",
      fill: "#eab308",
    };
  }

  return {
    badgeBg: "#ecfdf5",
    badgeColor: "#047857",
    badgeBorder: "#a7f3d0",
    fill: "#10b981",
  };
}

function getBillingTone(status?: string | null): {
  bg: string;
  color: string;
  border: string;
} {
  const value = (status ?? "").toLowerCase();

  if (value === "active") {
    return {
      bg: "#ecfdf5",
      color: "#047857",
      border: "#a7f3d0",
    };
  }

  if (value === "trialing") {
    return {
      bg: "#eff6ff",
      color: "#1d4ed8",
      border: "#bfdbfe",
    };
  }

  if (value === "past_due" || value === "unpaid" || value === "incomplete") {
    return {
      bg: "#fff7ed",
      color: "#c2410c",
      border: "#fdba74",
    };
  }

  return {
    bg: "#f8fafc",
    color: "#475569",
    border: "#cbd5e1",
  };
}

function formatPlanLabel(
  plan: string | null | undefined,
  t: ReturnType<typeof useTranslations>
): string {
  const value = (plan ?? "free").toLowerCase();

  if (value === "basic") return t("billing.plans.basic");
  if (value === "plus") return t("billing.plans.plus");
  if (value === "pro") return t("billing.plans.pro");
  return t("billing.plans.free");
}

function formatBillingStatus(
  status: string | null | undefined,
  t: ReturnType<typeof useTranslations>
): string {
  const value = (status ?? "").toLowerCase();

  if (value === "active") return t("billing.statuses.active");
  if (value === "trialing") return t("billing.statuses.trialing");
  if (value === "past_due") return t("billing.statuses.pastDue");
  if (value === "canceled") return t("billing.statuses.canceled");
  if (value === "incomplete") return t("billing.statuses.incomplete");
  if (value === "unpaid") return t("billing.statuses.unpaid");
  return t("billing.statuses.none");
}

type StatCardProps = {
  title: string;
  used: number;
  limit: number;
  accent?: "blue" | "emerald" | "violet" | "slate";
  t: ReturnType<typeof useTranslations>;
};

function StatCard({ title, used, limit, accent = "slate", t }: StatCardProps) {
  const p = percent(used, limit);
  const tone = getProgressTone(used, limit);

  const topGlow =
    accent === "blue"
      ? "linear-gradient(135deg, rgba(59,130,246,0.14), rgba(147,197,253,0.04))"
      : accent === "emerald"
        ? "linear-gradient(135deg, rgba(16,185,129,0.14), rgba(110,231,183,0.04))"
        : accent === "violet"
          ? "linear-gradient(135deg, rgba(139,92,246,0.14), rgba(196,181,253,0.04))"
          : "linear-gradient(135deg, rgba(148,163,184,0.14), rgba(226,232,240,0.04))";

  function getStatusText(usedValue: number, limitValue: number): string {
    if (limitValue <= 0) return t("status.unavailable");
    const value = percent(usedValue, limitValue);
    if (value >= 100) return t("status.limitReached");
    if (value >= 85) return t("status.almostFull");
    if (value >= 60) return t("status.gettingBusy");
    return t("status.good");
  }

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        border: "1px solid #e5e7eb",
        borderRadius: 18,
        background: "#ffffff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        padding: 16,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: topGlow,
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative" }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{title}</div>

          <span
            style={{
              borderRadius: 999,
              padding: "5px 9px",
              fontSize: 12,
              fontWeight: 700,
              background: tone.badgeBg,
              color: tone.badgeColor,
              border: `1px solid ${tone.badgeBorder}`,
            }}
          >
            {getStatusText(used, limit)}
          </span>
        </div>

        <div
          style={{
            marginTop: 14,
            display: "flex",
            alignItems: "end",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 800, color: "#111827", lineHeight: 1 }}>
            {used}
            <span style={{ fontSize: 16, fontWeight: 600, color: "#64748b", marginLeft: 6 }}>
              / {limit}
            </span>
          </div>

          <div style={{ fontSize: 12, color: "#64748b" }}>
            {t("stats.percentUsed", { percent: p })}
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            height: 10,
            borderRadius: 999,
            background: "#eef2f7",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${p}%`,
              height: "100%",
              borderRadius: 999,
              background: tone.fill,
              transition: "width 200ms ease",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function ParentPage() {
  const locale = useLocale();
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

  const billing = getBillingSnapshot(profile);
  const effectivePlan = getEffectivePlan({
    plan: safePlan(planValue),
    billing,
  });

  const rawBillingPlan = billing?.plan ?? planValue ?? null;
  const rawBillingStatus = billing?.status ?? null;

  const billingPlanLabel = formatPlanLabel(rawBillingPlan, t);
  const effectivePlanLabel = formatPlanLabel(effectivePlan, t);
  const billingStatusLabel = formatBillingStatus(rawBillingStatus, t);
  const billingTone = getBillingTone(rawBillingStatus);

  const hasActiveSubscription =
    rawBillingStatus === "active" || rawBillingStatus === "trialing";

  const role = "parent" as const;

  const generatorsUsed = usage["premium_generators"] ?? 0;
  const generatorsLimit = getBucketLimit(role, effectivePlan, "premium_generators");

  const feedbackUsed = usage["ai_feedback"] ?? 0;
  const feedbackLimit = getBucketLimit(role, effectivePlan, "ai_feedback");

  const imagesUsed = usage["image_generation"] ?? 0;
  const imagesLimit = getBucketLimit(role, effectivePlan, "image_generation");

  const downloadsUsed = usage["downloads"] ?? 0;
  const downloadsLimit = getBucketLimit(role, effectivePlan, "downloads");

  return (
    <main
      style={{
        maxWidth: 1120,
        margin: "0 auto",
        padding: "12px 12px 20px",
        boxSizing: "border-box",
        width: "100%",
      }}
    >
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

      <section
        style={{
          marginTop: 20,
          border: "1px solid #cbd5e1",
          borderRadius: 22,
          background: "#f8fafc",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 16 }}>
          <div
            style={{
              border: "1px solid #dbeafe",
              borderRadius: 18,
              background:
                "linear-gradient(180deg, rgba(239,246,255,0.92) 0%, rgba(255,255,255,1) 120px)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              padding: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 14,
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div style={{ minWidth: 0, flex: "1 1 420px" }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    border: "1px solid #bfdbfe",
                    background: "#eff6ff",
                    color: "#1d4ed8",
                    borderRadius: 999,
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {t("billing.badge")}
                </div>

                <h2
                  style={{
                    margin: "10px 0 0",
                    fontSize: 24,
                    fontWeight: 800,
                    color: "#0f172a",
                    lineHeight: 1.15,
                  }}
                >
                  {t("billing.title")}
                </h2>

                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: 14,
                    color: "#475569",
                    maxWidth: 720,
                    lineHeight: 1.5,
                  }}
                >
                  {t("billing.description")}
                </p>
              </div>

              <span
                style={{
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  background: billingTone.bg,
                  color: billingTone.color,
                  border: `1px solid ${billingTone.border}`,
                }}
              >
                {billingStatusLabel}
              </span>
            </div>

            <div
              style={{
                marginTop: 16,
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              }}
            >
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  background: "#ffffff",
                  padding: 14,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>
                  {t("billing.fields.plan")}
                </div>
                <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800, color: "#111827" }}>
                  {billingPlanLabel}
                </div>
              </div>

              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  background: "#ffffff",
                  padding: 14,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>
                  {t("billing.fields.usagePlan")}
                </div>
                <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800, color: "#111827" }}>
                  {effectivePlanLabel}
                </div>
              </div>

              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  background: "#ffffff",
                  padding: 14,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>
                  {t("billing.fields.role")}
                </div>
                <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800, color: "#111827" }}>
                  {t("billing.fields.parentRole")}
                </div>
              </div>

              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  background: "#ffffff",
                  padding: 14,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>
                  {t("billing.fields.status")}
                </div>
                <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800, color: "#111827" }}>
                  {billingStatusLabel}
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                border: `1px solid ${billingTone.border}`,
                background: billingTone.bg,
                color: billingTone.color,
                borderRadius: 16,
                padding: "14px 16px",
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              {hasActiveSubscription
                ? t("billing.messages.activeSubscription")
                : t("billing.messages.noSubscription")}
            </div>

            <div
              style={{
                marginTop: 16,
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <Link
                href={`/${locale}/pricing`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                  padding: "10px 14px",
                  fontSize: 14,
                  fontWeight: 700,
                  textDecoration: "none",
                  background: "#2563eb",
                  color: "#ffffff",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                }}
              >
                {t("billing.actions.seePlans")}
              </Link>

              <Link
                href={`/${locale}/account/billing`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                  padding: "10px 14px",
                  fontSize: 14,
                  fontWeight: 700,
                  textDecoration: "none",
                  background: "#ffffff",
                  color: "#0f172a",
                  border: "1px solid #cbd5e1",
                }}
              >
                {t("billing.actions.manage")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {!loading && (
        <section
          style={{
            marginTop: 20,
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          <StatCard
            title={t("usage.cards.premiumGenerators")}
            used={generatorsUsed}
            limit={generatorsLimit}
            accent="violet"
            t={t}
          />

          <StatCard
            title={t("usage.cards.aiFeedback")}
            used={feedbackUsed}
            limit={feedbackLimit}
            accent="slate"
            t={t}
          />

          <StatCard
            title={t("usage.cards.imageGeneration")}
            used={imagesUsed}
            limit={imagesLimit}
            accent="emerald"
            t={t}
          />
          <StatCard
            title={t("usage.cards.downloads")}
            used={downloadsUsed}
            limit={downloadsLimit}
            accent="blue"
            t={t}
          />
        </section>
      )}
    </main>
  );
}