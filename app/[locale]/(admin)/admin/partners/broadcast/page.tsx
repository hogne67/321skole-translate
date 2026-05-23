"use client";

import Link from "next/link";
import { getAuth } from "firebase/auth";
import { useLocale } from "next-intl";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import AdminStatCard from "@/components/admin/AdminStatCard";

type BroadcastAudiencePartner = {
  uid?: string;
  email?: string | null;
  displayName?: string | null;
  partnerRegion?: string | null;
};

type BroadcastAudienceResponse = {
  ok?: boolean;
  error?: string;
  count?: number;
  partners?: BroadcastAudiencePartner[];
  broadcasts?: BroadcastHistoryItem[];
};

type BroadcastSendResponse = {
  ok?: boolean;
  error?: string;
  broadcastId?: string;
  recipientCount?: number;
};

type BroadcastHistoryItem = {
  id?: string;
  message?: string;
  recipientCount?: number;
  targeted?: boolean;
  createdAt?: string;
  createdBy?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return String(e);
}

function formatDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB");
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

export default function PartnerBroadcastPage() {
  const locale = useLocale();
  const [partners, setPartners] = useState<BroadcastAudiencePartner[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastHistoryItem[]>([]);
  const [messageText, setMessageText] = useState("");
  const [audienceSearch, setAudienceSearch] = useState("");
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadAudience() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const data = await authedFetch<BroadcastAudienceResponse>("/api/admin/partners/broadcast");
      const nextPartners = Array.isArray(data.partners) ? data.partners : [];
      setPartners(nextPartners);
      setSelectedUids(nextPartners.map((partner) => partner.uid).filter(Boolean) as string[]);
      setBroadcasts(Array.isArray(data.broadcasts) ? data.broadcasts : []);
    } catch (e: unknown) {
      setError(errorMessage(e));
      setPartners([]);
      setBroadcasts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAudience();
  }, []);

  const previewLines = useMemo(
    () => messageText.split("\n").filter((line) => line.trim().length > 0),
    [messageText]
  );

  const filteredPartners = useMemo(() => {
    const q = audienceSearch.trim().toLowerCase();
    if (!q) return partners;

    return partners.filter((partner) =>
      [partner.displayName, partner.email, partner.partnerRegion, partner.uid]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [audienceSearch, partners]);

  function setAllFiltered(checked: boolean) {
    const filteredUids = filteredPartners.map((partner) => partner.uid).filter(Boolean) as string[];

    setSelectedUids((current) => {
      if (!checked) return current.filter((uid) => !filteredUids.includes(uid));
      return Array.from(new Set([...current, ...filteredUids]));
    });
  }

  function togglePartner(uid: string, checked: boolean) {
    setSelectedUids((current) => {
      if (checked) return Array.from(new Set([...current, uid]));
      return current.filter((item) => item !== uid);
    });
  }

  async function sendBroadcast() {
    if (!messageText.trim()) {
      setError("Write a message before sending.");
      return;
    }

    if (selectedUids.length === 0) {
      setError("Select at least one partner before sending.");
      return;
    }

    const confirmed = window.confirm(
      `Send this message to ${selectedUids.length} selected partners?`
    );
    if (!confirmed) return;

    setSending(true);
    setError("");
    setMessage("");

    try {
      const data = await authedFetch<BroadcastSendResponse>("/api/admin/partners/broadcast", {
        method: "POST",
        body: JSON.stringify({ message: messageText, targetUids: selectedUids }),
      });

      setMessage(`Broadcast sent to ${data.recipientCount ?? partners.length} partners.`);
      setMessageText("");
      await loadAudience();
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div>
          <div style={styles.kicker}>PARTNER BROADCAST</div>
          <h1 style={styles.h1}>Send partner update</h1>
          <p style={styles.lead}>
            Send one visible message to all active 321school Partners.
          </p>
        </div>

        <div style={styles.actions}>
          <button onClick={loadAudience} disabled={loading || sending} style={styles.secondaryButton}>
            {loading ? "Loading..." : "Refresh audience"}
          </button>
          <Link href={`/${locale}/admin/partners`} style={styles.linkButton}>
            Partners
          </Link>
        </div>
      </section>

      <section style={styles.statsGrid}>
        <AdminStatCard
          title="Recipients"
          value={String(selectedUids.length)}
          text={`${partners.length} active partners available.`}
          tone="green"
        />
        <AdminStatCard
          title="Message length"
          value={String(messageText.length)}
          text="Maximum 4000 characters."
          tone="blue"
        />
      </section>

      {error ? <section style={styles.error}>Error: {error}</section> : null}
      {message ? <section style={styles.success}>{message}</section> : null}

      <section style={styles.grid}>
        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>Message</h2>
          <p style={styles.muted}>
            This will appear on each active partner's partner page.
          </p>
          <textarea
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            maxLength={4000}
            placeholder="Write a partner update..."
            style={styles.textarea}
          />
          <div style={styles.formFooter}>
            <span>{messageText.length} / 4000</span>
            <button
              onClick={sendBroadcast}
              disabled={sending || loading || partners.length === 0 || !messageText.trim()}
              style={styles.primaryButton}
            >
              {sending ? "Sending..." : "Send broadcast"}
            </button>
          </div>
        </section>

        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>Preview</h2>
          <div style={styles.previewBox}>
            {previewLines.length === 0 ? (
              <p style={styles.muted}>Your message preview will appear here.</p>
            ) : (
              previewLines.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)
            )}
          </div>
        </section>
      </section>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Broadcast history</h2>
        {broadcasts.length === 0 ? (
          <div style={styles.empty}>No broadcasts sent yet.</div>
        ) : null}
        <div style={styles.historyList}>
          {broadcasts.map((broadcast) => (
            <article key={broadcast.id ?? broadcast.createdAt ?? broadcast.message} style={styles.historyItem}>
              <div style={styles.historyMeta}>
                <div style={styles.historySummary}>
                  <strong>{broadcast.recipientCount ?? 0} recipients</strong>
                  <span style={broadcast.targeted ? styles.targetedBadge : styles.allBadge}>
                    {broadcast.targeted ? "Selected partners" : "All partners"}
                  </span>
                </div>
                <span>{formatDate(broadcast.createdAt)}</span>
              </div>
              <p style={styles.historyMessage}>{broadcast.message || "-"}</p>
            </article>
          ))}
        </div>
      </section>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Audience</h2>
        <div style={styles.audienceToolbar}>
          <input
            value={audienceSearch}
            onChange={(event) => setAudienceSearch(event.target.value)}
            placeholder="Search audience..."
            style={styles.input}
          />
          <button type="button" onClick={() => setAllFiltered(true)} style={styles.secondaryButton}>
            Select shown
          </button>
          <button type="button" onClick={() => setAllFiltered(false)} style={styles.secondaryButton}>
            Clear shown
          </button>
        </div>
        <div style={styles.countText}>
          {selectedUids.length} selected of {partners.length} active partners
        </div>
        {loading ? <div style={styles.empty}>Loading active partners...</div> : null}
        {!loading && filteredPartners.length === 0 ? (
          <div style={styles.empty}>No active partners found.</div>
        ) : null}
        <div style={styles.audienceList}>
          {filteredPartners.map((partner) => (
            <div key={partner.uid ?? partner.email ?? partner.displayName} style={styles.audienceItem}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={Boolean(partner.uid && selectedUids.includes(partner.uid))}
                  onChange={(event) => {
                    if (!partner.uid) return;
                    togglePartner(partner.uid, event.target.checked);
                  }}
                />
                <span>
                  <strong>{partner.displayName || partner.email || partner.uid}</strong>
                  <small>{partner.email || partner.partnerRegion || "-"}</small>
                </span>
              </label>
            </div>
          ))}
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
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
    gap: 16,
  },
  card: {
    border: "1px solid var(--admin-border, #e5e7eb)",
    borderRadius: "var(--admin-radius, 10px)",
    padding: 16,
    background: "var(--admin-surface, #ffffff)",
    boxShadow: "var(--admin-shadow, 0 1px 2px rgba(15, 23, 42, 0.05))",
  },
  audienceToolbar: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 14,
  },
  input: {
    flex: "1 1 220px",
    minWidth: 0,
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "10px 12px",
    color: "#0f172a",
    fontSize: 14,
  },
  countText: {
    marginTop: 10,
    color: "var(--admin-muted, #64748b)",
    fontSize: 14,
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
  textarea: {
    width: "100%",
    minHeight: 220,
    marginTop: 14,
    resize: "vertical",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: 12,
    color: "#0f172a",
    fontSize: 15,
    lineHeight: 1.5,
  },
  formFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 12,
    color: "var(--admin-muted, #64748b)",
    fontSize: 14,
  },
  previewBox: {
    marginTop: 14,
    minHeight: 220,
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    background: "#f8fafc",
    padding: 14,
    color: "#0f172a",
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
  },
  audienceList: {
    display: "grid",
    gap: 8,
    marginTop: 14,
  },
  historyList: {
    display: "grid",
    gap: 10,
    marginTop: 14,
  },
  historyItem: {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: 12,
    background: "#f8fafc",
  },
  historyMeta: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    color: "#64748b",
    fontSize: 13,
  },
  historySummary: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  targetedBadge: {
    border: "1px solid #bfdbfe",
    borderRadius: 999,
    padding: "3px 8px",
    background: "#eff6ff",
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: 800,
  },
  allBadge: {
    border: "1px solid #bbf7d0",
    borderRadius: 999,
    padding: "3px 8px",
    background: "#f0fdf4",
    color: "#15803d",
    fontSize: 12,
    fontWeight: 800,
  },
  historyMessage: {
    margin: "8px 0 0",
    color: "#0f172a",
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
  },
  audienceItem: {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: 10,
    background: "#f8fafc",
    color: "#475569",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
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
    marginTop: 14,
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
