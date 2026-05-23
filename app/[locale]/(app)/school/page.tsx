"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useUserProfile } from "@/lib/useUserProfile";

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
  teacherSeatLimit?: number;
};

type LoadState = "idle" | "loading" | "success" | "error";
type SchoolAdminTranslator = ReturnType<typeof useTranslations>;

export default function SchoolAdminOverviewPage() {
  const locale = useLocale();
  const t = useTranslations("schoolAdmin");
  const { user, profile, loading } = useUserProfile();
  const [state, setState] = useState<LoadState>("idle");
  const [summary, setSummary] = useState<SchoolSummary | null>(null);
  const [error, setError] = useState("");

  const schoolId = profile?.schoolId ?? "";
  const hasSchoolAdminAccess =
    Boolean(schoolId) &&
    profile?.schoolRole === "school_admin" &&
    profile?.schoolStatus === "active";

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
  const teacherSeatLimit = summary?.teacherSeatLimit ?? school?.teacherSeatLimit ?? 0;
  const seatsRemaining = Math.max(teacherSeatLimit - activeTeacherCount, 0);
  const seatUsagePercent =
    teacherSeatLimit > 0
      ? Math.min(Math.round((activeTeacherCount / teacherSeatLimit) * 100), 100)
      : 0;
  const isLicenseFull = teacherSeatLimit > 0 && activeTeacherCount >= teacherSeatLimit;
  const isAlmostFull = !isLicenseFull && teacherSeatLimit > 0 && seatsRemaining <= 1;

  return (
    <main style={styles.page}>
      <SchoolNav locale={locale} active="overview" t={t} />

      <section style={styles.header}>
        <div>
          <div style={styles.kicker}>{t("overview.eyebrow")}</div>
          <h1 style={styles.title}>{school?.name || t("overview.titleFallback")}</h1>
          <p style={styles.muted}>{t("overview.subtitle")}</p>
        </div>
        {school?.status ? <StatusPill value={school.status} /> : null}
      </section>

      {state === "loading" ? <section style={styles.card}>{t("overview.loading")}</section> : null}

      {state === "error" ? (
        <section style={styles.errorBox}>
          <strong>{t("overview.errorTitle")}</strong>
          <p style={{ margin: "6px 0 0" }}>{error}</p>
        </section>
      ) : null}

      {state === "success" && school ? (
        <>
          <section style={styles.statsGrid}>
            <StatCard
              label={t("overview.activeTeachers")}
              value={String(activeTeacherCount)}
              helper={t("overview.teacherSeats")}
            />
            <StatCard
              label={t("overview.teacherSeats")}
              value={t("overview.seatUsageShort", {
                used: activeTeacherCount,
                limit: teacherSeatLimit,
              })}
              helper={t("overview.seatUsage", {
                used: activeTeacherCount,
                limit: teacherSeatLimit,
              })}
            />
            <StatCard
              label={t("overview.availableSeats")}
              value={String(seatsRemaining)}
              helper={formatSeatsRemaining(t, seatsRemaining)}
            />
            <StatCard
              label={t("overview.plan")}
              value={formatValue(school.planKey)}
              helper={formatValue(school.billingType)}
            />
          </section>

          <section style={styles.twoColumnGrid}>
            <div style={styles.card}>
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
            </div>

            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>{t("overview.quickActions")}</h2>
              <div style={styles.actionGrid}>
                <ActionLink
                  href={`/${locale}/school/invites`}
                  title={t("overview.inviteTeacher")}
                  text={t("overview.inviteTeachersText")}
                />
                <ActionLink
                  href={`/${locale}/school/teachers`}
                  title={t("overview.viewTeachers")}
                  text={t("overview.manageTeachersText")}
                />
                <ActionLink
                  href={`/${locale}/school/invites`}
                  title={t("overview.viewInvites")}
                  text={t("overview.viewInvitesText")}
                />
              </div>
            </div>
          </section>

          <section style={styles.card}>
            <div style={styles.cardHeaderCompact}>
              <div>
                <h2 style={styles.sectionTitle}>{t("overview.nextSteps")}</h2>
                <p style={styles.mutedCompact}>{t("overview.nextStepsText")}</p>
              </div>
            </div>

            <div style={styles.stepGrid}>
              <StepItem
                number="1"
                title={t("overview.stepInviteTitle")}
                text={t("overview.stepInviteText")}
                active={activeTeacherCount === 0}
              />
              <StepItem
                number="2"
                title={t("overview.stepManageTitle")}
                text={t("overview.stepManageText")}
                active={activeTeacherCount > 0}
              />
              <StepItem
                number="3"
                title={t("overview.stepCapacityTitle")}
                text={t("overview.stepCapacityText")}
                active={isAlmostFull || isLicenseFull}
              />
            </div>
          </section>

          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>{t("overview.licenseDetails")}</h2>
            <p style={styles.mutedCompact}>{t("overview.detailsText")}</p>

            <div style={styles.grid}>
              <InfoItem label={t("overview.status")} value={formatValue(school.status)} />
              <InfoItem label={t("overview.plan")} value={formatValue(school.planKey)} />
              <InfoItem label={t("overview.billing")} value={formatValue(school.billingType)} />
              <InfoItem label={t("overview.schoolId")} value={summary.schoolId || schoolId || "-"} />
            </div>
          </section>
        </>
      ) : null}
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

function StatusPill({ value }: { value: string }) {
  return <span style={styles.statusPill}>{formatValue(value)}</span>;
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <section style={styles.statCard}>
      <div style={styles.infoLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
      <p style={styles.statHelper}>{helper}</p>
    </section>
  );
}

function ActionLink({
  href,
  title,
  text,
}: {
  href: string;
  title: string;
  text: string;
}) {
  return (
    <Link href={href} style={styles.actionLink}>
      <strong>{title}</strong>
      <span>{text}</span>
    </Link>
  );
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

function StepItem({
  number,
  title,
  text,
  active,
}: {
  number: string;
  title: string;
  text: string;
  active: boolean;
}) {
  return (
    <div style={active ? styles.stepItemActive : styles.stepItem}>
      <span style={active ? styles.stepNumberActive : styles.stepNumber}>{number}</span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}

function SchoolNav({
  locale,
  active,
  t,
}: {
  locale: string;
  active: "overview" | "teachers" | "invites";
  t: SchoolAdminTranslator;
}) {
  return (
    <nav style={styles.nav}>
      <SchoolNavLink href={`/${locale}/school`} active={active === "overview"}>
        {t("nav.overview")}
      </SchoolNavLink>
      <SchoolNavLink href={`/${locale}/school/teachers`} active={active === "teachers"}>
        {t("nav.teachers")}
      </SchoolNavLink>
      <SchoolNavLink href={`/${locale}/school/invites`} active={active === "invites"}>
        {t("nav.invites")}
      </SchoolNavLink>
    </nav>
  );
}

function SchoolNavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} style={active ? styles.navLinkActive : styles.navLink}>
      {children}
    </Link>
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
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  statCard: {
    padding: 16,
    borderRadius: 16,
    border: "1px solid rgba(15,23,42,0.08)",
    background: "white",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  },
  statValue: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: 900,
    color: "#0f172a",
  },
  statHelper: {
    margin: "6px 0 0",
    color: "#64748b",
    fontSize: 13,
    lineHeight: 1.45,
  },
  twoColumnGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
    gap: 16,
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
    gap: 12,
    marginTop: 10,
    color: "#475569",
    fontSize: 13,
    fontWeight: 750,
  },
  actionGrid: {
    display: "grid",
    gap: 10,
    marginTop: 14,
  },
  actionLink: {
    display: "grid",
    gap: 4,
    padding: 14,
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    color: "#0f172a",
    textDecoration: "none",
  },
  stepGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
  },
  stepItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    color: "#0f172a",
  },
  stepItemActive: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    border: "1px solid #bfdbfe",
    background: "#eff6ff",
    color: "#0f172a",
  },
  stepNumber: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 28px",
    width: 28,
    height: 28,
    borderRadius: 999,
    background: "#e2e8f0",
    color: "#334155",
    fontSize: 13,
    fontWeight: 900,
  },
  stepNumberActive: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 28px",
    width: 28,
    height: 28,
    borderRadius: 999,
    background: "#2563eb",
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 900,
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
