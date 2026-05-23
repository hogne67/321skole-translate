"use client";

import Link from "next/link";
import { getAuth } from "firebase/auth";
import { useLocale } from "next-intl";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import AdminStatCard from "@/components/admin/AdminStatCard";
import AdminStatusBadge from "@/components/admin/AdminStatusBadge";

type PartnerInboxItem = {
  id?: string;
  targetUid?: string;
  message?: string;
  createdAt?: string;
  reviewedAt?: string;
  answeredAt?: string;
  partner?: {
    uid?: string;
    email?: string;
    displayName?: string;
    partnerRegion?: string;
    partnerLanguages?: string[];
  } | null;
};

type PartnerInboxResponse = {
  ok?: boolean;
  error?: string;
  items?: PartnerInboxItem[];
  handledItems?: PartnerInboxItem[];
  stats?: {
    needsReview?: number;
    handled?: number;
    partners?: number;
  };
};

const replyTemplates = [
  {
    label: "Thanks",
    text: "Thank you for the update. This is helpful, and I will follow up when I have reviewed it.",
  },
  {
    label: "More detail",
    text: "Thank you. Could you share a little more detail about this, especially what worked well and what was difficult?",
  },
  {
    label: "Schedule",
    text: "Thank you. I would like to schedule a short follow-up conversation about this.",
  },
];

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

