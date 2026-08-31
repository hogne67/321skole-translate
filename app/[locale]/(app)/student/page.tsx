// app\[locale]\(app)\student\page.tsx
"use client";

import Link from "next/link";
import { ensureAnonymousUser } from "@/lib/anonAuth";
import { useEffect, useState } from "react";
import { DashboardIntro } from "@/components/DashboardIntro";
import { DashboardShortcutRow } from "@/components/DashboardShortcutRow";
import DashboardInfoLinks from "@/components/DashboardInfoLinks";
import LaunchCampaignBanner from "@/components/LaunchCampaignBanner";
import { QuizDashboardSection } from "@/components/QuizDashboardSection";
import InstallAppButton from "@/components/pwa/InstallAppButton";
import { db } from "@/lib/firebase";
import {
  getBucketLimit,
  getEffectivePlan,
  type BillingSnapshot,
  type PlanKey,
} from "@/lib/featureAccess";
import { useUsage } from "@/lib/useUsage";
import { useUserProfile } from "@/lib/useUserProfile";
import { useLocale, useTranslations } from "next-intl";
import {
  getStudentDashboardStats,
  type SubmissionDashboardStats,
} from "@/lib/dashboardSubmissionStats";

const showStudentLaunchCampaign = false;
const showStudentQuizSection = false;
const showStudentCoursesSection = false;

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

