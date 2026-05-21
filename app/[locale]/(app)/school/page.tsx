"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
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

export default function SchoolAdminOverviewPage() {
  const locale = useLocale();
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
          setError(data.error || "Kunne ikke hente skoleoversikt.");
          setSummary(null);
          return;
        }

        setSummary(data);
        setState("success");
      } catch (err: unknown) {
        if (cancelled) return;

        setState("error");
        setError(err instanceof Error ? err.message : "Kunne ikke hente skoleoversikt.");
        setSummary(null);
      }
    }

    void loadSchool();

    return () => {
      cancelled = true;
    };
  }, [hasSchoolAdminAccess, loading, schoolId, user]);

  if (loading) {
    return <main style={styles.page}>Laster...</main>;
  }

  if (!hasSchoolAdminAccess) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <div style={styles.kicker}>Skole</div>
          <h1 style={styles.title}>Ingen tilgang</h1>
          <p style={styles.muted}>
            Denne siden er bare for aktive skoleadministratorer.
          </p>
        </section>
      </main>
    );
  }

  const school = summary?.school;
  const activeTeacherCount = summary?.activeTeacherCount ?? 0;
  const teacherSeatLimit = summary?.teacherSeatLimit ?? school?.teacherSeatLimit ?? 0;

  return (
    <main style={styles.page}>
      <SchoolNav locale={locale} active="overview" />

      <section style={styles.header}>
        <div>
          <div style={styles.kicker}>Skoleadmin</div>
          <h1 style={styles.title}>{school?.name || "Skoleoversikt"}</h1>
          <p style={styles.muted}>Oversikt over skoleabonnement og lærerplasser.</p>
        </div>
      </section>

      {state === "loading" ? <section style={styles.card}>Henter skoledata...</section> : null}

      {state === "error" ? (
        <section style={styles.errorBox}>
          <strong>Kunne ikke hente skoleoversikt</strong>
          <p style={{ margin: "6px 0 0" }}>{error}</p>
        </section>
      ) : null}

      {state === "success" && school ? (
        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>Skole</h2>

          <div style={styles.grid}>
            <InfoItem label="Navn" value={school.name || "-"} />
            <InfoItem label="Plan" value={school.planKey || "-"} />
            <InfoItem label="Betaling" value={school.billingType || "-"} />
            <InfoItem label="Status" value={school.status || "-"} />
            <InfoItem
              label="Lærerplasser"
              value={`${activeTeacherCount} / ${teacherSeatLimit}`}
            />
          </div>
        </section>
      ) : null}
    </main>
  );
}

function SchoolNav({
  locale,
  active,
}: {
  locale: string;
  active: "overview" | "teachers" | "invites";
}) {
  return (
    <nav style={styles.nav}>
      <SchoolNavLink href={`/${locale}/school`} active={active === "overview"}>
        Oversikt
      </SchoolNavLink>
      <SchoolNavLink href={`/${locale}/school/teachers`} active={active === "teachers"}>
        Lærere
      </SchoolNavLink>
      <SchoolNavLink href={`/${locale}/school/invites`} active={active === "invites"}>
        Invitasjoner
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
    maxWidth: 960,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    padding: 18,
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "white",
  },
  nav: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    padding: 6,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "white",
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
    padding: 18,
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "white",
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
  sectionTitle: {
    margin: "0 0 14px",
    fontSize: 20,
    fontWeight: 800,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
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
  },
};
