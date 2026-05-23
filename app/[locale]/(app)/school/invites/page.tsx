"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { useUserProfile } from "@/lib/useUserProfile";

type TimestampLike =
  | string
  | number
  | Date
  | {
      seconds?: number;
      _seconds?: number;
      nanoseconds?: number;
      _nanoseconds?: number;
      toMillis?: () => number;
      toDate?: () => Date;
    }
  | null
  | undefined;

type SchoolInvite = {
  id?: string;
  email?: string | null;
  role?: string;
  status?: string;
  createdAt?: TimestampLike;
  expiresAt?: TimestampLike;
  acceptedAt?: TimestampLike;
};

type InvitesResponse = {
  ok?: boolean;
  error?: string;
  schoolId?: string;
  invites?: SchoolInvite[];
};

type CreateInviteResponse = {
  ok?: boolean;
  error?: string;
  reason?: string;
  inviteId?: string;
  token?: string;
  emailSent?: boolean;
  warning?: string;
};

type LoadState = "idle" | "loading" | "success" | "error";

export default function SchoolInvitesPage() {
  const locale = useLocale();
  const t = useTranslations("schoolAdmin");
  const { user, profile, loading } = useUserProfile();
  const [state, setState] = useState<LoadState>("idle");
  const [invites, setInvites] = useState<SchoolInvite[]>([]);
  const [error, setError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [emailSent, setEmailSent] = useState<boolean | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [temporaryInviteLink, setTemporaryInviteLink] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const schoolId = profile?.schoolId ?? "";
  const hasSchoolAdminAccess =
    Boolean(schoolId) &&
    profile?.schoolRole === "school_admin" &&
    profile?.schoolStatus === "active";
  const pendingInvites = invites.filter((invite) => invite.status === "pending").length;
  const acceptedInvites = invites.filter((invite) => invite.status === "accepted").length;
  const filteredInvites = useMemo(() => {
    const q = search.trim().toLowerCase();

    return invites.filter((invite) => {
      const matchesStatus = statusFilter === "all" || invite.status === statusFilter;
      const matchesSearch =
        !q ||
        [invite.email, invite.role, invite.status, invite.id]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);

      return matchesStatus && matchesSearch;
    });
  }, [invites, search, statusFilter]);

  useEffect(() => {
    if (loading) return;

    if (!user || user.isAnonymous || !hasSchoolAdminAccess) {
      setState("idle");
      setInvites([]);
      return;
    }

    const signedInUser = user;
    let cancelled = false;

    async function loadInvites() {
      setState("loading");
      setError("");

      try {
        const authToken = await signedInUser.getIdToken();
        const response = await fetch(
          `/api/schools/${encodeURIComponent(schoolId)}/invites`,
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          }
        );
        const data = (await response.json().catch(() => ({}))) as InvitesResponse;

        if (cancelled) return;

        if (!response.ok || !data.ok) {
          setState("error");
          setError(data.error || t("invites.errorTitle"));
          setInvites([]);
          return;
        }

        setInvites(data.invites ?? []);
        setState("success");
      } catch (err: unknown) {
        if (cancelled) return;

        setState("error");
        setError(err instanceof Error ? err.message : t("invites.errorTitle"));
        setInvites([]);
      }
    }

    void loadInvites();

    return () => {
      cancelled = true;
    };
  }, [hasSchoolAdminAccess, loading, refreshKey, schoolId, t, user]);

  async function submitInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user || user.isAnonymous || !hasSchoolAdminAccess) return;

    const email = inviteEmail.trim();
    if (!email) {
      setInviteError(t("invites.emailRequired"));
      return;
    }

    setInviteLoading(true);
    setInviteMessage("");
    setEmailSent(null);
    setInviteError("");
    setTemporaryInviteLink("");

    try {
      const authToken = await user.getIdToken();
      const response = await fetch("/api/schools/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ schoolId, email, locale }),
      });
      const data = (await response.json().catch(() => ({}))) as CreateInviteResponse;

      if (!response.ok || !data.ok) {
        setInviteError(getInviteErrorMessage(data, t));
        return;
      }

      setInviteEmail("");
      setEmailSent(Boolean(data.emailSent));
      setInviteMessage(
        data.emailSent
          ? t("invites.createdSent")
          : t("invites.createdNoEmail")
      );

      if (data.token) {
        const origin = window.location.origin;
        const link = `${origin}/${locale}/school/accept?token=${encodeURIComponent(data.token)}`;
        setTemporaryInviteLink(link);
      }

      setRefreshKey((current) => current + 1);
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : t("invites.createError"));
    } finally {
      setInviteLoading(false);
    }
  }

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

  return (
    <main style={styles.page}>
      <SchoolNav locale={locale} active="invites" t={t} />

      <section style={styles.header}>
        <div>
          <div style={styles.kicker}>{t("invites.eyebrow")}</div>
          <h1 style={styles.title}>{t("invites.title")}</h1>
          <p style={styles.muted}>{t("invites.subtitle")}</p>
        </div>
      </section>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>{t("invites.inviteTitle")}</h2>
        <form onSubmit={submitInvite} style={styles.form}>
          <label style={styles.label}>
            {t("invites.email")}
            <input
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              type="email"
              placeholder={t("invites.emailPlaceholder")}
              style={styles.input}
              disabled={inviteLoading}
            />
          </label>
          <button type="submit" disabled={inviteLoading} style={styles.button}>
            {inviteLoading ? t("invites.sending") : t("invites.send")}
          </button>
        </form>

            {inviteMessage ? <div style={styles.successBox}>{inviteMessage}</div> : null}
        {temporaryInviteLink && inviteMessage && !inviteError ? (
          <p style={styles.muted}>
            {emailSent === false
              ? t("invites.fallbackText")
              : t("invites.controlText")}
          </p>
        ) : null}
        {inviteError ? <div style={styles.errorBox}>{inviteError}</div> : null}

        {temporaryInviteLink ? (
          <div style={styles.linkBox}>
            <div style={styles.infoLabel}>{t("invites.temporaryLink")}</div>
            <p style={styles.muted}>{t("invites.temporaryLinkText")}</p>
            <input readOnly value={temporaryInviteLink} style={styles.input} />
          </div>
        ) : null}
      </section>

      {state === "loading" ? (
        <section style={styles.card}>{t("invites.loading")}</section>
      ) : null}

      {state === "error" ? (
        <section style={styles.errorBox}>
          <strong>{t("invites.errorTitle")}</strong>
          <p style={{ margin: "6px 0 0" }}>{error}</p>
        </section>
      ) : null}

      {state === "success" ? (
        <>
          <section style={styles.statsGrid}>
            <StatCard label={t("invites.pending")} value={String(pendingInvites)} helper={t("invites.pendingText")} />
            <StatCard label={t("invites.accepted")} value={String(acceptedInvites)} helper={t("invites.acceptedText")} />
            <StatCard label={t("invites.total")} value={String(invites.length)} helper={t("invites.totalText")} />
          </section>

          <section style={styles.card}>
          <h2 style={styles.sectionTitle}>{t("invites.listTitle")}</h2>

          <div style={styles.toolbar}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("invites.searchPlaceholder")}
              style={styles.input}
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              style={styles.select}
            >
              <option value="all">{t("invites.allStatuses")}</option>
              <option value="pending">{t("invites.pending")}</option>
              <option value="accepted">{t("invites.accepted")}</option>
              <option value="expired">{t("invites.expired")}</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
              }}
              style={styles.secondaryButton}
            >
              {t("invites.reset")}
            </button>
            <span style={styles.countText}>
              {t("invites.showing")} <b>{filteredInvites.length}</b> {t("invites.of")} <b>{invites.length}</b>
            </span>
          </div>

          {filteredInvites.length === 0 ? (
            <p style={styles.muted}>
              {t("invites.empty")}
            </p>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <TableHeader>{t("invites.email")}</TableHeader>
                    <TableHeader>{t("invites.role")}</TableHeader>
                    <TableHeader>{t("invites.status")}</TableHeader>
                    <TableHeader>{t("invites.created")}</TableHeader>
                    <TableHeader>{t("invites.expires")}</TableHeader>
                    <TableHeader>{t("invites.acceptedAt")}</TableHeader>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvites.map((invite) => (
                    <tr key={invite.id ?? invite.email ?? "invite"}>
                      <TableCell>{invite.email || "-"}</TableCell>
                      <TableCell>{invite.role || "-"}</TableCell>
                      <TableCell>
                        <StatusPill status={invite.status ?? "-"} />
                      </TableCell>
                      <TableCell>{formatDate(invite.createdAt)}</TableCell>
                      <TableCell>{formatDate(invite.expiresAt)}</TableCell>
                      <TableCell>{formatDate(invite.acceptedAt)}</TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        </>
      ) : null}
    </main>
  );
}

