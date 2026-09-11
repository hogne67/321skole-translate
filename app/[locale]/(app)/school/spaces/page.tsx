"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { useUserProfile } from "@/lib/useUserProfile";

type SchoolSpace = {
  id: string;
  title?: string;
  code?: string;
  isOpen?: boolean;
  ownerId?: string;
  ownerName?: string;
  ownerEmail?: string;
  memberCount?: number;
  createdAt?: string | null;
};

type SpacesResponse = {
  ok?: boolean;
  error?: string;
  spaces?: SchoolSpace[];
};

type LoadState = "idle" | "loading" | "success" | "error";
type SchoolAdminTranslator = ReturnType<typeof useTranslations>;

export default function SchoolSpacesPage() {
  const locale = useLocale();
  const t = useTranslations("schoolAdmin");
  const { user, profile, loading } = useUserProfile();
  const [state, setState] = useState<LoadState>("idle");
  const [spaces, setSpaces] = useState<SchoolSpace[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showClosed, setShowClosed] = useState(true);

  const schoolId = profile?.schoolId ?? "";
  const hasSchoolAdminAccess =
    Boolean(schoolId) &&
    profile?.schoolRole === "school_admin" &&
    profile?.schoolStatus === "active";

  const filteredSpaces = useMemo(() => {
    const q = search.trim().toLowerCase();

    return spaces.filter((space) => {
      if (!showClosed && space.isOpen === false) return false;
      if (!q) return true;
      return [space.title, space.code, space.ownerName, space.ownerEmail, space.ownerId]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [search, showClosed, spaces]);

  useEffect(() => {
    if (loading) return;

    if (!user || user.isAnonymous || !hasSchoolAdminAccess) {
      setState("idle");
      setSpaces([]);
      return;
    }

    const signedInUser = user;
    let cancelled = false;

    async function loadSpaces() {
      setState("loading");
      setError("");

      try {
        const authToken = await signedInUser.getIdToken();
        const response = await fetch(`/api/schools/${encodeURIComponent(schoolId)}/spaces`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = (await response.json().catch(() => ({}))) as SpacesResponse;

        if (cancelled) return;

        if (!response.ok || !data.ok) {
          setState("error");
          setError(data.error || t("spaces.errorTitle"));
          setSpaces([]);
          return;
        }

        setSpaces(data.spaces ?? []);
        setState("success");
      } catch (err: unknown) {
        if (cancelled) return;
        setState("error");
        setError(err instanceof Error ? err.message : t("spaces.errorTitle"));
        setSpaces([]);
      }
    }

    void loadSpaces();

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

  return (
    <main style={styles.page}>
      <SchoolNav locale={locale} active="spaces" t={t} />

      <section style={styles.header}>
        <div>
          <div style={styles.kicker}>{t("spaces.eyebrow")}</div>
          <h1 style={styles.title}>{t("spaces.title")}</h1>
          <p style={styles.muted}>{t("spaces.subtitle")}</p>
        </div>
        <div style={styles.countPill}>{t("spaces.count", { count: spaces.length })}</div>
      </section>

      {state === "error" ? (
        <section style={styles.errorBox}>
          <strong>{t("spaces.errorTitle")}</strong>
          <p style={{ margin: "6px 0 0" }}>{error}</p>
        </section>
      ) : null}

      <section style={styles.card}>
        <div style={styles.toolbar}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("spaces.searchPlaceholder")}
            style={styles.search}
          />
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(event) => setShowClosed(event.target.checked)}
            />
            {t("spaces.showClosed")}
          </label>
        </div>

        {state === "loading" ? <p style={styles.muted}>{t("spaces.loading")}</p> : null}

        {state === "success" && filteredSpaces.length === 0 ? (
          <p style={styles.muted}>{t("spaces.empty")}</p>
        ) : null}

        <div style={styles.list}>
          {filteredSpaces.map((space) => (
            <article key={space.id} style={styles.spaceRow}>
              <div style={styles.spaceMain}>
                <div style={styles.rowTop}>
                  <h2 style={styles.spaceTitle}>{space.title || t("spaces.untitled")}</h2>
                  <span
                    style={{
                      ...styles.statusPill,
                      ...(space.isOpen ? styles.openPill : styles.closedPill),
                    }}
                  >
                    {space.isOpen ? t("spaces.open") : t("spaces.closed")}
                  </span>
                </div>
                <p style={styles.mutedCompact}>
                  {space.ownerName || t("spaces.unknownTeacher")}
                  {space.ownerEmail ? ` - ${space.ownerEmail}` : ""}
                </p>
                <div style={styles.metaRow}>
                  <span>{t("spaces.members", { count: space.memberCount ?? 0 })}</span>
                  {space.code ? <span>{t("spaces.code", { code: space.code })}</span> : null}
                  {space.createdAt ? (
                    <span>{t("spaces.created", { date: formatDate(space.createdAt, locale) })}</span>
                  ) : null}
                </div>
              </div>
              <div style={styles.actions}>
                <Link href={`/${locale}/teacher/spaces/${space.id}`} style={styles.primaryButton}>
                  {t("spaces.openSpace")}
                </Link>
                <Link href={`/${locale}/teacher/spaces/${space.id}/members`} style={styles.secondaryButton}>
                  {t("spaces.membersLink")}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function SchoolNav({
  locale,
  active,
  t,
}: {
  locale: string;
  active: "overview" | "teachers" | "spaces";
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
      <SchoolNavLink href={`/${locale}/school/spaces`} active={active === "spaces"}>
        {t("nav.spaces")}
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
    <Link
      href={href}
      style={{
        ...styles.navLink,
        ...(active ? styles.navLinkActive : null),
      }}
    >
      {children}
    </Link>
  );
}

function formatDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: "min(1120px, calc(100% - 32px))",
    margin: "0 auto",
    padding: "32px 0 56px",
    color: "#0f172a",
  },
  nav: {
    display: "flex",
    gap: 8,
    marginBottom: 18,
    flexWrap: "wrap",
  },
  navLink: {
    border: "1px solid #cbd5e1",
    borderRadius: 999,
    padding: "8px 14px",
    textDecoration: "none",
    color: "#334155",
    background: "#ffffff",
    fontWeight: 700,
    fontSize: 14,
  },
  navLinkActive: {
    borderColor: "#2563eb",
    background: "#eff6ff",
    color: "#1d4ed8",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
    alignItems: "flex-start",
    marginBottom: 18,
  },
  card: {
    background: "#ffffff",
    border: "1px solid #dbe3ef",
    borderRadius: 8,
    padding: 20,
    boxShadow: "0 1px 4px rgba(15, 23, 42, 0.05)",
  },
  kicker: {
    color: "#2563eb",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 34,
    lineHeight: 1.1,
    margin: "6px 0 8px",
  },
  muted: {
    color: "#475569",
    margin: 0,
    lineHeight: 1.55,
  },
  mutedCompact: {
    color: "#475569",
    margin: "4px 0 0",
    fontSize: 14,
    lineHeight: 1.45,
  },
  countPill: {
    border: "1px solid #bfdbfe",
    background: "#eff6ff",
    color: "#1d4ed8",
    borderRadius: 999,
    padding: "8px 12px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  errorBox: {
    border: "1px solid #fecaca",
    background: "#fff1f2",
    color: "#991b1b",
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  search: {
    flex: "1 1 260px",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
  },
  checkboxLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: "#334155",
    fontWeight: 700,
    fontSize: 14,
  },
  list: {
    display: "grid",
    gap: 10,
  },
  spaceRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  spaceMain: {
    minWidth: 0,
  },
  rowTop: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  spaceTitle: {
    margin: 0,
    fontSize: 18,
    lineHeight: 1.25,
  },
  statusPill: {
    borderRadius: 999,
    padding: "4px 9px",
    fontSize: 12,
    fontWeight: 800,
  },
  openPill: {
    color: "#047857",
    background: "#d1fae5",
    border: "1px solid #6ee7b7",
  },
  closedPill: {
    color: "#475569",
    background: "#f1f5f9",
    border: "1px solid #cbd5e1",
  },
  metaRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
    color: "#64748b",
    fontSize: 13,
  },
  actions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  primaryButton: {
    background: "#0f172a",
    color: "#ffffff",
    borderRadius: 8,
    padding: "9px 12px",
    textDecoration: "none",
    fontWeight: 800,
    fontSize: 14,
  },
  secondaryButton: {
    background: "#ffffff",
    color: "#0f172a",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "9px 12px",
    textDecoration: "none",
    fontWeight: 800,
    fontSize: 14,
  },
};
