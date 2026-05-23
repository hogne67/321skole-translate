"use client";

import Link from "next/link";
import { getAuth } from "firebase/auth";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

import AdminStatCard from "@/components/admin/AdminStatCard";
import AdminStatusBadge, { type AdminTone } from "@/components/admin/AdminStatusBadge";

type PartnerApplication = {
  id: string;
  uid?: string;
  email?: string;
  name?: string;
  city?: string;
  country?: string;
  languages?: string[];
  currentRole?: string;
  status?: string;
  createdAt?: string;
  reviewedAt?: string;
};

type ActivePartner = {
  id: string;
  uid: string;
  email?: string;
  displayName?: string;
  partnerStatus?: string;
  partnerLevel?: string;
  partnerRegion?: string;
  partnerLanguages?: string[];
  partnerApprovedAt?: string;
  partnerFollowUpStatus?: string;
  partnerFollowUpStatusUpdatedAt?: string;
  partnerReplyCount?: number;
  unreviewedPartnerReplyCount?: number;
  latestPartnerReplyAt?: string | null;
  latestUnreviewedPartnerReplyAt?: string | null;
  latestAdminContactAt?: string | null;
  latestContactAt?: string | null;
};

type PartnersResponse = {
  applications?: PartnerApplication[];
  activePartners?: ActivePartner[];
  stats?: {
    pending?: number;
    approved?: number;
    rejected?: number;
    active?: number;
    needsFollowUp?: number;
    waiting?: number;
    done?: number;
    partnerReplies?: number;
    unreviewedPartnerReplies?: number;
  };
};

type PartnerFollowUpStatus = "needs_follow_up" | "waiting" | "done";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return String(e);
}

async function authedFetch<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Not signed in");

  const token = await user.getIdToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  const raw = await res.text();
  let data: unknown = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }

  if (!res.ok) {
    const message =
      isRecord(data) && typeof data.error === "string"
        ? data.error
        : raw || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data as T;
}

function formatDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB");
}

function cleanValue(value?: string): string {
  if (!value) return "-";
  return value.replaceAll("_", " ");
}

function statusTone(status?: string): AdminTone {
  if (status === "approved" || status === "active") return "green";
  if (status === "pending") return "amber";
  return "slate";
}

function followUpTone(status?: string): AdminTone {
  if (status === "done") return "green";
  if (status === "waiting") return "blue";
  if (status === "needs_follow_up") return "amber";
  return "slate";
}

