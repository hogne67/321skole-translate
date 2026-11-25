"use client";

import DashboardCoursesSection from "@/components/DashboardCoursesSection";
import { useEffect, useState } from "react";
import { ArrowRight, House } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { DashboardIntro } from "@/components/DashboardIntro";
import { DashboardShortcutRow } from "@/components/DashboardShortcutRow";
import { QuizDashboardSection } from "@/components/QuizDashboardSection";
import DashboardInfoLinks from "@/components/DashboardInfoLinks";
import InstallAppButton from "@/components/pwa/InstallAppButton";
import ParentFollowUp from "@/components/parent/ParentFollowUp";
import { useUsage } from "@/lib/useUsage";
import {
  getBucketLimit,
  getEffectivePlan,
  type BillingSnapshot,
  type PlanKey,
} from "@/lib/featureAccess";
import { useUserProfile } from "@/lib/useUserProfile";
import type { ParentFollowUpData } from "@/lib/parentFeedback";
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
  const { user, profile } = useUserProfile();
  const isAnon = !user || user.isAnonymous;
  const uid = user?.uid;
  const parent = user && !isAnon && profile?.role === "parent" ? user : null;
  const [followUp, setFollowUp] = useState<{ uid: string; data: ParentFollowUpData | "error" } | null>(null);
  const [retryFollowUp, setRetryFollowUp] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  const { usage, loading } = useUsage(uid);

  useEffect(() => {
    if (!parent) return;
    const account = parent;
    let controller: AbortController | null = null;
    async function refresh() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const token = await account.getIdToken();
        const response = await fetch("/api/parent/follow-up", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
          signal: request.signal,
        });
        if (!response.ok) throw new Error("Could not read follow-up.");
        const data: ParentFollowUpData = await response.json();
        if (!request.signal.aborted) setFollowUp({ uid: account.uid, data });
      } catch {
        if (!request.signal.aborted) setFollowUp({ uid: account.uid, data: "error" });
      }
    }
    void refresh();
    window.addEventListener("focus", refresh);

    return () => {
      controller?.abort();
      window.removeEventListener("focus", refresh);
    };
  }, [parent, retryFollowUp]);

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
  const parentLoginHref = `/${locale}/login?next=${encodeURIComponent(`/${locale}/parent`)}`;
  const billingHref = isAnon ? parentLoginHref : `/${locale}/account/billing`;

  const role = "parent" as const;
  const followUpData = followUp && followUp.uid === parent?.uid ? followUp.data : null;
  const needsFirstRoom = followUpData && followUpData !== "error" && followUpData.roomCount === 0;

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

  return (
    <main style={dashboardShellStyle}>
      <section className="mb-4 flex flex-col gap-5 rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-8">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-800 text-white" aria-hidden="true">
            <House size={22} />
          </span>
          <div className="min-w-0">
            <h1 className="m-0 text-3xl font-extrabold tracking-tight text-emerald-950 sm:text-4xl">{t("portal.title")}</h1>
            <p className="mb-0 mt-2 max-w-xl text-sm leading-6 text-emerald-900 sm:text-base">{t("portal.description")}</p>
          </div>
        </div>
        <Link
          href={needsFirstRoom ? "/parent/spaces/new" : "/parent/spaces"}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-emerald-800 px-5 py-3 font-bold text-white no-underline hover:bg-emerald-900 sm:self-center"
        >
          {t(needsFirstRoom ? "portal.createFirstRoom" : "portal.openRooms")}
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
      {parent ? <ParentFollowUp data={followUpData} retry={() => setRetryFollowUp((value) => value + 1)} /> : null}
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

      <DashboardInfoLinks locale={locale} />
      <DashboardCoursesSection />
    </main>
  );
}
