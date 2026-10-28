"use client";

import DashboardCoursesSection from "@/components/DashboardCoursesSection";
import SchoolWelcome from "./SchoolWelcome";
import ProductAnalyticsStatus from "./ProductAnalyticsStatus";
import SchoolStatisticsCards from "./SchoolStatisticsCards";
import type { SchoolStatistics } from "@/lib/schools/server/aggregateStatistics";
import SchoolNav from "@/components/school/SchoolNav";
import "./schoolAdmin.css";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useUserProfile } from "@/lib/useUserProfile";
import { canAccessSchoolAdmin } from "@/lib/schools/access";

type SchoolSummary = {
  ok?: boolean;
  error?: string;
  schoolId?: string;
  school?: {
    name?: string;
    planKey?: string;
    billingType?: string;
    status?: string;
    teacherSeatLimit?: number;
  };
  activeTeacherCount?: number;
  pendingTeacherInviteCount?: number;
  teacherSeatLimit?: number;
  usageStats?: SchoolStatistics;
};

type LoadState = "idle" | "loading" | "success" | "error";
type SchoolAdminTranslator = ReturnType<typeof useTranslations>;

export default function SchoolDashboard({ view = "overview" }: { view?: "overview" | "statistics" | "license" }) {
  const locale = useLocale();
  const t = useTranslations("schoolAdmin");
  const { user, profile, loading } = useUserProfile();
  const [state, setState] = useState<LoadState>("idle");
  const [summary, setSummary] = useState<SchoolSummary | null>(null);
  const [error, setError] = useState("");

  const schoolId = profile?.schoolId ?? "";
  const hasSchoolAdminAccess = canAccessSchoolAdmin(profile);

  useEffect(() => {
    if (loading) return;

    if (!user || user.isAnonymous || !hasSchoolAdminAccess) {
      setState("idle");
      return;
    }

    const signedInUser = user;
    let cancelled = false;

    async function loadSchool() {
      setState("loading");
      setError("");

      try {
        const authToken = await signedInUser.getIdToken();
        const response = await fetch(`/api/schools/${encodeURIComponent(schoolId)}`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });
        const data = (await response.json().catch(() => ({}))) as SchoolSummary;

        if (cancelled) return;

        if (!response.ok || !data.ok) {
          setState("error");
          setError(data.error || t("overview.errorTitle"));
          setSummary(null);
          return;
        }

        setSummary(data);
        setState("success");
      } catch (err: unknown) {
        if (cancelled) return;

        setState("error");
        setError(err instanceof Error ? err.message : t("overview.errorTitle"));
        setSummary(null);
      }
    }

    void loadSchool();

    return () => {
      cancelled = true;
    };
  }, [hasSchoolAdminAccess, loading, schoolId, t, user]);

  if (loading) {
    return <main style={styles.page}>{t("access.loading")}</main>;
  }

  if (!hasSchoolAdminAccess) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <div style={styles.kicker}>{t("access.eyebrow")}</div>
          <h1 style={styles.title}>{t("access.title")}</h1>
          <p style={styles.muted}>{t("access.text")}</p>
        </section>
      </main>
    );
  }

  const school = summary?.school;
  const activeTeacherCount = summary?.activeTeacherCount ?? 0;
  const pendingTeacherInviteCount = summary?.pendingTeacherInviteCount ?? 0;
  const teacherSeatLimit = summary?.teacherSeatLimit ?? school?.teacherSeatLimit ?? 0;
  const committedTeacherSeats = activeTeacherCount + pendingTeacherInviteCount;
  const seatsRemaining = Math.max(teacherSeatLimit - committedTeacherSeats, 0);
  const seatUsagePercent =
    teacherSeatLimit > 0
      ? Math.min(Math.round((committedTeacherSeats / teacherSeatLimit) * 100), 100)
      : 0;
  const isLicenseFull = teacherSeatLimit > 0 && committedTeacherSeats >= teacherSeatLimit;
  const isAlmostFull = !isLicenseFull && teacherSeatLimit > 0 && seatsRemaining <= 1;
  return (
    <main style={styles.page}>
      <SchoolNav locale={locale} active={view} />
      <ProductAnalyticsStatus />

      {view !== "overview" ? (
        <section style={styles.header}>
          <div>
            <div style={styles.kicker}>{school?.name || t("overview.titleFallback")}</div>
            <h1 style={styles.title}>{t(view === "statistics" ? "nav.statistics" : "nav.license")}</h1>
            <p style={styles.muted}>{t(view === "statistics" ? "welcome.statisticsIntro" : "welcome.licenseIntro")}</p>
          </div>
        </section>
      ) : null}

      {state === "loading" ? <section style={styles.card}>{t("overview.loading")}</section> : null}

      {state === "error" ? (
        <section style={styles.errorBox}>
          <strong>{t("overview.errorTitle")}</strong>
          <p style={{ margin: "6px 0 0" }}>{error}</p>
        </section>
      ) : null}

      {state === "success" && school ? (
        <>
          {view === "overview" ? (
            <>
              <SchoolWelcome schoolName={school.name} activeTeacherCount={activeTeacherCount} pendingTeacherInviteCount={pendingTeacherInviteCount} teacherSeatLimit={teacherSeatLimit} seatsRemaining={seatsRemaining} />
              {isLicenseFull ? <Notice tone="warning" title={t("overview.licenseFullTitle")} text={t("overview.licenseFullText")} /> : null}
            </>
          ) : null}
          {view === "license" ? <section style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.sectionTitle}>{t("overview.licenseUsage")}</h2>
                <p style={styles.mutedCompact}>{t("overview.licenseText")}</p>
              </div>
              <strong style={styles.usageNumber}>{seatUsagePercent}%</strong>
            </div>

            <div style={styles.progressTrack} aria-hidden="true">
              <div
                style={{
                  ...styles.progressFill,
                  width: `${seatUsagePercent}%`,
                  background: isLicenseFull ? "#dc2626" : isAlmostFull ? "#d97706" : "#2563eb",
                }}
              />
            </div>

            <div style={styles.usageRow}>
              <span>
                {t("overview.seatUsage", {
                  used: activeTeacherCount,
                  limit: teacherSeatLimit,
                })}
              </span>
              <span>
                {t("overview.pendingSeatUsage", {
                  count: pendingTeacherInviteCount,
                })}
              </span>
              <span>{formatSeatsRemaining(t, seatsRemaining)}</span>
            </div>

            {isLicenseFull ? (
              <Notice
                tone="danger"
                title={t("overview.licenseFullTitle")}
                text={t("overview.licenseFullText")}
              />
            ) : null}

            {isAlmostFull ? (
              <Notice
                tone="warning"
                title={t("overview.almostFullTitle")}
                text={t("overview.almostFullText", { count: seatsRemaining })}
              />
            ) : null}
          </section> : null}

          {view === "statistics" ? <SchoolStatisticsCards statistics={summary.usageStats} teachers={activeTeacherCount} /> : null}
          {view === "license" ? <section style={styles.card}>
            <h2 style={styles.sectionTitle}>{t("overview.licenseDetails")}</h2>
            <p style={styles.mutedCompact}>{t("overview.detailsText")}</p>

            <div style={styles.grid}>
              <InfoItem label={t("overview.status")} value={formatValue(school.status)} />
              <InfoItem label={t("overview.plan")} value={formatValue(school.planKey)} />
              <InfoItem label={t("overview.billing")} value={formatValue(school.billingType)} />
              <InfoItem label={t("overview.schoolId")} value={summary.schoolId || schoolId || "-"} />
            </div>
          </section> : null}
        </>
      ) : null}
      {view === "overview" ? <DashboardCoursesSection /> : null}
    </main>
  );
}

