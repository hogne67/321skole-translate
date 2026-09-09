"use client";

import { getIdToken } from "firebase/auth";
import {
  CalendarDays,
  CheckCircle2,
  Globe2,
  Lightbulb,
  MessageSquareText,
  Megaphone,
  Send,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

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

type PartnerProfileSignal = {
  label: string;
  value: string;
};

function formatDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const profileSignals = useMemo<PartnerProfileSignal[]>(() => {
    const languages = profile?.partnerLanguages?.filter(Boolean).join(", ") || "Not set yet";

    return [
      { label: "Region", value: profile?.partnerRegion || "Not set yet" },
      { label: "Languages", value: languages },
      { label: "Level", value: cleanValue(profile?.partnerLevel || "partner") },
    ];
  }, [profile?.partnerLanguages, profile?.partnerLevel, profile?.partnerRegion]);

  const latestMessage = messages[0];

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
      setNotice("Reply sent to the 321school team.");
      await loadMessages();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  if (loading || messagesLoading) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>Loading partner home...</section>
      </main>
    );
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
      <section style={styles.hero}>
        <div style={styles.heroText}>
          <div style={styles.kicker}>321school Partner</div>
          <h1 style={styles.h1}>Partner home</h1>
          <p style={styles.lead}>
            A simple starting point for partner updates, monthly focus, feedback and the first
            version of the 321school partner network.
          </p>
        </div>
        <div style={styles.heroStatus}>
          <span style={styles.statusPill}>
            <CheckCircle2 size={15} aria-hidden="true" />
            Active partner
          </span>
          <span style={styles.smallMuted}>Shared language: English</span>
        </div>
      </section>

      {error ? <section style={styles.error}>Error: {error}</section> : null}
      {notice ? <section style={styles.success}>{notice}</section> : null}

      <section style={styles.gridTwo}>
        <Panel
          icon={<CalendarDays size={19} aria-hidden="true" />}
          title="Monthly focus"
          eyebrow="Pilot rhythm"
        >
          <p style={styles.panelText}>
            Test one useful workflow, share one concrete improvement and bring one relevant insight
            from your local education context.
          </p>
          <div style={styles.actionStrip}>
            <span>Next step</span>
            <strong>Monthly partner meeting</strong>
          </div>
        </Panel>

        <Panel icon={<Megaphone size={19} aria-hidden="true" />} title="Latest update">
          {latestMessage ? (
            <>
              <p style={styles.panelText}>{latestMessage.message || "-"}</p>
              <div style={styles.messageMeta}>
                <span>{cleanValue(latestMessage.type)}</span>
                <span>{formatDate(latestMessage.createdAt)}</span>
              </div>
            </>
          ) : (
            <p style={styles.panelText}>No partner messages yet.</p>
          )}
        </Panel>
      </section>

      <section style={styles.gridThree}>
        <Panel icon={<UsersRound size={18} aria-hidden="true" />} title="Network">
          <p style={styles.panelText}>
            The first network will stay small: selected partners across countries, roles and
            interests.
          </p>
        </Panel>
        <Panel icon={<Lightbulb size={18} aria-hidden="true" />} title="Competence areas">
          <div style={styles.tagList}>
            {["Content", "AI learning", "Marketing", "Sales", "Parents", "Math", "A1 start", "Quiz"].map(
              (tag) => (
                <span key={tag} style={styles.tag}>
                  {tag}
                </span>
              )
            )}
          </div>
        </Panel>
        <Panel icon={<Globe2 size={18} aria-hidden="true" />} title="Your partner profile">
          <dl style={styles.signalList}>
            {profileSignals.map((item) => (
              <div key={item.label} style={styles.signalRow}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </section>

      <section style={styles.card}>
        <div style={styles.sectionHeader}>
          <div>
            <div style={styles.kicker}>Feedback</div>
            <h2 style={styles.sectionTitle}>Send a reply to 321school</h2>
          </div>
          <MessageSquareText size={21} color="#2563eb" aria-hidden="true" />
        </div>
        <p style={styles.muted}>
          Use this for ideas, product feedback, market observations, possible partners or questions
          for the next meeting.
        </p>
        <textarea
          value={replyText}
          onChange={(event) => setReplyText(event.target.value)}
          maxLength={4000}
          placeholder="Write a short update or suggestion..."
          style={styles.textarea}
        />
        <div style={styles.replyActions}>
          <span style={styles.counter}>{replyText.length} / 4000</span>
          <button
            onClick={sendReply}
            disabled={sending || !replyText.trim()}
            style={{
              ...styles.primaryButton,
              opacity: sending || !replyText.trim() ? 0.62 : 1,
              cursor: sending || !replyText.trim() ? "not-allowed" : "pointer",
            }}
          >
            <Send size={16} aria-hidden="true" />
            {sending ? "Sending..." : "Send reply"}
          </button>
        </div>
      </section>

      <section style={styles.card}>
        <div style={styles.sectionHeader}>
          <div>
            <div style={styles.kicker}>Communication</div>
            <h2 style={styles.sectionTitle}>Partner messages</h2>
          </div>
          <Sparkles size={21} color="#0f766e" aria-hidden="true" />
        </div>

        {messages.length === 0 ? <div style={styles.empty}>No partner messages yet.</div> : null}

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

function Panel({
  icon,
  title,
  eyebrow,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={styles.panel}>
      <div style={styles.panelHeader}>
        <span style={styles.iconWrap}>{icon}</span>
        <div>
          {eyebrow ? <div style={styles.panelEyebrow}>{eyebrow}</div> : null}
          <h2 style={styles.panelTitle}>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: "grid",
    gap: 16,
    maxWidth: 1120,
    margin: "0 auto",
  },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    flexWrap: "wrap",
    border: "1px solid rgba(15,23,42,0.10)",
    borderRadius: 8,
    padding: 20,
    background: "#ffffff",
    boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
  },
  heroText: {
    minWidth: 0,
    flex: "1 1 520px",
  },
  heroStatus: {
    display: "grid",
    justifyItems: "end",
    gap: 8,
  },
  card: {
    border: "1px solid rgba(15,23,42,0.10)",
    borderRadius: 8,
    padding: 18,
    background: "#ffffff",
    boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
  },
  panel: {
    minWidth: 0,
    border: "1px solid rgba(15,23,42,0.10)",
    borderRadius: 8,
    padding: 16,
    background: "#ffffff",
    boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
  },
  gridTwo: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
  },
  gridThree: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: 16,
  },
  kicker: {
    color: "#2563eb",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
  },
  h1: {
    margin: "4px 0 0",
    color: "#0f172a",
    fontSize: 30,
    lineHeight: 1.12,
    letterSpacing: 0,
  },
  lead: {
    maxWidth: 720,
    margin: "8px 0 0",
    color: "#475569",
    lineHeight: 1.55,
    fontSize: 16,
  },
  muted: {
    margin: "8px 0 0",
    color: "#64748b",
    lineHeight: 1.55,
  },
  smallMuted: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 1.35,
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 30,
    border: "1px solid #bbf7d0",
    borderRadius: 999,
    background: "#f0fdf4",
    color: "#15803d",
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 900,
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    margin: "3px 0 0",
    color: "#0f172a",
    fontSize: 19,
    fontWeight: 900,
    lineHeight: 1.2,
    letterSpacing: 0,
  },
  panelHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #bfdbfe",
    background: "#eff6ff",
    color: "#2563eb",
    flex: "0 0 auto",
  },
  panelEyebrow: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
  },
  panelTitle: {
    margin: 0,
    color: "#0f172a",
    fontSize: 17,
    fontWeight: 900,
    lineHeight: 1.2,
    letterSpacing: 0,
  },
  panelText: {
    margin: "12px 0 0",
    color: "#475569",
    lineHeight: 1.55,
  },
  actionStrip: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 14,
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    background: "#f8fafc",
    padding: "10px 12px",
    color: "#475569",
    fontSize: 13,
  },
  tagList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  tag: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 28,
    borderRadius: 999,
    border: "1px solid #cbd5e1",
    background: "#f8fafc",
    color: "#334155",
    padding: "4px 9px",
    fontSize: 13,
    fontWeight: 800,
  },
  signalList: {
    display: "grid",
    gap: 9,
    margin: "12px 0 0",
  },
  signalRow: {
    display: "grid",
    gridTemplateColumns: "96px 1fr",
    gap: 8,
    color: "#475569",
    fontSize: 13,
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
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    border: "1px solid #2563eb",
    borderRadius: 8,
    padding: "10px 14px",
    background: "#2563eb",
    color: "#ffffff",
    fontWeight: 800,
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