export default function AdminPartnersPage() {
  const locale = useLocale();
  const [applications, setApplications] = useState<PartnerApplication[]>([]);
  const [activePartners, setActivePartners] = useState<ActivePartner[]>([]);
  const [stats, setStats] = useState<PartnersResponse["stats"]>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyFollowUpId, setBusyFollowUpId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [copied, setCopied] = useState(false);
  const [copiedInviteText, setCopiedInviteText] = useState(false);

  const partnerApplyPath = `/${locale}/apply/321school-partner`;
  const partnerApplyUrl =
    typeof window === "undefined" ? partnerApplyPath : `${window.location.origin}${partnerApplyPath}`;
  const inviteText = `Hi,\n\nI would like to invite you to apply as a 321school Partner.\n\nYou can read the terms and apply here:\n${partnerApplyUrl}\n\nBest,\n321school`;

  async function load() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const data = await authedFetch<PartnersResponse>("/api/admin/partners");
      setApplications(Array.isArray(data.applications) ? data.applications : []);
      setActivePartners(Array.isArray(data.activePartners) ? data.activePartners : []);
      setStats(data.stats ?? {});
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const pendingApplications = useMemo(
    () => applications.filter((item) => (item.status || "pending") === "pending"),
    [applications]
  );

  const reviewedApplications = useMemo(
    () => applications.filter((item) => (item.status || "pending") !== "pending"),
    [applications]
  );

  const regionOptions = useMemo(() => {
    const values = [
      ...activePartners.map((item) => item.partnerRegion || ""),
      ...applications.map((item) => [item.city, item.country].filter(Boolean).join(", ")),
    ].filter(Boolean);

    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [activePartners, applications]);

  const languageOptions = useMemo(() => {
    const values = [
      ...activePartners.flatMap((item) => item.partnerLanguages ?? []),
      ...applications.flatMap((item) => item.languages ?? []),
    ].filter(Boolean);

    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [activePartners, applications]);

  const matchesSearch = useCallback((values: Array<string | number | null | undefined>) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;

    return values
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  }, [search]);

  const matchesStatus = useCallback((status?: string, unreviewedCount = 0) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "needs_review") return unreviewedCount > 0;
    return (status || "pending") === statusFilter;
  }, [statusFilter]);

  const matchesPartnerStatus = useCallback(
    (partnerStatus?: string, followUpStatus?: string, unreviewedCount = 0) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "needs_review") return unreviewedCount > 0;
      if (["needs_follow_up", "waiting", "done"].includes(statusFilter)) {
        return followUpStatus === statusFilter;
      }
      return (partnerStatus || "active") === statusFilter;
    },
    [statusFilter]
  );

  const matchesRegion = useCallback((region?: string) => {
    return regionFilter === "all" || region === regionFilter;
  }, [regionFilter]);

  const matchesLanguage = useCallback((languages?: string[]) => {
    return languageFilter === "all" || Boolean(languages?.includes(languageFilter));
  }, [languageFilter]);

  const filteredPendingApplications = useMemo(
    () =>
      pendingApplications.filter((item) => {
        const location = [item.city, item.country].filter(Boolean).join(", ");

        return (
          matchesSearch([
            item.name,
            item.email,
            item.city,
            item.country,
            item.currentRole,
            item.status,
            ...(item.languages ?? []),
          ]) &&
          matchesStatus(item.status || "pending") &&
          matchesRegion(location) &&
          matchesLanguage(item.languages)
        );
      }),
    [matchesLanguage, matchesRegion, matchesSearch, matchesStatus, pendingApplications]
  );

  const filteredActivePartners = useMemo(() => {
    return activePartners.filter(
      (item) =>
        matchesSearch([
          item.displayName,
          item.email,
          item.partnerRegion,
          item.partnerStatus,
          item.partnerLevel,
          item.partnerFollowUpStatus,
          item.latestContactAt,
          String(item.partnerReplyCount ?? 0),
          String(item.unreviewedPartnerReplyCount ?? 0),
          ...(item.partnerLanguages ?? []),
        ]) &&
        matchesPartnerStatus(
          item.partnerStatus || "active",
          item.partnerFollowUpStatus,
          item.unreviewedPartnerReplyCount ?? 0
        ) &&
        matchesRegion(item.partnerRegion) &&
        matchesLanguage(item.partnerLanguages)
    );
  }, [activePartners, matchesLanguage, matchesPartnerStatus, matchesRegion, matchesSearch]);

  const filteredApplications = useMemo(() => {
    return reviewedApplications.filter((item) => {
      const location = [item.city, item.country].filter(Boolean).join(", ");

      return (
        matchesSearch([
          item.name,
          item.email,
          item.city,
          item.country,
          item.currentRole,
          item.status,
          ...(item.languages ?? []),
        ]) &&
        matchesStatus(item.status || "pending") &&
        matchesRegion(location) &&
        matchesLanguage(item.languages)
      );
    });
  }, [matchesLanguage, matchesRegion, matchesSearch, matchesStatus, reviewedApplications]);

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
    setRegionFilter("all");
    setLanguageFilter("all");
  }

  async function review(item: PartnerApplication, action: "approve" | "reject") {
    setBusyId(item.id);
    setError(null);
    setMessage(null);

    try {
      await authedFetch("/api/admin/partners/review", {
        method: "POST",
        body: JSON.stringify({ id: item.id, action }),
      });

      setMessage(
        action === "approve"
          ? `${item.name || item.email || item.id} was approved as a partner.`
          : `${item.name || item.email || item.id} was rejected.`
      );
      await load();
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function updatePartnerFollowUp(partner: ActivePartner, status: PartnerFollowUpStatus) {
    setBusyFollowUpId(partner.uid);
    setError(null);
    setMessage(null);

    try {
      await authedFetch(`/api/admin/partners/${encodeURIComponent(partner.uid)}`, {
        method: "PATCH",
        body: JSON.stringify({ partnerFollowUpStatus: status }),
      });

      setActivePartners((current) =>
        current.map((item) =>
          item.uid === partner.uid
            ? {
                ...item,
                partnerFollowUpStatus: status,
                partnerFollowUpStatusUpdatedAt: new Date().toISOString(),
              }
            : item
        )
      );
      setMessage(`${partner.displayName || partner.email || partner.uid} follow-up status updated.`);
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusyFollowUpId(null);
    }
  }

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(partnerApplyUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Could not copy invitation link.");
    }
  }

  async function copyInviteText() {
    try {
      await navigator.clipboard.writeText(inviteText);
      setCopiedInviteText(true);
      window.setTimeout(() => setCopiedInviteText(false), 1800);
    } catch {
      setError("Could not copy invitation text.");
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div>
          <div style={styles.kicker}>ADMIN</div>
          <h1 style={styles.h1}>321school Partners</h1>
          <p style={styles.lead}>
            Review applications, see active partners, and share the partner invitation page.
          </p>
        </div>

        <div style={styles.actions}>
          <Link href={`/${locale}/admin/partners/inbox`} style={styles.primaryLink}>
            Partner inbox
          </Link>
          <Link href={`/${locale}/admin/partners/broadcast`} style={styles.linkButton}>
            Broadcast
          </Link>
          <button onClick={load} disabled={loading || Boolean(busyId)} style={styles.secondaryButton}>
            {loading ? "Loading..." : "Refresh"}
          </button>
          <Link href={`/${locale}/admin`} style={styles.linkButton}>
            Dashboard
          </Link>
        </div>
      </section>

      <section style={styles.statsGrid}>
        <AdminStatCard
          title="Active partners"
          value={String(stats?.active ?? activePartners.length)}
          text="Approved users with active partner access."
          tone="green"
        />
        <AdminStatCard
          title="Pending"
          value={String(stats?.pending ?? pendingApplications.length)}
          text="Applications waiting for review."
          tone="amber"
        />
        <AdminStatCard
          title="Needs review"
          value={String(stats?.unreviewedPartnerReplies ?? 0)}
          text="Partner replies waiting for admin review."
          tone="amber"
        />
        <AdminStatCard
          title="Needs follow-up"
          value={String(stats?.needsFollowUp ?? 0)}
          text="Partners marked for follow-up."
          tone="amber"
        />
        <AdminStatCard
          title="Waiting"
          value={String(stats?.waiting ?? 0)}
          text="Partners where you are waiting."
          tone="blue"
        />
        <AdminStatCard
          title="Done"
          value={String(stats?.done ?? 0)}
          text="Partners handled for now."
          tone="green"
        />
        <AdminStatCard
          title="Partner replies"
          value={String(stats?.partnerReplies ?? 0)}
          text="Replies sent back from partners."
          tone="blue"
        />
        <AdminStatCard
          title="Approved"
          value={String(stats?.approved ?? 0)}
          text="Approved partner applications."
          tone="slate"
        />
        <AdminStatCard
          title="Rejected"
          value={String(stats?.rejected ?? 0)}
          text="Applications that were not approved."
          tone="slate"
        />
      </section>

      <section style={styles.card}>
        <div style={styles.inviteHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Send partner invitation</h2>
            <p style={styles.muted}>
              Share this link with people you want to invite to apply as 321school Partners.
            </p>
          </div>
          <Link href={partnerApplyPath} style={styles.linkButton}>
            Open page
          </Link>
        </div>

        <div style={styles.inviteRow}>
          <input value={partnerApplyUrl} readOnly style={styles.input} />
          <button onClick={copyInviteLink} type="button" style={styles.primaryButton}>
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <div style={styles.inviteMessageBox}>
          <label style={styles.label}>
            Suggested invitation message
            <textarea value={inviteText} readOnly style={styles.textarea} />
          </label>
          <button onClick={copyInviteText} type="button" style={styles.secondaryButton}>
            {copiedInviteText ? "Copied" : "Copy invitation text"}
          </button>
        </div>
      </section>

      <section style={styles.toolbar}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, country, language, status..."
          style={styles.input}
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          style={styles.select}
        >
          <option value="all">All statuses</option>
          <option value="needs_review">Needs review</option>
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="needs_follow_up">Needs follow-up</option>
          <option value="waiting">Waiting</option>
          <option value="done">Done</option>
        </select>
        <select
          value={regionFilter}
          onChange={(event) => setRegionFilter(event.target.value)}
          style={styles.select}
        >
          <option value="all">All regions</option>
          {regionOptions.map((region) => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </select>
        <select
          value={languageFilter}
          onChange={(event) => setLanguageFilter(event.target.value)}
          style={styles.select}
        >
          <option value="all">All languages</option>
          {languageOptions.map((language) => (
            <option key={language} value={language}>
              {language}
            </option>
          ))}
        </select>
        <button type="button" onClick={resetFilters} style={styles.secondaryButton}>
          Reset
        </button>
        <div style={styles.count}>
          Showing <b>{filteredPendingApplications.length}</b> pending,{" "}
          <b>{filteredActivePartners.length}</b> active partners and{" "}
          <b>{filteredApplications.length}</b> reviewed applications
        </div>
      </section>

      {error ? <section style={styles.error}>Error: {error}</section> : null}
      {message ? <section style={styles.success}>{message}</section> : null}

      <section style={styles.sectionStack}>
        <div>
          <h2 style={styles.sectionTitle}>Pending applications</h2>
          <p style={styles.muted}>Applications waiting for approval or rejection.</p>
        </div>

        {loading ? <div style={styles.empty}>Loading partner applications...</div> : null}

        {!loading && filteredPendingApplications.length === 0 ? (
          <div style={styles.empty}>
            No pending partner applications found. Share the invitation link above when you are
            ready to invite more partner candidates.
          </div>
        ) : null}

        {filteredPendingApplications.map((item) => {
          const disabled = Boolean(busyId);
          const isBusy = busyId === item.id;

          return (
            <PartnerApplicationCard key={item.id} item={item} locale={locale}>
              <div style={styles.reviewActions}>
                <button
                  onClick={() => review(item, "approve")}
                  disabled={disabled}
                  style={{ ...styles.approveButton, opacity: disabled && !isBusy ? 0.55 : 1 }}
                >
                  {isBusy ? "Working..." : "Approve"}
                </button>
                <button
                  onClick={() => review(item, "reject")}
                  disabled={disabled}
                  style={{ ...styles.rejectButton, opacity: disabled && !isBusy ? 0.55 : 1 }}
                >
                  {isBusy ? "Working..." : "Reject"}
                </button>
              </div>
            </PartnerApplicationCard>
          );
        })}
      </section>

      <section style={styles.sectionStack}>
        <div>
          <h2 style={styles.sectionTitle}>Active partners</h2>
          <p style={styles.muted}>Users who currently have active partner access.</p>
        </div>

        {!loading && filteredActivePartners.length === 0 ? (
          <div style={styles.empty}>
            No active partners found. Try resetting the filters, or approve a pending application
            when a partner is ready.
          </div>
        ) : null}

        {filteredActivePartners.map((partner) => (
          <article key={partner.uid} style={styles.card}>
            <div style={styles.cardMain}>
              <div>
                <h3 style={styles.name}>{partner.displayName || partner.email || partner.uid}</h3>
                <div style={styles.email}>{partner.email || partner.uid}</div>
                <div style={styles.lastContact}>
                  Last contact: {formatDate(partner.latestContactAt ?? undefined)}
                </div>
              </div>

              <div style={styles.partnerWorkArea}>
                <div style={styles.cardActions}>
                  {(partner.unreviewedPartnerReplyCount ?? 0) > 0 ? (
                    <span style={styles.reviewBadge}>
                      {partner.unreviewedPartnerReplyCount} needs review
                    </span>
                  ) : null}
                  {(partner.partnerReplyCount ?? 0) > 0 ? (
                    <span style={styles.replyBadge}>{partner.partnerReplyCount} replies</span>
                  ) : null}
                  <AdminStatusBadge tone={statusTone(partner.partnerStatus)}>
                    {cleanValue(partner.partnerStatus || "active")}
                  </AdminStatusBadge>
                  <AdminStatusBadge tone={followUpTone(partner.partnerFollowUpStatus)}>
                    {cleanValue(partner.partnerFollowUpStatus || "not set")}
                  </AdminStatusBadge>
                </div>

                <div style={styles.partnerControls}>
                  <select
                    value={partner.partnerFollowUpStatus || "needs_follow_up"}
                    onChange={(event) =>
                      updatePartnerFollowUp(
                        partner,
                        event.target.value as PartnerFollowUpStatus
                      )
                    }
                    disabled={busyFollowUpId === partner.uid}
                    style={styles.compactSelect}
                    aria-label="Update follow-up status"
                  >
                    <option value="needs_follow_up">Needs follow-up</option>
                    <option value="waiting">Waiting</option>
                    <option value="done">Done</option>
                  </select>
                  <Link href={`/${locale}/admin/partners/${partner.uid}`} style={styles.smallLink}>
                    View details
                  </Link>
                </div>
              </div>
            </div>

            <dl style={styles.details}>
              <DetailItem label="Region" value={partner.partnerRegion || "-"} />
              <DetailItem
                label="Languages"
                value={partner.partnerLanguages?.length ? partner.partnerLanguages.join(", ") : "-"}
              />
              <DetailItem label="Level" value={cleanValue(partner.partnerLevel)} />
              <DetailItem label="Approved" value={formatDate(partner.partnerApprovedAt)} />
              <DetailItem
                label="Follow-up"
                value={cleanValue(partner.partnerFollowUpStatus || "not set")}
              />
              <DetailItem
                label="Latest reply"
                value={formatDate(partner.latestPartnerReplyAt ?? undefined)}
              />
              <DetailItem
                label="Latest admin contact"
                value={formatDate(partner.latestAdminContactAt ?? undefined)}
              />
              <DetailItem
                label="Latest unreviewed"
                value={formatDate(partner.latestUnreviewedPartnerReplyAt ?? undefined)}
              />
            </dl>
          </article>
        ))}
      </section>

      <section style={styles.sectionStack}>
        <div>
          <h2 style={styles.sectionTitle}>Reviewed applications</h2>
          <p style={styles.muted}>Approved and rejected applications kept for overview.</p>
        </div>

        {!loading && filteredApplications.length === 0 ? (
          <div style={styles.empty}>
            No reviewed applications found. Reviewed partner applications will stay here after you
            approve or reject them.
          </div>
        ) : null}

        {filteredApplications.map((item) => (
          <PartnerApplicationCard key={item.id} item={item} locale={locale} />
        ))}
      </section>
    </main>
  );
}

function PartnerApplicationCard({
  item,
  locale,
  children,
}: {
  item: PartnerApplication;
  locale: string;
  children?: React.ReactNode;
}) {
  const location = [item.city, item.country].filter(Boolean).join(", ");

  return (
    <article style={styles.card}>
      <div style={styles.cardMain}>
        <div>
          <h3 style={styles.name}>{item.name || "(no name)"}</h3>
          <div style={styles.email}>{item.email || "-"}</div>
        </div>

        <div style={styles.cardActions}>
          <AdminStatusBadge tone={statusTone(item.status)}>
            {cleanValue(item.status || "pending")}
          </AdminStatusBadge>
          <Link href={`/${locale}/admin/partners/${item.id}`} style={styles.smallLink}>
            View details
          </Link>
        </div>
      </div>

      <dl style={styles.details}>
        <DetailItem label="Location" value={location || "-"} />
        <DetailItem label="Languages" value={item.languages?.length ? item.languages.join(", ") : "-"} />
        <DetailItem label="Role" value={cleanValue(item.currentRole)} />
        <DetailItem label="Created" value={formatDate(item.createdAt)} />
        <DetailItem label="Reviewed" value={formatDate(item.reviewedAt)} />
      </dl>

      {children}
    </article>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: "grid",
    gap: 16,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    flexWrap: "wrap",
    border: "1px solid var(--admin-border, #e5e7eb)",
    borderRadius: "var(--admin-radius, 10px)",
    padding: 18,
    background: "var(--admin-surface, #ffffff)",
    boxShadow: "var(--admin-shadow, 0 1px 2px rgba(15, 23, 42, 0.05))",
  },
  kicker: {
    fontSize: 12,
    fontWeight: 900,
    color: "#2563eb",
  },
  h1: {
    margin: "4px 0 0",
    fontSize: 26,
    letterSpacing: 0,
  },
  lead: {
    margin: "8px 0 0",
    color: "var(--admin-muted, #64748b)",
  },
  actions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  inviteHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  inviteRow: {
    display: "flex",
    gap: 10,
    marginTop: 14,
    flexWrap: "wrap",
  },
  inviteMessageBox: {
    display: "grid",
    gap: 10,
    marginTop: 14,
  },
  toolbar: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    border: "1px solid var(--admin-border, #e5e7eb)",
    borderRadius: "var(--admin-radius, 10px)",
    padding: 14,
    background: "var(--admin-surface, #ffffff)",
  },
  input: {
    flex: "1 1 280px",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 15,
    minWidth: 0,
  },
  select: {
    flex: "0 1 170px",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "10px 12px",
    background: "#ffffff",
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 700,
    minWidth: 150,
  },
  compactSelect: {
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "6px 9px",
    background: "#ffffff",
    color: "#0f172a",
    fontSize: 13,
    fontWeight: 800,
    minHeight: 32,
  },
  label: {
    display: "grid",
    gap: 7,
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 800,
  },
  textarea: {
    width: "100%",
    minHeight: 132,
    resize: "vertical",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: 12,
    color: "#0f172a",
    fontSize: 14,
    lineHeight: 1.5,
  },
  count: {
    color: "var(--admin-muted, #64748b)",
    fontSize: 14,
  },
  sectionStack: {
    display: "grid",
    gap: 12,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: 0,
  },
  muted: {
    margin: "6px 0 0",
    color: "var(--admin-muted, #64748b)",
    lineHeight: 1.5,
  },
  card: {
    border: "1px solid var(--admin-border, #e5e7eb)",
    borderRadius: "var(--admin-radius, 10px)",
    padding: 16,
    background: "var(--admin-surface, #ffffff)",
    boxShadow: "var(--admin-shadow, 0 1px 2px rgba(15, 23, 42, 0.05))",
  },
  cardMain: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  cardActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  partnerWorkArea: {
    display: "grid",
    gap: 10,
    justifyItems: "end",
  },
  partnerControls: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  name: {
    margin: 0,
    fontSize: 18,
    letterSpacing: 0,
  },
  email: {
    marginTop: 4,
    color: "var(--admin-muted, #64748b)",
  },
  lastContact: {
    marginTop: 8,
    color: "#334155",
    fontSize: 13,
    fontWeight: 800,
  },
  details: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
    margin: "16px 0 0",
  },
  reviewActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 16,
  },
  approveButton: {
    border: "1px solid #047857",
    borderRadius: 8,
    padding: "10px 14px",
    background: "#047857",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
  },
  rejectButton: {
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: "10px 14px",
    background: "#ffffff",
    color: "#b91c1c",
    fontWeight: 800,
    cursor: "pointer",
  },
  primaryButton: {
    border: "1px solid #2563eb",
    borderRadius: 8,
    padding: "10px 14px",
    background: "#2563eb",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
  },
  primaryLink: {
    border: "1px solid #2563eb",
    borderRadius: 8,
    padding: "10px 14px",
    background: "#2563eb",
    color: "#ffffff",
    fontWeight: 800,
    textDecoration: "none",
  },
  secondaryButton: {
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "10px 14px",
    background: "#ffffff",
    color: "#111827",
    fontWeight: 800,
    cursor: "pointer",
  },
  linkButton: {
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "10px 14px",
    background: "#ffffff",
    color: "#111827",
    fontWeight: 800,
    textDecoration: "none",
  },
  smallLink: {
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "6px 9px",
    background: "#ffffff",
    color: "#111827",
    fontSize: 13,
    fontWeight: 800,
    textDecoration: "none",
  },
  replyBadge: {
    border: "1px solid #bfdbfe",
    borderRadius: 999,
    padding: "5px 9px",
    background: "#eff6ff",
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  reviewBadge: {
    border: "1px solid #fde68a",
    borderRadius: 999,
    padding: "5px 9px",
    background: "#fffbeb",
    color: "#b45309",
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  empty: {
    border: "1px solid var(--admin-border, #e5e7eb)",
    borderRadius: "var(--admin-radius, 10px)",
    padding: 18,
    background: "var(--admin-surface, #ffffff)",
    color: "var(--admin-muted, #64748b)",
  },
  success: {
    border: "1px solid #a7f3d0",
    borderRadius: 8,
    padding: 12,
    background: "#ecfdf5",
    color: "#047857",
  },
  error: {
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: 12,
    background: "#fef2f2",
    color: "#b91c1c",
  },
};
