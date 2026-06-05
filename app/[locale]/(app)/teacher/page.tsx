// app/[locale]/(app)/teacher/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DashboardIntro } from "@/components/DashboardIntro";
import InstallAppButton from "@/components/pwa/InstallAppButton";
import { PartnerDashboardCard } from "@/components/PartnerDashboardCard";
import { db } from "@/lib/firebase";
import {
  getBucketLimit,
  getEffectivePlan,
  type AppRole,
  type BillingSnapshot,
} from "@/lib/featureAccess";
import {
  archiveStudentFromTeacherSpaces,
  getTeacherStudentCount,
  getTeacherStudentsOverview,
  type TeacherStudentOverviewItem,
} from "@/lib/teacherStudentLimit";
import { useUsage } from "@/lib/useUsage";
import { useUserProfile } from "@/lib/useUserProfile";
import {
  getTeacherDashboardStats,
  type SubmissionDashboardStats,
} from "@/lib/dashboardSubmissionStats";

function safeRole(role?: string): AppRole {
  if (role === "teacher") return "teacher";
  if (role === "student") return "student";
  if (role === "parent") return "parent";
  if (role === "creator") return "creator";
  if (role === "admin") return "admin";
  return "teacher";
}

function resolveRoleFromProfile(profile: unknown): AppRole {
  if (!profile || typeof profile !== "object") return "teacher";

  const p = profile as Record<string, unknown>;

  if (
    p.role === "teacher" ||
    p.role === "student" ||
    p.role === "parent" ||
    p.role === "creator" ||
    p.role === "admin"
  ) {
    return safeRole(p.role);
  }

  if (
    p.mode === "teacher" ||
    p.mode === "student" ||
    p.mode === "parent" ||
    p.mode === "creator" ||
    p.mode === "admin"
  ) {
    return safeRole(p.mode);
  }

  if (p.org && typeof p.org === "object") {
    const orgRole = (p.org as Record<string, unknown>).role;
    if (
      orgRole === "teacher" ||
      orgRole === "student" ||
      orgRole === "parent" ||
      orgRole === "creator" ||
      orgRole === "admin"
    ) {
      return safeRole(orgRole);
    }
  }

  if (p.roles && typeof p.roles === "object") {
    const roles = p.roles as Record<string, unknown>;
    if (roles.admin === true) return "admin";
    if (roles.teacher === true) return "teacher";
    if (roles.creator === true) return "creator";
    if (roles.parent === true) return "parent";
    if (roles.student === true) return "student";
  }

  return "teacher";
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

function withLocale(locale: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (!href.startsWith("/")) return href;

  const seg = href.split("/")[1];
  if (seg === "en" || seg === "no" || seg === "pt") return href;

  if (href === "/") return `/${locale}`;
  return `/${locale}${href}`;
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

function getRemaining(used: number, limit: number): number {
  return Math.max(0, limit - used);
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

function SmallStatusCard({
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
            bg: "#ffffff",
            border: "#e5e7eb",
            color: "#64748b",
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

export default function TeacherPage() {
  const locale = useLocale();
  const t = useTranslations("teacherPage");

  const { user, profile, loading } = useUserProfile();
  const { usage, loading: usageLoading } = useUsage(user?.uid);

  const [studentsUsed, setStudentsUsed] = useState(0);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentItems, setStudentItems] = useState<TeacherStudentOverviewItem[]>([]);
  const [studentItemsLoading, setStudentItemsLoading] = useState(true);
  const [studentSearch, setStudentSearch] = useState("");
  const [busyStudentUid, setBusyStudentUid] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [studentsOpen, setStudentsOpen] = useState(false);

  const [submissionStats, setSubmissionStats] = useState<SubmissionDashboardStats>(emptyStats());
  const [submissionStatsLoading, setSubmissionStatsLoading] = useState(true);
  const [teacherSpaceCount, setTeacherSpaceCount] = useState(0);

  const sourceProfile = profile ?? user ?? null;
  const isAnon = Boolean(user?.isAnonymous);

  const planValue =
    sourceProfile && typeof sourceProfile === "object"
      ? ((sourceProfile as { plan?: string | null }).plan ?? null)
      : null;

  const role = resolveRoleFromProfile(sourceProfile);
  const billing = getBillingSnapshot(sourceProfile);

  const effectivePlan = getEffectivePlan({
    plan: planValue,
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
  const billingTone = getBillingTone(rawBillingStatus);

  const hasActiveSubscription =
    rawBillingStatus === "active" || rawBillingStatus === "trialing";
  const hasActivePartnerAccess =
    profile?.partnerAccess === true && profile?.partnerStatus === "active";

  async function reloadStudents(currentUid?: string) {
    if (!currentUid || !db) {
      setStudentsUsed(0);
      setStudentItems([]);
      setStudentsLoading(false);
      setStudentItemsLoading(false);
      return;
    }

    try {
      setStudentsLoading(true);
      setStudentItemsLoading(true);

      const [count, items] = await Promise.all([
        getTeacherStudentCount(db, currentUid),
        getTeacherStudentsOverview(db, currentUid),
      ]);

      setStudentsUsed(count);
      setStudentItems(items);
    } catch (error) {
      console.error("Failed to load teacher students", error);
      setStudentsUsed(0);
      setStudentItems([]);
    } finally {
      setStudentsLoading(false);
      setStudentItemsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadStudents() {
      if (!user?.uid || !db) {
        if (!cancelled) {
          setStudentsUsed(0);
          setStudentItems([]);
          setStudentsLoading(false);
          setStudentItemsLoading(false);
        }
        return;
      }

      try {
        setStudentsLoading(true);
        setStudentItemsLoading(true);

        const [count, items] = await Promise.all([
          getTeacherStudentCount(db, user.uid),
          getTeacherStudentsOverview(db, user.uid),
        ]);

        if (!cancelled) {
          setStudentsUsed(count);
          setStudentItems(items);
        }
      } catch (error) {
        console.error("Failed to load teacher students", error);
        if (!cancelled) {
          setStudentsUsed(0);
          setStudentItems([]);
        }
      } finally {
        if (!cancelled) {
          setStudentsLoading(false);
          setStudentItemsLoading(false);
        }
      }
    }

    void loadStudents();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    let cancelled = false;

    async function loadSubmissionStats() {
      if (!user?.uid || !db) {
        if (!cancelled) {
          setSubmissionStats(emptyStats());
          setTeacherSpaceCount(0);
          setSubmissionStatsLoading(false);
        }
        return;
      }

      try {
        setSubmissionStatsLoading(true);
        const result = await getTeacherDashboardStats(db, user.uid);

        if (!cancelled) {
          setSubmissionStats(result.stats);
          setTeacherSpaceCount(result.spaceCount);
        }
      } catch (error) {
        console.error("Failed to load teacher submission stats", error);
        if (!cancelled) {
          setSubmissionStats(emptyStats());
          setTeacherSpaceCount(0);
        }
      } finally {
        if (!cancelled) {
          setSubmissionStatsLoading(false);
        }
      }
    }

    void loadSubmissionStats();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return studentItems;

    return studentItems.filter((item) => {
      const name = item.displayName.toLowerCase();
      const spaces = item.spaces.map((space) => space.title.toLowerCase()).join(" ");
      return name.includes(q) || spaces.includes(q);
    });
  }, [studentItems, studentSearch]);

  function getStudentCapacityMessage(used: number, limit: number): string {
    const remaining = getRemaining(used, limit);

    if (limit <= 0) {
      return t("students.capacity.unavailable");
    }

    if (remaining <= 0) {
      return t("students.capacity.limitReached");
    }

    if (remaining === 1) {
      return t("students.capacity.oneLeft");
    }

    if (remaining <= 3) {
      return t("students.capacity.fewLeft", { count: remaining });
    }

    return t("students.capacity.available", { count: remaining });
  }

  function shouldShowUpgradeCta(used: number, limit: number): boolean {
    if (limit <= 0) return true;
    return used >= Math.max(1, limit - 3);
  }

  function getStatusText(used: number, limit: number): string {
    if (limit <= 0) return t("status.unavailable");
    const p = percent(used, limit);
    if (p >= 100) return t("status.limitReached");
    if (p >= 85) return t("status.almostFull");
    if (p >= 60) return t("status.gettingBusy");
    return t("status.good");
  }

  async function handleArchiveStudent(student: TeacherStudentOverviewItem) {
    if (!user?.uid || !db) return;

    const ok = window.confirm(t("students.confirm.archive", { name: student.displayName }));
    if (!ok) return;

    setBusyStudentUid(student.uid);
    setActionError(null);

    try {
      await archiveStudentFromTeacherSpaces({
        db,
        teacherUid: user.uid,
        studentUid: student.uid,
      });

      await reloadStudents(user.uid);
    } catch (error) {
      console.error("Failed to archive student", error);
      setActionError(t("students.errors.archive"));
    } finally {
      setBusyStudentUid(null);
    }
  }

  if (loading || usageLoading || studentsLoading || studentItemsLoading || submissionStatsLoading) {
    return null;
  }

  const generatorsUsed = usage["premium_generators"] ?? 0;
  const generatorsLimit = getBucketLimit(role, effectivePlan, "premium_generators");

  const imagesUsed = usage["image_generation"] ?? 0;
  const imagesLimit = getBucketLimit(role, effectivePlan, "image_generation");

  const feedbackUsed = usage["ai_feedback"] ?? 0;
  const feedbackLimit = getBucketLimit(role, effectivePlan, "ai_feedback");

  const downloadsUsed = usage["downloads"] ?? 0;
  const downloadsLimit = getBucketLimit(role, effectivePlan, "downloads");

  const studentsLimit = getBucketLimit(role, effectivePlan, "members");
  const studentsPercent = percent(studentsUsed, studentsLimit);
  const studentsTone = getProgressTone(studentsUsed, studentsLimit);
  const studentsRemaining = getRemaining(studentsUsed, studentsLimit);
  const studentCapacityMessage = getStudentCapacityMessage(studentsUsed, studentsLimit);
  const showUpgradeCta = shouldShowUpgradeCta(studentsUsed, studentsLimit);

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

      <InstallAppButton />

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
        {hasActivePartnerAccess ? (
          <div style={{ padding: "16px 16px 0" }}>
            <PartnerDashboardCard
              title={t("partnerCard.title")}
              text={t("partnerCard.text")}
              extraText={t("partnerCard.extraText")}
              actionHref={`/${locale}/partner`}
              actionLabel={t("partnerCard.action")}
            />
          </div>
        ) : null}

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
                  {role}
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
                href={withLocale(locale, "/pricing")}
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
                href={withLocale(locale, "/account/billing")}
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

      <section
        style={{
          marginTop: 20,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        <StatCard
          title={t("cards.premiumGenerators")}
          used={generatorsUsed}
          limit={generatorsLimit}
          accent="violet"
          t={t}
        />
        <StatCard
          title={t("cards.imageGeneration")}
          used={imagesUsed}
          limit={imagesLimit}
          accent="emerald"
          t={t}
        />
        <StatCard
          title={t("cards.aiFeedback")}
          used={feedbackUsed}
          limit={feedbackLimit}
          accent="slate"
          t={t}
        />
        <StatCard
          title={t("cards.downloads")}
          used={downloadsUsed}
          limit={downloadsLimit}
          accent="blue"
          t={t}
        />
      </section>

      <section
        style={{
          marginTop: 24,
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
              background: "#ffffff",
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
                  {t("submissions.title")}
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
                  {t("submissions.description")}
                </p>
              </div>

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
                {t("submissions.spacesLabel")}: {teacherSpaceCount}
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              }}
            >
              <SmallStatusCard
                title={t("submissions.toReview")}
                value={submissionStats.submitted}
                href={withLocale(locale, "/teacher/spaces")}
                tone="info"
              />
              <SmallStatusCard
                title={t("submissions.needsFollowUp")}
                value={submissionStats.needsWork}
                href={withLocale(locale, "/teacher/spaces")}
                tone="warning"
              />
              <SmallStatusCard
                title={t("submissions.reviewed")}
                value={submissionStats.approved}
                href={withLocale(locale, "/teacher/spaces")}
                tone="success"
              />
            </div>

            <div style={{ marginTop: 16 }}>
              <Link
                href={withLocale(locale, "/teacher/spaces")}
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
          </div>
        </div>
      </section>

      <section
        style={{
          marginTop: 24,
          border: "1px solid #cbd5e1",
          borderRadius: 22,
          background: "#e2e8f0",
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
                  {t("students.badge")}
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
                  {t("students.title")}
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
                  {t("students.description")}
                </p>
              </div>

              <div
                style={{
                  minWidth: 260,
                  flex: "1 1 280px",
                  maxWidth: 360,
                  border: "1px solid #bfdbfe",
                  background: "#ffffff",
                  borderRadius: 18,
                  padding: 14,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "end",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: "#111827" }}>
                    {studentsUsed}
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#64748b", marginLeft: 6 }}>
                      / {studentsLimit}
                    </span>
                  </div>

                  <span
                    style={{
                      borderRadius: 999,
                      padding: "5px 9px",
                      fontSize: 12,
                      fontWeight: 700,
                      background: studentsTone.badgeBg,
                      color: studentsTone.badgeColor,
                      border: `1px solid ${studentsTone.badgeBorder}`,
                    }}
                  >
                    {getStatusText(studentsUsed, studentsLimit)}
                  </span>
                </div>

                <div
                  style={{
                    marginTop: 12,
                    height: 10,
                    borderRadius: 999,
                    overflow: "hidden",
                    background: "#dbeafe",
                  }}
                >
                  <div
                    style={{
                      width: `${studentsPercent}%`,
                      height: "100%",
                      background: studentsTone.fill,
                      borderRadius: 999,
                      transition: "width 200ms ease",
                    }}
                  />
                </div>

                <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>
                  {t("students.capacity.percentUsed", { percent: studentsPercent })}
                </div>

                <div
                  style={{
                    marginTop: 12,
                    border: `1px solid ${studentsRemaining <= 0
                      ? "#fecaca"
                      : studentsRemaining <= 3
                        ? "#fde68a"
                        : "#bfdbfe"
                      }`,
                    background:
                      studentsRemaining <= 0
                        ? "#fef2f2"
                        : studentsRemaining <= 3
                          ? "#fffbeb"
                          : "#f8fbff",
                    color:
                      studentsRemaining <= 0
                        ? "#b91c1c"
                        : studentsRemaining <= 3
                          ? "#92400e"
                          : "#1e3a8a",
                    borderRadius: 14,
                    padding: "12px 14px",
                    fontSize: 14,
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{studentCapacityMessage}</div>

                  {studentsRemaining <= 0 && (
                    <div style={{ marginTop: 6, fontSize: 13 }}>
                      {t("students.capacity.blocked")}
                    </div>
                  )}

                  {showUpgradeCta && (
                    <div style={{ marginTop: 10 }}>
                      <Link
                        href={withLocale(locale, "/pricing")}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 12,
                          padding: "10px 14px",
                          fontSize: 14,
                          fontWeight: 700,
                          textDecoration: "none",
                          background: studentsRemaining <= 0 ? "#dc2626" : "#2563eb",
                          color: "#ffffff",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                        }}
                      >
                        {t("students.capacity.upgrade")}
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 18,
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <button
                type="button"
                onClick={() => setStudentsOpen((prev) => !prev)}
                style={{
                  border: "1px solid #93c5fd",
                  background: studentsOpen ? "#2563eb" : "#ffffff",
                  color: studentsOpen ? "#ffffff" : "#1d4ed8",
                  borderRadius: 12,
                  padding: "10px 14px",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                }}
              >
                {studentsOpen ? t("students.actions.hide") : t("students.actions.show")}
              </button>

              <div style={{ fontSize: 13, color: "#64748b" }}>
                {t("students.counts.shownTotal", {
                  shown: filteredStudents.length,
                  total: studentItems.length,
                })}
              </div>
            </div>

            {studentsOpen && (
              <div
                style={{
                  marginTop: 16,
                  border: "1px solid #dbeafe",
                  borderRadius: 18,
                  background: "#ffffff",
                  padding: 14,
                }}
              >
                <div>
                  <label
                    htmlFor="student-search"
                    style={{ display: "block", fontSize: 14, fontWeight: 700, marginBottom: 8 }}
                  >
                    {t("students.search.label")}
                  </label>

                  <input
                    id="student-search"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder={t("students.search.placeholder")}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      border: "1px solid #d1d5db",
                      borderRadius: 12,
                      padding: "10px 12px",
                      fontSize: 14,
                      outline: "none",
                      background: "#ffffff",
                    }}
                  />
                </div>

                {actionError && (
                  <div
                    style={{
                      marginTop: 14,
                      border: "1px solid #fecaca",
                      background: "#fef2f2",
                      color: "#b91c1c",
                      borderRadius: 12,
                      padding: "10px 12px",
                      fontSize: 14,
                    }}
                  >
                    {actionError}
                  </div>
                )}

                <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                  {filteredStudents.length === 0 ? (
                    <div
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 14,
                        padding: 16,
                        background: "#f8fafc",
                        color: "#64748b",
                        fontSize: 14,
                      }}
                    >
                      {t("students.empty")}
                    </div>
                  ) : (
                    filteredStudents.map((student) => {
                      const isBusy = busyStudentUid === student.uid;

                      return (
                        <div
                          key={student.uid}
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: 16,
                            padding: 14,
                            background: "#ffffff",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              gap: 12,
                              flexWrap: "wrap",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                            }}
                          >
                            <div style={{ minWidth: 0, flex: "1 1 360px" }}>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  flexWrap: "wrap",
                                  alignItems: "center",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 16,
                                    fontWeight: 800,
                                    color: "#111827",
                                    wordBreak: "break-word",
                                  }}
                                >
                                  {student.displayName}
                                </div>

                                <span
                                  style={{
                                    borderRadius: 999,
                                    padding: "4px 8px",
                                    fontSize: 12,
                                    fontWeight: 700,
                                    background: student.isAnon ? "#fff7ed" : "#ecfdf5",
                                    color: student.isAnon ? "#c2410c" : "#047857",
                                    border: `1px solid ${student.isAnon ? "#fdba74" : "#a7f3d0"}`,
                                  }}
                                >
                                  {student.isAnon
                                    ? t("students.labels.anonymous")
                                    : t("students.labels.registered")}
                                </span>

                                <span
                                  style={{
                                    borderRadius: 999,
                                    padding: "4px 8px",
                                    fontSize: 12,
                                    fontWeight: 700,
                                    background: "#f1f5f9",
                                    color: "#334155",
                                    border: "1px solid #cbd5e1",
                                  }}
                                >
                                  {t("students.labels.spacesCount", {
                                    count: student.spaces.length,
                                  })}
                                </span>
                              </div>

                              <div
                                style={{
                                  marginTop: 8,
                                  fontSize: 13,
                                  color: "#64748b",
                                  wordBreak: "break-word",
                                }}
                              >
                                {t("students.labels.uid", { uid: student.uid })}
                              </div>

                              <div
                                style={{
                                  marginTop: 12,
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: 8,
                                }}
                              >
                                {student.spaces.map((space) => (
                                  <Link
                                    key={`${student.uid}_${space.spaceId}`}
                                    href={withLocale(locale, `/teacher/spaces/${space.spaceId}/members`)}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 6,
                                      border: "1px solid #d1d5db",
                                      borderRadius: 999,
                                      padding: "8px 10px",
                                      fontSize: 13,
                                      fontWeight: 700,
                                      color: "#111827",
                                      textDecoration: "none",
                                      background: "#ffffff",
                                      maxWidth: "100%",
                                      wordBreak: "break-word",
                                    }}
                                  >
                                    {space.title}
                                  </Link>
                                ))}
                              </div>
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gap: 8,
                                width: "100%",
                                maxWidth: 220,
                                flex: "1 1 220px",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => handleArchiveStudent(student)}
                                disabled={isBusy}
                                style={{
                                  width: "100%",
                                  border: "1px solid #cbd5e1",
                                  background: "#f8fafc",
                                  color: "#334155",
                                  borderRadius: 10,
                                  padding: "10px 12px",
                                  fontSize: 13,
                                  fontWeight: 700,
                                  cursor: isBusy ? "not-allowed" : "pointer",
                                  opacity: isBusy ? 0.6 : 1,
                                }}
                              >
                                {isBusy ? t("students.actions.working") : t("students.actions.setInactive")}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
