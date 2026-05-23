"use client";

import { getIdToken } from "firebase/auth";
import { useCallback, useEffect, useState, type CSSProperties } from "react";

import { useUserProfile } from "@/lib/useUserProfile";

type PartnerMessage = {
  id?: string;
  message?: string;
  createdAt?: string;
  type?: string;
};

type PartnerMessagesResponse = {
  ok?: boolean;
  error?: string;
  messages?: PartnerMessage[];
};

function formatDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB");
}

function cleanValue(value?: string): string {
  if (!value) return "Message";
  return value.replaceAll("_", " ");
}

export default function PartnerPage() {
  const { user, profile, loading } = useUserProfile();
  const [messages, setMessages] = useState<PartnerMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const hasPartnerAccess = profile?.partnerAccess === true && profile?.partnerStatus === "active";

  const loadMessages = useCallback(async () => {
    if (loading) return;

    if (!user || user.isAnonymous || !hasPartnerAccess) {
      setMessages([]);
      setMessagesLoading(false);
      return;
    }

    setMessagesLoading(true);
    setError("");

    try {
      const token = await getIdToken(user, true);
      const response = await fetch("/api/partner/messages", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = (await response.json().catch(() => ({}))) as PartnerMessagesResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error || `Could not load messages (${response.status})`);
      }

      setMessages(data.messages ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  }, [hasPartnerAccess, loading, user]);

  useEffect(() => {
    let alive = true;

    async function run() {
      await loadMessages();
      if (!alive) return;
    }

    void run();

    return () => {
      alive = false;
    };
  }, [loadMessages]);

  async function sendReply() {
    if (!user || user.isAnonymous || !replyText.trim()) return;

    setSending(true);
    setError("");
    setNotice("");

    try {
      const token = await getIdToken(user, true);
      const response = await fetch("/api/partner/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: replyText }),
      });
      const data = (await response.json().catch(() => ({}))) as PartnerMessagesResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error || `Could not send reply (${response.status})`);
      }

      setReplyText("");
      setNotice("Reply sent.");
      await loadMessages();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  if (loading || messagesLoading) {
    return <main style={styles.page}>Loading partner page...</main>;
  }

  if (!hasPartnerAccess) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <div style={styles.kicker}>321school Partner</div>
          <h1 style={styles.h1}>No partner access</h1>
          <p style={styles.muted}>This page is only available for active 321school Partners.</p>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div>
          <div style={styles.kicker}>321school Partner</div>
          <h1 style={styles.h1}>Partner messages</h1>
          <p style={styles.muted}>
            Messages and updates shared with you by the 321school team.
          </p>
        </div>
        <span style={styles.statusPill}>Active</span>
      </section>

      {error ? <section style={styles.error}>Error: {error}</section> : null}
      {notice ? <section style={styles.success}>{notice}</section> : null}

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Reply to 321school</h2>
        <p style={styles.muted}>
          Send a short reply or update. Your message will be visible to the 321school team.
        </p>
        <textarea
          value={replyText}
          onChange={(event) => setReplyText(event.target.value)}
          maxLength={4000}
          placeholder="Write a reply..."
          style={styles.textarea}
        />
        <div style={styles.replyActions}>
          <span style={styles.counter}>{replyText.length} / 4000</span>
          <button
            onClick={sendReply}
            disabled={sending || !replyText.trim()}
            style={styles.primaryButton}
          >
            {sending ? "Sending..." : "Send reply"}
          </button>
        </div>
      </section>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Messages</h2>

        {messages.length === 0 ? (
          <div style={styles.empty}>No partner messages yet.</div>
        ) : null}

        <div style={styles.messageList}>
          {messages.map((item) => (
            <article key={item.id ?? item.createdAt ?? item.message} style={styles.messageCard}>
              <div style={styles.messageMeta}>
                <span>{cleanValue(item.type)}</span>
                <span>{formatDate(item.createdAt)}</span>
              </div>
              <p style={styles.messageText}>{item.message || "-"}</p>
            </article>
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
    maxWidth: 960,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    flexWrap: "wrap",
    border: "1px solid rgba(15,23,42,0.10)",
    borderRadius: 8,
    padding: 18,
    background: "#ffffff",
    boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
  },
  card: {
    border: "1px solid rgba(15,23,42,0.10)",
    borderRadius: 8,
    padding: 18,
    background: "#ffffff",
    boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
  },
  kicker: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
  },
  h1: {
    margin: "4px 0 0",
    color: "#0f172a",
    fontSize: 28,
    letterSpacing: 0,
  },
  muted: {
    margin: "8px 0 0",
    color: "#64748b",
    lineHeight: 1.55,
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 28,
    border: "1px solid #bbf7d0",
    borderRadius: 999,
    background: "#f0fdf4",
    color: "#15803d",
    padding: "5px 9px",
    fontSize: 12,
    fontWeight: 900,
  },
  sectionTitle: {
    margin: 0,
    color: "#0f172a",
    fontSize: 18,
    fontWeight: 900,
  },
  messageList: {
    display: "grid",
    gap: 10,
    marginTop: 14,
  },
  messageCard: {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: 14,
    background: "#f8fafc",
  },
  messageMeta: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    color: "#64748b",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
  },
  messageText: {
    margin: "8px 0 0",
    color: "#0f172a",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
  },
  textarea: {
    width: "100%",
    minHeight: 140,
    marginTop: 14,
    resize: "vertical",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: 12,
    color: "#0f172a",
    fontSize: 15,
    lineHeight: 1.5,
  },
  replyActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 12,
  },
  counter: {
    color: "#64748b",
    fontSize: 13,
  },
  primaryButton: {
    border: "1px solid #0f766e",
    borderRadius: 8,
    padding: "10px 14px",
    background: "#0f766e",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
  },
  empty: {
    marginTop: 14,
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: 14,
    background: "#f8fafc",
    color: "#64748b",
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