function emptyStats(): SubmissionDashboardStats {
  return {
    total: 0,
    draft: 0,
    submitted: 0,
    needsWork: 0,
    approved: 0,
    other: 0,
  };
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

function StatusCard({
  title,
  value,
  href,
  tone = "neutral",
}: {
  title: string;
  value: number;
  href: string;
  tone?: "warning" | "info" | "success" | "neutral";
}) {
  const style =
    tone === "warning"
      ? {
        bg: "rgba(245,158,11,0.12)",
        border: "rgba(245,158,11,0.35)",
        color: "rgba(180,83,9,1)",
        badgeBg: "rgba(245,158,11,1)",
      }
      : tone === "info"
        ? {
          bg: "rgba(59,130,246,0.12)",
          border: "rgba(59,130,246,0.35)",
          color: "rgba(37,99,235,1)",
          badgeBg: "rgba(59,130,246,1)",
        }
        : tone === "success"
          ? {
            bg: "rgba(16,185,129,0.12)",
            border: "rgba(16,185,129,0.35)",
            color: "rgba(5,150,105,1)",
            badgeBg: "rgba(16,185,129,1)",
          }
          : {
            bg: "rgba(148,163,184,0.12)",
            border: "rgba(148,163,184,0.35)",
            color: "rgba(51,65,85,1)",
            badgeBg: "rgba(100,116,139,1)",
          };

  return (
    <Link
      href={href}
      style={{
        display: "block",
        textDecoration: "none",
        borderRadius: 16,
        padding: 14,
        background: style.bg,
        border: `1px solid ${style.border}`,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        transition: "transform 120ms ease, box-shadow 120ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)";
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div style={{ fontSize: 13, fontWeight: 700, color: style.color }}>{title}</div>

        {value > 0 ? (
          <span
            style={{
              minWidth: 24,
              height: 24,
              padding: "0 8px",
              borderRadius: 999,
              background: style.badgeBg,
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 800,
              lineHeight: 1,
              boxShadow: "0 1px 3px rgba(0,0,0,0.14)",
              flexShrink: 0,
            }}
          >
            {value}
          </span>
        ) : null}
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 30,
          fontWeight: 800,
          color: "#111827",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </Link>
  );
}

export default function StudentDashboard() {
  const locale = useLocale();
  const t = useTranslations("dashboard");

  const { profile } = useUserProfile();

  const [isAnon, setIsAnon] = useState(true);
  const [uid, setUid] = useState<string | undefined>(undefined);

  const [statsLoading, setStatsLoading] = useState(true);
  const [hasSpaces, setHasSpaces] = useState(false);
  const [spaceCount, setSpaceCount] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [submissionStats, setSubmissionStats] =
    useState<SubmissionDashboardStats>(emptyStats());

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

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 720);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      if (!uid || !db) {
        if (!cancelled) {
          setSubmissionStats(emptyStats());
          setHasSpaces(false);
          setSpaceCount(0);
          setStatsLoading(false);
        }
        return;
      }

      try {
        setStatsLoading(true);
        const result = await getStudentDashboardStats(db, uid);

        if (!cancelled) {
          setSubmissionStats(result.stats);
          setHasSpaces(result.hasSpaces);
          setSpaceCount(result.spaceCount);
        }
      } catch (error) {
        console.error("Failed to load student dashboard stats", error);
        if (!cancelled) {
          setSubmissionStats(emptyStats());
          setHasSpaces(false);
          setSpaceCount(0);
        }
      } finally {
        if (!cancelled) {
          setStatsLoading(false);
        }
      }
    }

    void loadStats();

    return () => {
      cancelled = true;
    };
  }, [uid]);

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
    role: t("billing.fields.studentRole"),
    status: billingStatusLabel,
  });

  const hasActivePartnerAccess =
    profile?.partnerAccess === true && profile?.partnerStatus === "active";

  const role = "student" as const;

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

  const sectionCardBlueStyle: React.CSSProperties = {
    ...sectionCardStyle,
    border: "1px solid #dbeafe",
  };

  return (
    <main style={dashboardShellStyle}>
      <DashboardIntro
        userIsAnon={isAnon}
        helloAnon={t("dashboardIntro.helloAnon")}
        helloUser={t.raw("dashboardIntro.helloUser")}
        guestLabel={t("dashboardIntro.guest")}
        loggedInLabel={t("dashboardIntro.loggedIn")}
        youAre={t.raw("dashboardIntro.youAre")}
        youAreAnon={t.raw("dashboardIntro.youAreAnon")}
        activity={isAnon ? t.raw("dashboardIntro.activity") : ""}
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

      <InstallAppButton />

      {isAnon ? (
        <section
          style={{
            marginTop: isMobile ? 16 : 18,
            border: "1px solid #bfdbfe",
            borderRadius: isMobile ? 16 : 18,
            background: "linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            padding: isMobile ? 12 : 16,
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 14,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ minWidth: 0, flex: "1 1 420px" }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 850,
                  color: "#0f172a",
                  lineHeight: 1.2,
                }}
              >
                {t("anonymousCreate.title")}
              </h2>
              <p
                style={{
                  margin: "7px 0 0",
                  color: "#334155",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                {t("anonymousCreate.body")}
              </p>

              <div
                style={{
                  marginTop: 10,
                  border: "1px solid #bbf7d0",
                  borderRadius: 12,
                  background: "#f0fdf4",
                  color: "#14532d",
                  padding: "9px 10px",
                  fontSize: 13,
                  lineHeight: 1.45,
                  fontWeight: 700,
                }}
              >
                {t("anonymousCreate.draftNotice")}{" "}
                <Link
                  href={`/${locale}/student/spaces`}
                  style={{
                    color: "#047857",
                    fontWeight: 900,
                    textDecoration: "underline",
                    textUnderlineOffset: 2,
                  }}
                >
                  {t("anonymousCreate.draftNoticeLink")}
                </Link>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <Link
                href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/tools`)}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                  padding: "10px 14px",
                  fontSize: 14,
                  fontWeight: 800,
                  textDecoration: "none",
                  background: "#2563eb",
                  color: "#ffffff",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                }}
              >
                {t("anonymousCreate.login")}
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
                  fontWeight: 800,
                  textDecoration: "none",
                  background: "#ffffff",
                  color: "#0f172a",
                  border: "1px solid #cbd5e1",
                }}
              >
                {t("anonymousCreate.library")}
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <section style={shortcutSectionStyle}>
        {showStudentLaunchCampaign ? (
          <LaunchCampaignBanner locale={locale} href={`/${locale}/account/billing`} />
        ) : null}

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
          href={`/${locale}/account/billing`}
          actionLabel={t("billing.actions.open")}
        />
      </section>

      {!usageLoading && (
        <section
          style={statGridStyle}
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

      {!statsLoading && (
        <section style={dashboardSectionStyle}>
          <div style={sectionInsetStyle}>
            <div style={sectionCardBlueStyle}>
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
                    {t("submissions.badge")}
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
                    {hasSpaces ? t("submissions.title") : t("submissions.noClassTitle")}
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
                    {hasSpaces
                      ? t("submissions.description")
                      : t("submissions.noClassText")}
                  </p>
                </div>

                {hasSpaces && (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                      color: "#334155",
                      borderRadius: 999,
                      padding: "8px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {t("submissions.spacesLabel")}: {spaceCount}
                  </div>
                )}
              </div>

              {hasSpaces ? (
                <>
                  <div
                    style={{
                      marginTop: 16,
                      display: "grid",
                      gap: 12,
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    }}
                  >
                    <StatusCard
                      title={t("submissions.todo")}
                      value={submissionStats.draft}
                      href={`/${locale}/student/spaces`}
                      tone="neutral"
                    />
                    <StatusCard
                      title={t("submissions.submitted")}
                      value={submissionStats.submitted}
                      href={`/${locale}/student/spaces`}
                      tone="info"
                    />
                    <StatusCard
                      title={t("submissions.needsWork")}
                      value={submissionStats.needsWork}
                      href={`/${locale}/student/spaces`}
                      tone="warning"
                    />
                    <StatusCard
                      title={t("submissions.approved")}
                      value={submissionStats.approved}
                      href={`/${locale}/student/spaces`}
                      tone="success"
                    />
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <Link
                      href={`/${locale}/student/spaces`}
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
                      {t("submissions.actions.openSpaces")}
                    </Link>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    marginTop: 16,
                    display: "grid",
                    gap: 12,
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  }}
                >
                  <Link
                    href={`/${locale}/321lessons`}
                    style={{
                      display: "inline-flex",
                      width: "100%",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 12,
                      padding: "12px 14px",
                      fontSize: 14,
                      fontWeight: 700,
                      textDecoration: "none",
                      background: "#ffffff",
                      color: "#0f172a",
                      border: "1px solid #cbd5e1",
                    }}
                  >
                    {t("submissions.actions.library")}
                  </Link>

                  <Link
                    href={`/${locale}/student/content`}
                    style={{
                      display: "inline-flex",
                      width: "100%",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 12,
                      padding: "12px 14px",
                      fontSize: 14,
                      fontWeight: 700,
                      textDecoration: "none",
                      background: "#ffffff",
                      color: "#0f172a",
                      border: "1px solid #cbd5e1",
                    }}
                  >
                    {t("submissions.actions.myContent")}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {showStudentQuizSection ? <QuizDashboardSection locale={locale} /> : null}

      <section style={dashboardSectionStyle}>
        <div style={sectionInsetStyle}>
          <div style={sectionCardBlueStyle}>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              {t("quickLinks.title")}
            </h2>

            <div
              style={{
                marginTop: 12,
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              }}
            >
              <Link
                href={`/${locale}/321lessons`}
                style={{
                  display: "inline-flex",
                  width: "100%",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                  padding: "12px 14px",
                  fontSize: 14,
                  fontWeight: 700,
                  textDecoration: "none",
                  background: "#ffffff",
                  color: "#0f172a",
                  border: "1px solid #cbd5e1",
                }}
              >
                {t("quickLinks.library")}
              </Link>

              <Link
                href={`/${locale}/student/content`}
                style={{
                  display: "inline-flex",
                  width: "100%",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                  padding: "12px 14px",
                  fontSize: 14,
                  fontWeight: 700,
                  textDecoration: "none",
                  background: "#ffffff",
                  color: "#0f172a",
                  border: "1px solid #cbd5e1",
                }}
              >
                {t("quickLinks.myContent")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {showStudentCoursesSection ? (
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
                  href={`/${locale}/academy/courses`}
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
                  {t("academy.actions.myCourses")}
                </Link>

                <Link
                  href={`/${locale}/courses`}
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
