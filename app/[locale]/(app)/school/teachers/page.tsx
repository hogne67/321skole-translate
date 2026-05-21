"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";

import { useUserProfile } from "@/lib/useUserProfile";

type SchoolTeacher = {
  id?: string;
  uid?: string;
  email?: string | null;
  displayName?: string | null;
  role?: string;
  status?: string;
};

type TeachersResponse = {
  ok?: boolean;
  error?: string;
  schoolId?: string;
  teachers?: SchoolTeacher[];
};

type DisableTeacherResponse = {
  ok?: boolean;
  error?: string;
  reason?: string;
};

type LoadState = "idle" | "loading" | "success" | "error";

export default function SchoolTeachersPage() {
  const locale = useLocale();
  const { user, profile, loading } = useUserProfile();
  const [state, setState] = useState<LoadState>("idle");
  const [teachers, setTeachers] = useState<SchoolTeacher[]>([]);
  const [error, setError] = useState("");
  const [actionUid, setActionUid] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const schoolId = profile?.schoolId ?? "";
  const hasSchoolAdminAccess =
    Boolean(schoolId) &&
    profile?.schoolRole === "school_admin" &&
    profile?.schoolStatus === "active";

  useEffect(() => {
    if (loading) return;

    if (!user || user.isAnonymous || !hasSchoolAdminAccess) {
      setState("idle");
      setTeachers([]);
      return;
    }

    const signedInUser = user;
    let cancelled = false;

    async function loadTeachers() {
      setState("loading");
      setError("");

      try {
        const authToken = await signedInUser.getIdToken();
        const response = await fetch(
          `/api/schools/${encodeURIComponent(schoolId)}/teachers`,
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          }
        );
        const data = (await response.json().catch(() => ({}))) as TeachersResponse;

        if (cancelled) return;

        if (!response.ok || !data.ok) {
          setState("error");
          setError(data.error || "Kunne ikke hente lærerliste.");
          setTeachers([]);
          return;
        }

        setTeachers(data.teachers ?? []);
        setState("success");
      } catch (err: unknown) {
        if (cancelled) return;

        setState("error");
        setError(err instanceof Error ? err.message : "Kunne ikke hente lærerliste.");
        setTeachers([]);
      }
    }

    void loadTeachers();

    return () => {
      cancelled = true;
    };
  }, [hasSchoolAdminAccess, loading, refreshKey, schoolId, user]);

  async function disableTeacher(teacher: SchoolTeacher) {
    if (!user || user.isAnonymous || !hasSchoolAdminAccess) return;

    const targetUid = teacher.uid ?? teacher.id ?? "";
    if (!targetUid) {
      setActionError("Mangler UID for læreren.");
      return;
    }

    const label = teacher.email || teacher.displayName || targetUid;
    const confirmed = window.confirm(`Deaktivere lærer ${label}?`);
    if (!confirmed) return;

    setActionUid(targetUid);
    setActionMessage("");
    setActionError("");

    try {
      const authToken = await user.getIdToken();
      const response = await fetch("/api/schools/disable-teacher", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ schoolId, targetUid }),
      });
      const data = (await response.json().catch(() => ({}))) as DisableTeacherResponse;

      if (!response.ok || !data.ok) {
        setActionError(getDisableErrorMessage(data));
        return;
      }

      setActionMessage("Læreren er deaktivert.");
      setRefreshKey((current) => current + 1);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Kunne ikke deaktivere lærer.");
    } finally {
      setActionUid(null);
    }
  }

  if (loading) {
    return <main style={styles.page}>Laster...</main>;
  }

  if (!hasSchoolAdminAccess) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <div style={styles.kicker}>Skole</div>
          <h1 style={styles.title}>Ingen tilgang</h1>
          <p style={styles.muted}>Denne siden er bare for aktive skoleadministratorer.</p>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <SchoolNav locale={locale} active="teachers" />

      <section style={styles.header}>
        <div>
          <div style={styles.kicker}>Skoleadmin</div>
          <h1 style={styles.title}>Lærere</h1>
          <p style={styles.muted}>Aktive og deaktiverte lærere ved skolen.</p>
        </div>
      </section>

      {state === "loading" ? <section style={styles.card}>Henter lærere...</section> : null}

      {state === "error" ? (
        <section style={styles.errorBox}>
          <strong>Kunne ikke hente lærerliste</strong>
          <p style={{ margin: "6px 0 0" }}>{error}</p>
        </section>
      ) : null}

      {state === "success" ? (
        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>Lærerliste</h2>
          {actionMessage ? <div style={styles.successBox}>{actionMessage}</div> : null}
          {actionError ? <div style={styles.errorBox}>{actionError}</div> : null}

          {teachers.length === 0 ? (
            <p style={styles.muted}>Ingen lærere er lagt til ennå.</p>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <TableHeader>E-post</TableHeader>
                    <TableHeader>Navn</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Rolle</TableHeader>
                    <TableHeader>Handling</TableHeader>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((teacher) => (
                    <tr key={teacher.id ?? teacher.uid ?? teacher.email ?? "teacher"}>
                      <TableCell>{teacher.email || "-"}</TableCell>
                      <TableCell>{teacher.displayName || "-"}</TableCell>
                      <TableCell>
                        <StatusPill status={teacher.status ?? "-"} />
                      </TableCell>
                      <TableCell>{teacher.role || "-"}</TableCell>
                      <TableCell>
                        {teacher.status === "active" ? (
                          <button
                            type="button"
                            onClick={() => disableTeacher(teacher)}
                            disabled={actionUid === (teacher.uid ?? teacher.id)}
                            style={styles.dangerButton}
                          >
                            {actionUid === (teacher.uid ?? teacher.id)
                              ? "Deaktiverer..."
                              : "Deaktiver"}
                          </button>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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

function getDisableErrorMessage(data: DisableTeacherResponse): string {
  if (data.error) return data.error;

  switch (data.reason) {
    case "member_not_found":
      return "Læreren finnes ikke som skolemedlem.";
    case "not_school_teacher":
      return "Dette medlemmet er ikke en skolelærer.";
    default:
      return "Kunne ikke deaktivere lærer.";
  }
}

function TableHeader({ children }: { children: React.ReactNode }) {
  return <th style={styles.th}>{children}</th>;
}

function TableCell({ children }: { children: React.ReactNode }) {
  return <td style={styles.td}>{children}</td>;
}

function StatusPill({ status }: { status: string }) {
  const isActive = status === "active";
  const style = isActive ? styles.activePill : styles.disabledPill;

  return <span style={style}>{status}</span>;
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "grid",
    gap: 16,
    maxWidth: 1040,
    margin: "0 auto",
  },
  header: {
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
  successBox: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    border: "1px solid #a7f3d0",
    background: "#ecfdf5",
    color: "#047857",
    fontWeight: 700,
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
  tableWrap: {
    width: "100%",
    overflowX: "auto",
    border: "1px solid #e2e8f0",
    borderRadius: 14,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 680,
  },
  th: {
    padding: "12px 14px",
    textAlign: "left",
    fontSize: 13,
    color: "#64748b",
    background: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
  },
  td: {
    padding: "12px 14px",
    borderBottom: "1px solid #eef2f7",
    fontSize: 14,
    color: "#0f172a",
  },
  activePill: {
    display: "inline-flex",
    borderRadius: 999,
    padding: "4px 9px",
    background: "#ecfdf5",
    color: "#047857",
    fontSize: 12,
    fontWeight: 800,
  },
  disabledPill: {
    display: "inline-flex",
    borderRadius: 999,
    padding: "4px 9px",
    background: "#f1f5f9",
    color: "#475569",
    fontSize: 12,
    fontWeight: 800,
  },
  dangerButton: {
    border: "1px solid #dc2626",
    borderRadius: 10,
    padding: "7px 10px",
    background: "#dc2626",
    color: "#ffffff",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 800,
  },
};