export default function PartnerInboxPage() {
  const locale = useLocale();
  const [items, setItems] = useState<PartnerInboxItem[]>([]);
  const [handledItems, setHandledItems] = useState<PartnerInboxItem[]>([]);
  const [stats, setStats] = useState<PartnerInboxResponse["stats"]>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  async function loadInbox() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const data = await authedFetch<PartnerInboxResponse>("/api/admin/partners/inbox");
      setItems(Array.isArray(data.items) ? data.items : []);
      setHandledItems(Array.isArray(data.handledItems) ? data.handledItems : []);
      setStats(data.stats ?? {});
    } catch (e: unknown) {
      setError(errorMessage(e));
      setItems([]);
      setHandledItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInbox();
  }, []);

  async function markReviewed(item: PartnerInboxItem) {
    if (!item.id) return;

    setBusyId(item.id);
    setError("");
    setMessage("");

    try {
      await authedFetch(`/api/admin/partners/inbox/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
      });

      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setHandledItems((current) => [
        { ...item, reviewedAt: new Date().toISOString() },
        ...current,
      ].slice(0, 20));
      setStats((current) => ({
        needsReview: Math.max((current?.needsReview ?? items.length) - 1, 0),
        handled: (current?.handled ?? handledItems.length) + 1,
        partners: current?.partners ?? 0,
      }));
      setMessage("Reply marked as reviewed.");
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function answerReply(item: PartnerInboxItem) {
    if (!item.id) return;

    const draft = (replyDrafts[item.id] ?? "").trim();
    if (!draft) {
      setError("Write a reply before sending.");
      return;
    }

    setBusyId(item.id);
    setError("");
    setMessage("");

    try {
      await authedFetch(`/api/admin/partners/inbox/${encodeURIComponent(item.id)}`, {
        method: "POST",
        body: JSON.stringify({ message: draft }),
      });

      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setHandledItems((current) => [
        { ...item, reviewedAt: new Date().toISOString(), answeredAt: new Date().toISOString() },
        ...current,
      ].slice(0, 20));
      setReplyDrafts((current) => {
        const next = { ...current };
        delete next[item.id ?? ""];
        return next;
      });
      setStats((current) => ({
        needsReview: Math.max((current?.needsReview ?? items.length) - 1, 0),
        handled: (current?.handled ?? handledItems.length) + 1,
        partners: current?.partners ?? 0,
      }));
      setMessage("Reply sent and marked as reviewed.");
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  function applyTemplate(item: PartnerInboxItem, text: string) {
    if (!item.id) return;

    setReplyDrafts((current) => ({
      ...current,
      [item.id ?? ""]: text,
    }));
  }

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;

    return items.filter((item) =>
      [
        item.partner?.displayName,
        item.partner?.email,
        item.partner?.partnerRegion,
        item.message,
        ...(item.partner?.partnerLanguages ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [items, search]);

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div>
          <div style={styles.kicker}>PARTNER INBOX</div>
          <h1 style={styles.h1}>Partner replies</h1>
          <p style={styles.lead}>Replies from partners that still need admin review.</p>
        </div>

        <div style={styles.actions}>
          <button onClick={loadInbox} disabled={loading} style={styles.secondaryButton}>
            {loading ? "Loading..." : "Refresh"}
          </button>
          <Link href={`/${locale}/admin/partners`} style={styles.linkButton}>
            Partners
          </Link>
        </div>
      </section>

      <section style={styles.statsGrid}>
        <AdminStatCard
          title="Needs review"
          value={String(stats?.needsReview ?? items.length)}
          text="Partner replies waiting for review."
          tone="amber"
        />
        <AdminStatCard
          title="Partners"
          value={String(stats?.partners ?? 0)}
          text="Partners with open replies."
          tone="blue"
        />
        <AdminStatCard
          title="Handled"
          value={String(stats?.handled ?? handledItems.length)}
          text="Recently reviewed partner replies."
          tone="green"
        />
      </section>

      <section style={styles.toolbar}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search partner, email, language, message..."
          style={styles.input}
        />
        <div style={styles.count}>
          Showing <b>{filteredItems.length}</b> of <b>{items.length}</b>
        </div>
      </section>

      {error ? <section style={styles.error}>Error: {error}</section> : null}
      {message ? <section style={styles.success}>{message}</section> : null}

      <section style={styles.list}>
        {loading ? <div style={styles.empty}>Loading partner replies...</div> : null}

        {!loading && filteredItems.length === 0 ? (
          <div style={styles.empty}>No partner replies need review.</div>
        ) : null}

        {filteredItems.map((item) => {
          const partnerLabel =
            item.partner?.displayName || item.partner?.email || item.targetUid || "Unknown partner";
          const partnerHref = item.targetUid
            ? `/${locale}/admin/partners/${item.targetUid}`
            : `/${locale}/admin/partners`;

          return (
            <article key={item.id ?? item.createdAt ?? item.message} style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h2 style={styles.name}>{partnerLabel}</h2>
                  <div style={styles.email}>{item.partner?.email || item.targetUid || "-"}</div>
                </div>

                <AdminStatusBadge tone="amber">Needs review</AdminStatusBadge>
              </div>

              <p style={styles.message}>{item.message || "-"}</p>

              <div style={styles.metaRow}>
                <span>{formatDate(item.createdAt)}</span>
                <span>{item.partner?.partnerRegion || "-"}</span>
              </div>

              {item.id ? (
                <div style={styles.replyBox}>
                  <label style={styles.label}>
                    Quick reply
                    <textarea
                      value={replyDrafts[item.id] ?? ""}
                      onChange={(event) =>
                        setReplyDrafts((current) => ({
                          ...current,
                          [item.id ?? ""]: event.target.value,
                        }))
                      }
                      placeholder="Write a visible reply to this partner..."
                      maxLength={4000}
                      style={styles.textarea}
                    />
                  </label>
                  <div style={styles.templateRow}>
                    {replyTemplates.map((template) => (
                      <button
                        key={template.label}
                        type="button"
                        onClick={() => applyTemplate(item, template.text)}
                        style={styles.templateButton}
                      >
                        {template.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div style={styles.cardActions}>
                <button
                  onClick={() => answerReply(item)}
                  disabled={busyId === item.id || !item.id || !(replyDrafts[item.id] ?? "").trim()}
                  style={styles.primaryButton}
                >
                  {busyId === item.id ? "Sending..." : "Send reply"}
                </button>
                <Link href={partnerHref} style={styles.primaryLink}>
                  Open partner
                </Link>
                <button
                  onClick={() => markReviewed(item)}
                  disabled={busyId === item.id}
                  style={styles.secondaryButton}
                >
                  {busyId === item.id ? "Marking..." : "Mark reviewed"}
                </button>
              </div>
            </article>
          );
        })}
      </section>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Recently handled</h2>
        <p style={styles.helperText}>Latest partner replies that have been reviewed or answered.</p>

        {handledItems.length === 0 ? (
          <div style={styles.innerEmpty}>No handled replies yet.</div>
        ) : null}

        <div style={styles.handledList}>
          {handledItems.map((item) => {
            const partnerLabel =
              item.partner?.displayName || item.partner?.email || item.targetUid || "Unknown partner";
            const status = item.answeredAt ? "Answered" : "Reviewed";

            return (
              <article key={item.id ?? item.reviewedAt ?? item.message} style={styles.handledItem}>
                <div style={styles.handledHeader}>
                  <div>
                    <strong>{partnerLabel}</strong>
                    <div style={styles.email}>{item.partner?.email || item.targetUid || "-"}</div>
                  </div>
                  <AdminStatusBadge tone={item.answeredAt ? "green" : "blue"}>{status}</AdminStatusBadge>
                </div>
                <p style={styles.handledMessage}>{item.message || "-"}</p>
                <div style={styles.metaRow}>
                  <span>Received {formatDate(item.createdAt)}</span>
                  <span>Handled {formatDate(item.reviewedAt)}</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
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
  count: {
    color: "var(--admin-muted, #64748b)",
    fontSize: 14,
  },
  list: {
    display: "grid",
    gap: 12,
  },
  card: {
    border: "1px solid var(--admin-border, #e5e7eb)",
    borderRadius: "var(--admin-radius, 10px)",
    padding: 16,
    background: "var(--admin-surface, #ffffff)",
    boxShadow: "var(--admin-shadow, 0 1px 2px rgba(15, 23, 42, 0.05))",
  },
  helperText: {
    margin: "6px 0 0",
    color: "var(--admin-muted, #64748b)",
    lineHeight: 1.5,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
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
  message: {
    margin: "14px 0 0",
    color: "#0f172a",
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
  },
  metaRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 12,
    color: "var(--admin-muted, #64748b)",
    fontSize: 13,
  },
  replyBox: {
    display: "grid",
    gap: 8,
    marginTop: 14,
  },
  templateRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  templateButton: {
    border: "1px solid #cbd5e1",
    borderRadius: 999,
    padding: "6px 10px",
    background: "#ffffff",
    color: "#334155",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
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
    minHeight: 112,
    resize: "vertical",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: 12,
    color: "#0f172a",
    fontSize: 14,
    lineHeight: 1.5,
  },
  cardActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    marginTop: 14,
  },
  primaryLink: {
    border: "1px solid #2563eb",
    borderRadius: 8,
    padding: "9px 12px",
    background: "#2563eb",
    color: "#ffffff",
    fontWeight: 800,
    textDecoration: "none",
  },
  primaryButton: {
    border: "1px solid #2563eb",
    borderRadius: 8,
    padding: "9px 12px",
    background: "#2563eb",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
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
  empty: {
    border: "1px solid var(--admin-border, #e5e7eb)",
    borderRadius: "var(--admin-radius, 10px)",
    padding: 18,
    background: "var(--admin-surface, #ffffff)",
    color: "var(--admin-muted, #64748b)",
  },
  innerEmpty: {
    border: "1px solid var(--admin-border, #e5e7eb)",
    borderRadius: "var(--admin-radius, 10px)",
    padding: 14,
    background: "#f8fafc",
    color: "var(--admin-muted, #64748b)",
    marginTop: 14,
  },
  handledList: {
    display: "grid",
    gap: 10,
    marginTop: 14,
  },
  handledItem: {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: 12,
    background: "#f8fafc",
  },
  handledHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    flexWrap: "wrap",
  },
  handledMessage: {
    margin: "10px 0 0",
    color: "#0f172a",
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
  },
  error: {
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: 12,
    background: "#fef2f2",
    color: "#b91c1c",
  },
  success: {
    border: "1px solid #a7f3d0",
    borderRadius: 8,
    padding: 12,
    background: "#ecfdf5",
    color: "#047857",
  },
};