function SchoolNav({
  locale,
  active,
  t,
}: {
  locale: string;
  active: "overview" | "teachers" | "invites";
  t: ReturnType<typeof useTranslations>;
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

function getInviteErrorMessage(data: CreateInviteResponse, t: ReturnType<typeof useTranslations>): string {
  if (data.error) return data.error;

  switch (data.reason) {
    case "school_not_found":
      return t("invites.schoolNotFound");
    case "school_not_active":
      return t("invites.schoolNotActive");
    case "pending_invite_exists":
      return t("invites.pendingInviteExists");
    default:
      return t("invites.createError");
  }
}

function formatDate(value: TimestampLike): string {
  if (!value) return "-";

  if (value instanceof Date) return formatDateObject(value);
  if (typeof value === "string" || typeof value === "number") {
    return formatDateObject(new Date(value));
  }

  if (typeof value.toDate === "function") {
    return formatDateObject(value.toDate());
  }

  if (typeof value.toMillis === "function") {
    return formatDateObject(new Date(value.toMillis()));
  }

  const seconds = value.seconds ?? value._seconds;
  const nanoseconds = value.nanoseconds ?? value._nanoseconds ?? 0;

  if (typeof seconds === "number") {
    return formatDateObject(new Date(seconds * 1000 + Math.floor(nanoseconds / 1_000_000)));
  }

  return "-";
}

function formatDateObject(date: Date): string {
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function TableHeader({ children }: { children: React.ReactNode }) {
  return <th style={styles.th}>{children}</th>;
}

function TableCell({ children }: { children: React.ReactNode }) {
  return <td style={styles.td}>{children}</td>;
}

function StatusPill({ status }: { status: string }) {
  const style =
    status === "pending"
      ? styles.pendingPill
      : status === "accepted"
        ? styles.acceptedPill
        : styles.neutralPill;

  return <span style={style}>{status}</span>;
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
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
      <p style={styles.statHelper}>{helper}</p>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "grid",
    gap: 16,
    maxWidth: 1120,
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
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  statCard: {
    padding: 16,
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "white",
  },
  statLabel: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: 800,
  },
  statValue: {
    marginTop: 8,
    color: "#0f172a",
    fontSize: 28,
    fontWeight: 900,
  },
  statHelper: {
    margin: "6px 0 0",
    color: "#64748b",
    fontSize: 13,
    lineHeight: 1.4,
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
  toolbar: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  form: {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 1fr) auto",
    gap: 10,
    alignItems: "end",
  },
  label: {
    display: "grid",
    gap: 6,
    fontSize: 13,
    fontWeight: 800,
    color: "#334155",
  },
  input: {
    width: "100%",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    background: "#ffffff",
    color: "#0f172a",
  },
  select: {
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    background: "#ffffff",
    color: "#0f172a",
    fontWeight: 700,
  },
  secondaryButton: {
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "10px 12px",
    background: "#ffffff",
    color: "#0f172a",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
  },
  countText: {
    color: "#64748b",
    fontSize: 13,
  },
  button: {
    border: "1px solid #0f766e",
    borderRadius: 10,
    padding: "10px 14px",
    fontWeight: 800,
    color: "#ffffff",
    background: "#0f766e",
    cursor: "pointer",
  },
  successBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    border: "1px solid #a7f3d0",
    background: "#ecfdf5",
    color: "#047857",
    fontWeight: 700,
  },
  linkBox: {
    display: "grid",
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    border: "1px solid #bfdbfe",
    background: "#eff6ff",
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
    minWidth: 860,
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
  pendingPill: {
    display: "inline-flex",
    borderRadius: 999,
    padding: "4px 9px",
    background: "#eff6ff",
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: 800,
  },
  acceptedPill: {
    display: "inline-flex",
    borderRadius: 999,
    padding: "4px 9px",
    background: "#ecfdf5",
    color: "#047857",
    fontSize: 12,
    fontWeight: 800,
  },
  neutralPill: {
    display: "inline-flex",
    borderRadius: 999,
    padding: "4px 9px",
    background: "#f1f5f9",
    color: "#475569",
    fontSize: 12,
    fontWeight: 800,
  },
};
