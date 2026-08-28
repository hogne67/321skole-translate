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

type SchoolTeacher = {
  id?: string;
  uid?: string;
  email?: string | null;
  displayName?: string | null;
  role?: string;
  status?: string;
  joinedAt?: TimestampLike;
  disabledAt?: TimestampLike;
};

type SchoolInvite = {
  id?: string;
  email?: string | null;
  role?: string;
  status?: string;
  inviteToken?: string;
  createdAt?: TimestampLike;
  expiresAt?: TimestampLike;
  acceptedAt?: TimestampLike;
};

type TeachersResponse = {
  ok?: boolean;
  error?: string;
  teachers?: SchoolTeacher[];
};

type InvitesResponse = {
  ok?: boolean;
  error?: string;
  invites?: SchoolInvite[];
};

type SchoolSummary = {
  ok?: boolean;
  error?: string;
  school?: {
    name?: string;
    teacherSeatLimit?: number;
  };
  activeTeacherCount?: number;
  pendingTeacherInviteCount?: number;
  teacherSeatLimit?: number;
};

type ActionResponse = {
  ok?: boolean;
  error?: string;
  reason?: string;
  token?: string;
  emailSent?: boolean;
};

type LoadState = "idle" | "loading" | "success" | "error";
type SchoolAdminTranslator = ReturnType<typeof useTranslations>;

