"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { DashboardIntro } from "@/components/DashboardIntro";
import { DashboardShortcutRow } from "@/components/DashboardShortcutRow";
import LaunchCampaignBanner from "@/components/LaunchCampaignBanner";
import { QuizDashboardSection } from "@/components/QuizDashboardSection";
import DashboardInfoLinks from "@/components/DashboardInfoLinks";
import InstallAppButton from "@/components/pwa/InstallAppButton";
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
  const [isMobile, setIsMobile] = useState(false);

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

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 720);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const planValue =
    profile && typeof profile === "object" && "plan" in profile
      ? (profile as { plan?: string }).plan
      : undefined;

  const billing = getBillingSnapshot(profile);
  const effectivePlan = getEffectivePlan({
    plan: safePlan(planValue),
    billing,
    partnerAccess: profile?.partnerAccess === true,
    partnerStatus: profile?.partnerStatus ?? null,
    schoolId: profile?.schoolId ?? null,
    schoolRole: profile?.schoolRole ?? null,
    schoolStatus: profile?.schoolStatus ?? null,
  });

  const rawBillingPlan = billing?.plan ?? planValue ?? null;
  const rawBillingStatus = billing?.status ?? null;

  const billingPlanLabel = formatPlanLabel(rawBillingPlan, t);
  const effectivePlanLabel = formatPlanLabel(effectivePlan, t);
  const billingStatusLabel = formatBillingStatus(rawBillingStatus, t);
  const billingSummary = t("billing.summary", {
    plan: billingPlanLabel,
    effectivePlan: effectivePlanLabel,
    role: t("billing.fields.parentRole"),
    status: billingStatusLabel,
  });

  const hasActivePartnerAccess =
    profile?.partnerAccess === true && profile?.partnerStatus === "active";
  const showCoursesSection = false;
  const parentLoginHref = `/${locale}/login?next=${encodeURIComponent(`/${locale}/parent`)}`;
  const billingHref = isAnon ? parentLoginHref : `/${locale}/account/billing`;

  const role = "parent" as const;

  const generatorsUsed = usage["premium_generators"] ?? 0;
  const generatorsLimit = getBucketLimit(role, effectivePlan, "premium_generators");

  const feedbackUsed = usage["ai_feedback"] ?? 0;
  const feedbackLimit = getBucketLimit(role, effectivePlan, "ai_feedback");

  const imagesUsed = usage["image_generation"] ?? 0;
  const imagesLimit = getBucketLimit(role, effectivePlan, "image_generation");

  const downloadsUsed = usage["downloads"] ?? 0;
  const downloadsLimit = getBucketLimit(role, effectivePlan, "downloads");

  const dashboardShellStyle: React.CSSProperties = {
    maxWidth: 1120,
    margin: "0 auto",
    padding: isMobile ? "8px 6px 20px" : "12px 12px 20px",
    boxSizing: "border-box",
    width: "100%",
  };

  const shortcutSectionStyle: React.CSSProperties = {
    marginTop: isMobile ? 16 : 20,
    display: "grid",
    gap: isMobile ? 8 : 10,
  };

  const statGridStyle: React.CSSProperties = {
    marginTop: isMobile ? 16 : 20,
    display: "grid",
    gap: isMobile ? 10 : 12,
    gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))",
  };

  const dashboardSectionStyle: React.CSSProperties = {
    marginTop: isMobile ? 18 : 24,
    border: "1px solid #cbd5e1",
    borderRadius: isMobile ? 18 : 22,
    background: "#f8fafc",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    overflow: "hidden",
  };

  const sectionInsetStyle: React.CSSProperties = {
    padding: isMobile ? 8 : 16,
  };

  const sectionCardStyle: React.CSSProperties = {
    border: "1px solid #bbf7d0",
    borderRadius: isMobile ? 16 : 18,
    background: "#ffffff",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    padding: isMobile ? 12 : 16,
  };

  return (
    <main style={dashboardShellStyle}>
      <DashboardIntro
        userIsAnon={isAnon}
        guestRole="parent"
        helloAnon={t("dashboardIntro.helloAnon")}
        helloUser={t.raw("dashboardIntro.helloUser")}
        guestLabel={t("dashboardIntro.guest")}
        loggedInLabel={t("dashboardIntro.loggedIn")}
        youAre={t.raw("dashboardIntro.youAre")}
        activity=""
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
        actionRegisterHref={`/login?next=/${locale}/parent`}
        actionOpenLibrary={t("dashboardIntro.actions.openLibrary")}
      />

      <InstallAppButton />

      <section style={shortcutSectionStyle}>
        <LaunchCampaignBanner locale={locale} href={billingHref} />

        {hasActivePartnerAccess ? (
          <DashboardShortcutRow
            title={t("partnerCard.title")}
            text={t("partnerCard.text")}
            href={`/${locale}/partner`}
            actionLabel={t("billing.actions.open")}
            tone="teal"
          />
        ) : null}

        <DashboardShortcutRow
          title={t("billing.title")}
          text={billingSummary}
          href={billingHref}
          actionLabel={isAnon ? t("dashboardIntro.actions.registerLogin") : t("billing.actions.open")}
        />
      </section>

      <QuizDashboardSection locale={locale} isGuestPreview={isAnon} />

      {!isAnon && !loading ? (
        <section style={statGridStyle}>
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
      ) : null}

      {showCoursesSection ? (
      <section style={dashboardSectionStyle}>
        <div style={sectionInsetStyle}>
          <div style={sectionCardStyle}>
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
                    border: "1px solid #86efac",
                    background: "#f0fdf4",
                    color: "#166534",
                    borderRadius: 999,
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {t("academy.badge")}
                  <span
                    style={{
                      borderRadius: 999,
                      background: "#dcfce7",
                      color: "#14532d",
                      padding: "2px 7px",
                      fontSize: 11,
                      fontWeight: 800,
                      textTransform: "uppercase",
                    }}
                  >
                    {t("academy.beta")}
                  </span>
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
                  {t("academy.title")}
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
                  {t("academy.description")}
                </p>
              </div>
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
                href={isAnon ? parentLoginHref : `/${locale}/academy/courses`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                  padding: "10px 14px",
                  fontSize: 14,
                  fontWeight: 700,
                  textDecoration: "none",
                  background: "#166534",
                  color: "#ffffff",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                }}
              >
                {isAnon ? t("dashboardIntro.actions.registerLogin") : t("academy.actions.myCourses")}
              </Link>

              <Link
                href={`/${locale}/academy/courses/marketplace`}
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
                {t("academy.actions.browse")}
              </Link>
            </div>
          </div>
        </div>
      </section>
      ) : null}
      <DashboardInfoLinks locale={locale} />
    </main>
  );
}