function formatValue(value?: string | null) {
  if (!value) return "-";
  return value.replaceAll("_", " ");
}

function formatSeatsRemaining(
  t: SchoolAdminTranslator,
  count: number
) {
  if (count <= 0) return t("overview.noSeatsRemaining");
  if (count === 1) return t("overview.oneSeatRemaining");
  return t("overview.seatsRemaining", { count });
}

function Notice({
  tone,
  title,
  text,
}: {
  tone: "danger" | "warning";
  title: string;
  text: string;
}) {
  const style = tone === "danger" ? styles.noticeDanger : styles.noticeWarning;

  return (
    <div style={style}>
      <strong>{title}</strong>
      <p style={{ margin: "4px 0 0" }}>{text}</p>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.infoItem}>
      <div style={styles.infoLabel}>{label}</div>
      <div style={styles.infoValue}>{value}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "grid",
    gap: 16,
    maxWidth: 1040,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    padding: 20,
    borderRadius: 16,
    border: "1px solid rgba(15,23,42,0.08)",
    background: "white",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  },
  nav: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    padding: 6,
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.08)",
    background: "white",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  },
  navLink: {
    borderRadius: 10,
    padding: "9px 12px",
    color: "#475569",
    fontSize: 14,
    fontWeight: 800,
    textDecoration: "none",
  },
  navLinkActive: {
    borderRadius: 10,
    padding: "9px 12px",
    color: "#0f172a",
    background: "#f1f5f9",
    fontSize: 14,
    fontWeight: 900,
    textDecoration: "none",
  },
  card: {
    padding: 20,
    borderRadius: 16,
    border: "1px solid rgba(15,23,42,0.08)",
    background: "white",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  },
  errorBox: {
    padding: 16,
    borderRadius: 14,
    border: "1px solid #fecaca",
    background: "#fef2f2",
    color: "#991b1b",
  },
  kicker: {
    fontSize: 12,
    fontWeight: 800,
    opacity: 0.65,
    textTransform: "uppercase",
  },
  title: {
    margin: "4px 0 0",
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: 0,
  },
  muted: {
    margin: "8px 0 0",
    color: "#64748b",
    lineHeight: 1.5,
  },
  mutedCompact: {
    margin: "4px 0 0",
    color: "#64748b",
    lineHeight: 1.45,
    fontSize: 14,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 850,
    color: "#0f172a",
  },
  cardHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 18,
  },
  cardHeaderCompact: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 14,
  },
  usageNumber: {
    color: "#0f172a",
    fontSize: 20,
  },
  progressTrack: {
    height: 10,
    overflow: "hidden",
    borderRadius: 999,
    background: "#e2e8f0",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    transition: "width 180ms ease",
  },
  usageRow: {
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 10,
    color: "#475569",
    fontSize: 13,
    fontWeight: 750,
  },
  noticeDanger: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    border: "1px solid #fecaca",
    background: "#fef2f2",
    color: "#991b1b",
    fontSize: 14,
    lineHeight: 1.45,
  },
  noticeWarning: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    border: "1px solid #fed7aa",
    background: "#fff7ed",
    color: "#9a3412",
    fontSize: 14,
    lineHeight: 1.45,
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 30,
    padding: "0 10px",
    borderRadius: 999,
    background: "#ecfdf5",
    color: "#047857",
    fontSize: 13,
    fontWeight: 850,
    textTransform: "capitalize",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginTop: 16,
  },
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 12,
    marginTop: 16,
  },
  metricItem: {
    minHeight: 118,
    padding: 14,
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    display: "grid",
    alignContent: "space-between",
    gap: 8,
  },
  metricLabel: {
    fontSize: 13,
    color: "#475569",
    fontWeight: 750,
    lineHeight: 1.35,
  },
  metricValue: {
    fontSize: 22,
    lineHeight: 1.12,
    fontWeight: 900,
    color: "#0f172a",
    overflowWrap: "anywhere",
    textTransform: "none",
  },
  metricHelper: {
    fontSize: 12,
    color: "#64748b",
    lineHeight: 1.35,
  },
  infoItem: {
    padding: 14,
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
  },
  infoLabel: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 6,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: 800,
    wordBreak: "break-word",
    textTransform: "capitalize",
  },
};