export default function SchoolTeachersPage() {
  const locale = useLocale();
  const t = useTranslations("schoolAdmin");
  const { user, profile, loading } = useUserProfile();
  const [state, setState] = useState<LoadState>("idle");
  const [teachers, setTeachers] = useState<SchoolTeacher[]>([]);
  const [invites, setInvites] = useState<SchoolInvite[]>([]);
  const [summary, setSummary] = useState<SchoolSummary | null>(null);
  const [error, setError] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [temporaryInviteLink, setTemporaryInviteLink] = useState("");
  const [temporaryInviteEmail, setTemporaryInviteEmail] = useState("");
  const [emailSent, setEmailSent] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0);

  const schoolId = profile?.schoolId ?? "";
  const hasSchoolAdminAccess =
    Boolean(schoolId) &&
    profile?.schoolRole === "school_admin" &&
    profile?.schoolStatus === "active";

  const activeTeachers = teachers.filter((teacher) => teacher.status === "active");
  const disabledTeachers = teachers.filter((teacher) => teacher.status !== "active");
  const pendingInvites = invites.filter((invite) => invite.status === "pending");
  const schoolName = String(summary?.school?.name ?? "").trim();
  const teacherSeatLimit =
    summary?.teacherSeatLimit ?? summary?.school?.teacherSeatLimit ?? activeTeachers.length;
  const committedTeacherSeats = activeTeachers.length + pendingInvites.length;
  const seatsRemaining = Math.max(teacherSeatLimit - committedTeacherSeats, 0);
  const seatUsagePercent =
    teacherSeatLimit > 0
      ? Math.min(Math.round((committedTeacherSeats / teacherSeatLimit) * 100), 100)
      : 0;
  const isSeatLimitReached = teacherSeatLimit > 0 && committedTeacherSeats >= teacherSeatLimit;

  const filteredTeachers = useMemo(() => {
    const q = search.trim().toLowerCase();

    return teachers.filter((teacher) => {
      const matchesStatus = statusFilter === "all" || teacher.status === statusFilter;
      const matchesSearch =
        !q ||
        [teacher.email, teacher.displayName, teacher.role, teacher.status, teacher.uid, teacher.id]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);

      return matchesStatus && matchesSearch;
    });
  }, [teachers, search, statusFilter]);

  useEffect(() => {
    if (loading) return;

    if (!user || user.isAnonymous || !hasSchoolAdminAccess) {
      setState("idle");
      setTeachers([]);
      setInvites([]);
      setSummary(null);
      return;
    }

    const signedInUser = user;
    let cancelled = false;

    async function loadSchoolAdminData() {
      setState("loading");
      setError("");

      try {
        const authToken = await signedInUser.getIdToken();
        const headers = { Authorization: `Bearer ${authToken}` };
        const [teachersResponse, invitesResponse, schoolResponse] = await Promise.all([
          fetch(`/api/schools/${encodeURIComponent(schoolId)}/teachers`, { headers }),
          fetch(`/api/schools/${encodeURIComponent(schoolId)}/invites`, { headers }),
          fetch(`/api/schools/${encodeURIComponent(schoolId)}`, { headers }),
        ]);
        const teachersData = (await teachersResponse.json().catch(() => ({}))) as TeachersResponse;
        const invitesData = (await invitesResponse.json().catch(() => ({}))) as InvitesResponse;
        const schoolData = (await schoolResponse.json().catch(() => ({}))) as SchoolSummary;

        if (cancelled) return;

        if (!teachersResponse.ok || !teachersData.ok) {
          setState("error");
          setError(teachersData.error || t("teachers.errorTitle"));
          return;
        }

        if (!invitesResponse.ok || !invitesData.ok) {
          setState("error");
          setError(invitesData.error || t("invites.errorTitle"));
          return;
        }

        if (!schoolResponse.ok || !schoolData.ok) {
          setState("error");
          setError(schoolData.error || t("overview.errorTitle"));
          return;
        }

        setTeachers(teachersData.teachers ?? []);
        setInvites(invitesData.invites ?? []);
        setSummary(schoolData);
        setState("success");
      } catch (err: unknown) {
        if (cancelled) return;

        setState("error");
        setError(err instanceof Error ? err.message : t("teachers.errorTitle"));
        setTeachers([]);
        setInvites([]);
        setSummary(null);
      }
    }

    void loadSchoolAdminData();

    return () => {
      cancelled = true;
    };
  }, [hasSchoolAdminAccess, loading, refreshKey, schoolId, t, user]);

  async function submitInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user || user.isAnonymous || !hasSchoolAdminAccess || actionId) return;

    const email = inviteEmail.trim();
    if (!email) {
      setActionError(t("invites.emailRequired"));
      return;
    }

    setActionId("invite");
    setActionMessage("");
    setActionError("");
    setTemporaryInviteLink("");
    setTemporaryInviteEmail("");
    setEmailSent(null);

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
      const data = (await response.json().catch(() => ({}))) as ActionResponse;

      if (!response.ok || !data.ok) {
        setActionError(getInviteErrorMessage(data, t));
        return;
      }

      setInviteEmail("");
      setTemporaryInviteEmail(email);
      setEmailSent(data.emailSent ?? null);
      setActionMessage(data.emailSent ? t("invites.createdSent") : t("invites.createdNoEmail"));

      if (data.token) {
        setTemporaryInviteLink(buildInviteLink(locale, data.token));
      }

      setRefreshKey((current) => current + 1);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : t("invites.createError"));
    } finally {
      setActionId(null);
    }
  }

  async function disableTeacher(teacher: SchoolTeacher) {
    await updateTeacherAccess({
      teacher,
      endpoint: "/api/schools/disable-teacher",
      confirmKey: "teachers.disableConfirm",
      successKey: "teachers.disabledMessage",
      fallbackErrorKey: "teachers.disableError",
      actionPrefix: "disable",
    });
  }

  async function activateTeacher(teacher: SchoolTeacher) {
    await updateTeacherAccess({
      teacher,
      endpoint: "/api/schools/activate-teacher",
      confirmKey: "teachers.activateConfirm",
      successKey: "teachers.activatedMessage",
      fallbackErrorKey: "teachers.activateError",
      actionPrefix: "activate",
    });
  }

  async function updateTeacherAccess({
    teacher,
    endpoint,
    confirmKey,
    successKey,
    fallbackErrorKey,
    actionPrefix,
  }: {
    teacher: SchoolTeacher;
    endpoint: string;
    confirmKey: "teachers.disableConfirm" | "teachers.activateConfirm";
    successKey: "teachers.disabledMessage" | "teachers.activatedMessage";
    fallbackErrorKey: "teachers.disableError" | "teachers.activateError";
    actionPrefix: "disable" | "activate";
  }) {
    if (!user || user.isAnonymous || !hasSchoolAdminAccess || actionId) return;

    const targetUid = teacher.uid ?? teacher.id ?? "";
    if (!targetUid) {
      setActionError(t("teachers.missingUid"));
      return;
    }

    const label = teacher.email || teacher.displayName || targetUid;
    if (!window.confirm(t(confirmKey, { label }))) return;

    setActionId(`${actionPrefix}:${targetUid}`);
    setActionMessage("");
    setActionError("");

    try {
      const authToken = await user.getIdToken();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ schoolId, targetUid }),
      });
      const data = (await response.json().catch(() => ({}))) as ActionResponse;

      if (!response.ok || !data.ok) {
        setActionError(getTeacherAccessErrorMessage(data, t, fallbackErrorKey));
        return;
      }

      setActionMessage(t(successKey));
      setRefreshKey((current) => current + 1);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : t(fallbackErrorKey));
    } finally {
      setActionId(null);
    }
  }

  async function createAndOpenInvitePrint(invite: SchoolInvite) {
    if (!user || user.isAnonymous || !hasSchoolAdminAccess || actionId) return;

    const inviteId = invite.id ?? "";
    if (!inviteId) return;

    setActionId(`invite-link:${inviteId}`);
    setActionError("");

    try {
      const authToken = await user.getIdToken();
      const response = await fetch("/api/schools/invite-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ schoolId, inviteId }),
      });
      const data = (await response.json().catch(() => ({}))) as ActionResponse;

      if (!response.ok || !data.ok || !data.token) {
        setActionError(getInviteLinkErrorMessage(data, t));
        return;
      }

      setRefreshKey((current) => current + 1);
      window.open(
        buildInvitationPrintHref({
          locale,
          link: buildInviteLink(locale, data.token),
          email: invite.email ?? "",
          schoolName,
          adminName: profile?.displayName || user?.displayName || user?.email || "",
        }),
        "_blank",
        "noopener,noreferrer"
      );
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : t("invites.linkError"));
    } finally {
      setActionId(null);
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
      <SchoolNav locale={locale} active="teachers" t={t} />

      <section style={styles.header}>
        <div>
          <div style={styles.kicker}>{t("teachers.eyebrow")}</div>
          <h1 style={styles.title}>{t("teachers.title")}</h1>
          <p style={styles.muted}>{t("teachers.combinedSubtitle")}</p>
        </div>
      </section>

      {state === "loading" ? <section style={styles.card}>{t("teachers.loading")}</section> : null}

      {state === "error" ? (
        <section style={styles.errorBox}>
          <strong>{t("teachers.errorTitle")}</strong>
          <p style={{ margin: "6px 0 0" }}>{error}</p>
        </section>
      ) : null}

      {state === "success" ? (
        <>
          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.sectionTitle}>{t("invites.inviteTitle")}</h2>
                <p style={styles.mutedCompact}>{t("teachers.inviteInlineText")}</p>
              </div>
              <strong style={styles.usageNumber}>{seatUsagePercent}%</strong>
            </div>

            <div style={styles.progressTrack} aria-hidden="true">
              <div
                style={{
                  ...styles.progressFill,
                  width: `${seatUsagePercent}%`,
                  background: isSeatLimitReached ? "#dc2626" : "#2563eb",
                }}
              />
            </div>

            <div style={styles.usageRow}>
              <span>
                {t("overview.seatUsage", {
                  used: activeTeachers.length,
                  limit: teacherSeatLimit,
                })}
              </span>
              <span>{t("overview.pendingSeatUsage", { count: pendingInvites.length })}</span>
              <span>{formatSeatsRemaining(t, seatsRemaining)}</span>
            </div>

            <form onSubmit={submitInvite} style={styles.form}>
              <label style={styles.label}>
                {t("invites.email")}
                <input
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  type="email"
                  placeholder={t("invites.emailPlaceholder")}
                  style={styles.input}
                  disabled={Boolean(actionId)}
                />
              </label>
              <button
                type="submit"
                disabled={Boolean(actionId) || isSeatLimitReached}
                style={{
                  ...styles.primaryButton,
                  opacity: Boolean(actionId) || isSeatLimitReached ? 0.55 : 1,
                }}
              >
                {actionId === "invite" ? t("invites.sending") : t("invites.send")}
              </button>
            </form>

            {isSeatLimitReached ? (
              <Notice title={t("overview.licenseFullTitle")} text={t("overview.licenseFullText")} />
            ) : null}
            {actionMessage ? <div style={styles.successBox}>{actionMessage}</div> : null}
            {actionError ? <div style={styles.errorBox}>{actionError}</div> : null}

            {temporaryInviteLink ? (
              <div style={styles.linkBox}>
                <div style={styles.infoLabel}>{t("invites.temporaryLink")}</div>
                <p style={styles.mutedCompact}>
                  {emailSent === false ? t("invites.fallbackText") : t("invites.controlText")}
                </p>
                <input readOnly value={temporaryInviteLink} style={styles.input} />
                <div style={styles.linkActions}>
                  <Link
                    href={buildInvitationPrintHref({
                      locale,
                      link: temporaryInviteLink,
                      email: temporaryInviteEmail,
                      schoolName,
                      adminName: profile?.displayName || user?.displayName || user?.email || "",
                    })}
                    target="_blank"
                    style={styles.secondaryLinkButton}
                  >
                    {t("invites.printInvitation")}
                  </Link>
                  <span style={styles.countText}>{t("invites.printInvitationText")}</span>
                </div>
              </div>
            ) : null}
          </section>

          <section style={styles.statsGrid}>
            <StatCard
              label={t("teachers.activeTeachers")}
              value={String(activeTeachers.length)}
              helper={t("teachers.activeTeachersText")}
            />
            <StatCard
              label={t("invites.pending")}
              value={String(pendingInvites.length)}
              helper={t("invites.pendingText")}
            />
            <StatCard
              label={t("teachers.disabled")}
              value={String(disabledTeachers.length)}
              helper={t("teachers.disabledText")}
            />
          </section>

          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.sectionTitle}>{t("teachers.listTitle")}</h2>
                <p style={styles.mutedCompact}>{t("teachers.listText")}</p>
              </div>
            </div>

            <div style={styles.toolbar}>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("teachers.searchPlaceholder")}
                style={styles.input}
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                style={styles.select}
              >
                <option value="all">{t("teachers.allStatuses")}</option>
                <option value="active">{t("teachers.active")}</option>
                <option value="disabled">{t("teachers.disabledStatus")}</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                }}
                style={styles.secondaryButton}
              >
                {t("teachers.reset")}
              </button>
              <span style={styles.countText}>
                {t("teachers.showing")} <b>{filteredTeachers.length}</b> {t("teachers.of")}{" "}
                <b>{teachers.length}</b>
              </span>
            </div>

            {filteredTeachers.length === 0 ? (
              <p style={styles.muted}>{t("teachers.empty")}</p>
            ) : (
              <div style={styles.list}>
                {filteredTeachers.map((teacher) => (
                  <TeacherRow
                    key={teacher.id ?? teacher.uid ?? teacher.email ?? "teacher"}
                    teacher={teacher}
                    actionId={actionId}
                    onActivate={activateTeacher}
                    onDisable={disableTeacher}
                    t={t}
                  />
                ))}
              </div>
            )}
          </section>

          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.sectionTitle}>{t("teachers.pendingInvitesTitle")}</h2>
                <p style={styles.mutedCompact}>{t("teachers.pendingInvitesText")}</p>
              </div>
            </div>

            {pendingInvites.length === 0 ? (
              <p style={styles.muted}>{t("teachers.noPendingInvites")}</p>
            ) : (
              <div style={styles.list}>
                {pendingInvites.map((invite) => (
                  <InviteRow
                    key={invite.id ?? invite.email ?? "invite"}
                    invite={invite}
                    locale={locale}
                    schoolName={schoolName}
                    adminName={profile?.displayName || user?.displayName || user?.email || ""}
                    loading={actionId === `invite-link:${invite.id}`}
                    onCreateLink={createAndOpenInvitePrint}
                    t={t}
                  />
                ))}
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
  active: "overview" | "teachers";
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

function TeacherRow({
  teacher,
  actionId,
  onActivate,
  onDisable,
  t,
}: {
  teacher: SchoolTeacher;
  actionId: string | null;
  onActivate: (teacher: SchoolTeacher) => void;
  onDisable: (teacher: SchoolTeacher) => void;
  t: SchoolAdminTranslator;
}) {
  const uid = teacher.uid ?? teacher.id ?? "";
  const isActive = teacher.status === "active";
  const busy = actionId === `activate:${uid}` || actionId === `disable:${uid}`;

  return (
    <article style={styles.rowCard}>
      <div style={styles.rowMain}>
        <div style={styles.rowTitle}>{teacher.email || teacher.displayName || uid || "-"}</div>
        <div style={styles.rowMeta}>
          {teacher.displayName || "-"} | {uid || "-"}
        </div>
      </div>
      <StatusPill status={teacher.status ?? "-"} />
      <div style={styles.rowDate}>
        {isActive ? t("teachers.joinedAt") : t("teachers.disabledAt")}
        <strong>{formatDate(isActive ? teacher.joinedAt : teacher.disabledAt)}</strong>
      </div>
      {isActive ? (
        <button
          type="button"
          onClick={() => onDisable(teacher)}
          disabled={Boolean(actionId)}
          style={styles.dangerButton}
        >
          {busy ? t("teachers.disabling") : t("teachers.disable")}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onActivate(teacher)}
          disabled={Boolean(actionId)}
          style={styles.primaryButtonSmall}
        >
          {busy ? t("teachers.activating") : t("teachers.activate")}
        </button>
      )}
    </article>
  );
}

function InviteRow({
  invite,
  locale,
  schoolName,
  adminName,
  loading,
  onCreateLink,
  t,
}: {
  invite: SchoolInvite;
  locale: string;
  schoolName: string;
  adminName: string;
  loading: boolean;
  onCreateLink: (invite: SchoolInvite) => void;
  t: SchoolAdminTranslator;
}) {
  const printHref = invite.inviteToken
    ? buildInvitationPrintHref({
        locale,
        link: buildInviteLink(locale, invite.inviteToken),
        email: invite.email ?? "",
        schoolName,
        adminName,
      })
    : "";

  return (
    <article style={styles.rowCard}>
      <div style={styles.rowMain}>
        <div style={styles.rowTitle}>{invite.email || "-"}</div>
        <div style={styles.rowMeta}>
          {t("invites.created")}: {formatDate(invite.createdAt)} | {t("invites.expires")}:{" "}
          {formatDate(invite.expiresAt)}
        </div>
      </div>
      <StatusPill status={invite.status ?? "-"} />
      {printHref ? (
        <Link href={printHref} target="_blank" style={styles.secondaryLinkButton}>
          {t("invites.print")}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => onCreateLink(invite)}
          disabled={loading}
          style={styles.secondaryButton}
        >
          {loading ? t("invites.creatingLink") : t("invites.createLink")}
        </button>
      )}
    </article>
  );
}

function StatCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <section style={styles.statCard}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
      <p style={styles.statHelper}>{helper}</p>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const style =
    status === "active" || status === "accepted"
      ? styles.activePill
      : status === "pending"
        ? styles.pendingPill
        : styles.disabledPill;

  return <span style={style}>{status}</span>;
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div style={styles.noticeDanger}>
      <strong>{title}</strong>
      <p style={{ margin: "4px 0 0" }}>{text}</p>
    </div>
  );
}

function getTeacherAccessErrorMessage(
  data: ActionResponse,
  t: SchoolAdminTranslator,
  fallbackKey: string
) {
  if (data.error) return data.error;

  switch (data.reason) {
    case "member_not_found":
      return t("teachers.memberNotFound");
    case "not_school_teacher":
      return t("teachers.notSchoolTeacher");
    case "already_active":
      return t("teachers.alreadyActive");
    case "school_not_found":
      return t("invites.schoolNotFound");
    case "school_not_active":
      return t("invites.schoolNotActive");
    case "invalid_seat_limit":
      return t("teachers.invalidSeatLimit");
    case "seat_limit_reached":
      return t("teachers.seatLimitReached");
    default:
      return t(fallbackKey);
  }
}

function getInviteErrorMessage(data: ActionResponse, t: SchoolAdminTranslator): string {
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

function getInviteLinkErrorMessage(data: ActionResponse, t: SchoolAdminTranslator): string {
  if (data.error) return data.error;

  switch (data.reason) {
    case "invite_not_found":
      return t("invites.inviteNotFound");
    case "invite_not_pending":
      return t("invites.inviteNotPending");
    default:
      return t("invites.linkError");
  }
}

function formatSeatsRemaining(t: SchoolAdminTranslator, count: number) {
  if (count <= 0) return t("overview.noSeatsRemaining");
  if (count === 1) return t("overview.oneSeatRemaining");
  return t("overview.seatsRemaining", { count });
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

function buildInviteLink(locale: string, token: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return `${origin}/${locale}/school/accept?token=${encodeURIComponent(token)}`;
}

function buildInvitationPrintHref({
  locale,
  link,
  email,
  schoolName,
  adminName,
}: {
  locale: string;
  link: string;
  email: string;
  schoolName: string;
  adminName: string;
}) {
  const params = new URLSearchParams({
    link,
    email,
    schoolName,
    adminName,
  });

  return `/${locale}/school/invites/print?${params.toString()}`;
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
    borderRadius: 16,
    border: "1px solid rgba(15,23,42,0.08)",
    background: "white",
  },
  nav: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    padding: 6,
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.08)",
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
    borderRadius: 16,
    border: "1px solid rgba(15,23,42,0.08)",
    background: "white",
  },
  cardHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 14,
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
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 850,
    color: "#0f172a",
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
  form: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "end",
    marginTop: 18,
  },
  label: {
    display: "grid",
    flex: "1 1 260px",
    gap: 6,
    fontSize: 13,
    fontWeight: 800,
    color: "#334155",
  },
  input: {
    width: "100%",
    minWidth: 0,
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
  primaryButton: {
    border: "1px solid #0f766e",
    borderRadius: 10,
    padding: "10px 14px",
    fontWeight: 850,
    color: "#ffffff",
    background: "#0f766e",
    cursor: "pointer",
  },
  primaryButtonSmall: {
    border: "1px solid #0f766e",
    borderRadius: 10,
    padding: "8px 11px",
    fontWeight: 850,
    color: "#ffffff",
    background: "#0f766e",
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "8px 11px",
    background: "#ffffff",
    color: "#0f172a",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
  },
  secondaryLinkButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "8px 11px",
    background: "#ffffff",
    color: "#0f172a",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
    textDecoration: "none",
  },
  dangerButton: {
    border: "1px solid #dc2626",
    borderRadius: 10,
    padding: "8px 11px",
    background: "#dc2626",
    color: "#ffffff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
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
  toolbar: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  countText: {
    color: "#64748b",
    fontSize: 13,
  },
  list: {
    display: "grid",
    gap: 10,
  },
  rowCard: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
  },
  rowMain: {
    flex: "1 1 260px",
    minWidth: 0,
  },
  rowTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: 850,
    wordBreak: "break-word",
  },
  rowMeta: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 12,
    lineHeight: 1.35,
    wordBreak: "break-word",
  },
  rowDate: {
    display: "grid",
    gap: 3,
    color: "#64748b",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  errorBox: {
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    border: "1px solid #fecaca",
    background: "#fef2f2",
    color: "#991b1b",
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
  linkBox: {
    display: "grid",
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    border: "1px solid #bfdbfe",
    background: "#eff6ff",
  },
  linkActions: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  infoLabel: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: 850,
  },
  activePill: {
    display: "inline-flex",
    borderRadius: 999,
    padding: "4px 9px",
    background: "#ecfdf5",
    color: "#047857",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  pendingPill: {
    display: "inline-flex",
    borderRadius: 999,
    padding: "4px 9px",
    background: "#eff6ff",
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  disabledPill: {
    display: "inline-flex",
    borderRadius: 999,
    padding: "4px 9px",
    background: "#f1f5f9",
    color: "#475569",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
};
