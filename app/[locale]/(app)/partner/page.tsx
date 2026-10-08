"use client";

import { getIdToken } from "firebase/auth";
import {
  CheckCircle2,
  ChevronDown,
  MessageSquareText,
  Send,
  Sparkles,
  Settings,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

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

type PartnerProfilePayload = {
  partnerRoles: string[];
  partnerCompetenceAreas: string[];
  partnerContributionTypes: string[];
  partnerAvailability: "low" | "medium" | "high";
  partnerProfileBio: string;
  partnerDirectoryVisible: boolean;
};

const ROLE_OPTIONS = [
  ["teacher", "Teacher"],
  ["parent", "Parent"],
  ["school_leader", "School leader"],
  ["developer", "Developer"],
  ["content_creator", "Content creator"],
  ["marketing_sales", "Marketing/sales"],
  ["researcher", "Researcher"],
] as const;

const COMPETENCE_OPTIONS = [
  ["ai_learning", "AI learning"],
  ["content", "Content"],
  ["math", "Math"],
  ["a1_start", "A1 start"],
  ["quiz", "Quiz"],
  ["images_video", "Images/video"],
  ["parents", "Parents"],
  ["assessment", "Assessment"],
  ["languages", "Languages"],
  ["marketing", "Marketing"],
  ["sales", "Sales"],
] as const;

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
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const profileEditorRef = useRef<HTMLElement | null>(null);
  const [profileForm, setProfileForm] = useState<PartnerProfilePayload>({
    partnerRoles: [],
    partnerCompetenceAreas: [],
    partnerContributionTypes: [],
    partnerAvailability: "medium",
    partnerProfileBio: "",
    partnerDirectoryVisible: false,
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const hasPartnerAccess = profile?.partnerAccess === true && profile?.partnerStatus === "active";
  const loadPartnerHome = useCallback(async () => {
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
      const authHeaders = {
        Authorization: `Bearer ${token}`,
      };
      const messagesResponse = await fetch("/api/partner/messages", { headers: authHeaders });
      const messagesData = (await messagesResponse
        .json()
        .catch(() => ({}))) as PartnerMessagesResponse;

      if (!messagesResponse.ok || !messagesData.ok) {
        throw new Error(
          messagesData.error || `Could not load messages (${messagesResponse.status})`
        );
      }

      setMessages(messagesData.messages ?? []);
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
      await loadPartnerHome();
      if (!alive) return;
    }

    void run();

    return () => {
      alive = false;
    };
  }, [loadPartnerHome]);

  useEffect(() => {
    if (!profile) return;

    setProfileForm({
      partnerRoles: profile.partnerRoles ?? [],
      partnerCompetenceAreas: profile.partnerCompetenceAreas ?? [],
      partnerContributionTypes: profile.partnerContributionTypes ?? [],
      partnerAvailability: profile.partnerAvailability ?? "medium",
      partnerProfileBio: profile.partnerProfileBio ?? "",
      partnerDirectoryVisible: profile.partnerDirectoryVisible === true,
    });
  }, [profile]);

  function toggleListValue(key: keyof Pick<
    PartnerProfilePayload,
    "partnerRoles" | "partnerCompetenceAreas"
  >, value: string) {
    setProfileForm((current) => {
      const list = current[key];
      const nextList = list.includes(value)
        ? list.filter((item) => item !== value)
        : [...list, value];

      return {
        ...current,
        [key]: nextList,
      };
    });
  }

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
      await loadPartnerHome();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function savePartnerProfile() {
    if (!user || user.isAnonymous) return;

    setSavingProfile(true);
    setError("");
    setNotice("");

    try {
      const token = await getIdToken(user, true);
      const response = await fetch("/api/partner/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(profileForm),
      });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!response.ok || !data.ok) {
        throw new Error(data.error || `Could not save profile (${response.status})`);
      }

      setNotice("Partner profile saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingProfile(false);
    }
  }

  const openProfileEditor = useCallback(() => {
    setProfileEditorOpen(true);
    window.requestAnimationFrame(() => {
      profileEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

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
            Send feedback and keep in touch with the 321school team.
          </p>
        </div>
        <div style={styles.heroStatus}>
          <button
            type="button"
            onClick={openProfileEditor}
            aria-controls="partner-profile-section"
            aria-expanded={profileEditorOpen}
            style={styles.secondaryButton}
          >
            <Settings size={15} aria-hidden="true" />
            Edit profile
          </button>
          <span style={styles.statusPill}>
            <CheckCircle2 size={15} aria-hidden="true" />
            Active partner
          </span>
          <span style={styles.smallMuted}>Shared language: English</span>
        </div>
      </section>

      {error ? <section style={styles.error}>Error: {error}</section> : null}
      {notice ? <section style={styles.success}>{notice}</section> : null}

      {profileEditorOpen ? (
        <section id="partner-profile-section" ref={profileEditorRef} style={styles.card}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.kicker}>Profile</div>
              <h2 style={styles.sectionTitle}>Edit your partner profile</h2>
            </div>
            <button
              type="button"
              aria-controls="partner-profile-editor"
              aria-expanded={profileEditorOpen}
              onClick={() => setProfileEditorOpen((current) => !current)}
              style={styles.iconButton}
              title="Hide profile editor"
              aria-label="Hide profile editor"
            >
              <ChevronDown
                size={18}
                aria-hidden="true"
                style={{ transform: profileEditorOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              />
            </button>
          </div>
          <p style={styles.muted}>
            This helps 321school invite the right people into pilots, product feedback and local
            market conversations.
          </p>

            <div id="partner-profile-editor">
              <div style={styles.formGrid}>
                <ChoiceGroup
                  title="Roles"
                  options={ROLE_OPTIONS}
                  values={profileForm.partnerRoles}
                  onToggle={(value) => toggleListValue("partnerRoles", value)}
                />
                <ChoiceGroup
                  title="Competence"
                  options={COMPETENCE_OPTIONS}
                  values={profileForm.partnerCompetenceAreas}
                  onToggle={(value) => toggleListValue("partnerCompetenceAreas", value)}
                />
              </div>

              <label style={styles.fieldLabel}>
                Short profile note
                <textarea
                  value={profileForm.partnerProfileBio}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      partnerProfileBio: event.target.value,
                    }))
                  }
                  maxLength={800}
                  placeholder="What should 321school know about your interests, context or possible contribution?"
                  style={{ ...styles.textarea, minHeight: 108 }}
                />
              </label>

              <div style={styles.replyActions}>
                <span style={styles.counter}>{profileForm.partnerProfileBio.length} / 800</span>
                <button
                  onClick={savePartnerProfile}
                  disabled={savingProfile}
                  style={{
                    ...styles.primaryButton,
                    opacity: savingProfile ? 0.62 : 1,
                    cursor: savingProfile ? "not-allowed" : "pointer",
                  }}
                >
                  <CheckCircle2 size={16} aria-hidden="true" />
                  {savingProfile ? "Saving..." : "Save partner profile"}
                </button>
              </div>
            </div>
        </section>
      ) : null}

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

function ChoiceGroup({
  title,
  options,
  values,
  onToggle,
}: {
  title: string;
  options: readonly (readonly [string, string])[];
  values: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <div style={styles.choiceTitle}>{title}</div>
      <div style={styles.choiceGrid}>
        {options.map(([value, label]) => {
          const checked = values.includes(value);
          return (
            <button
              key={value}
              type="button"
              onClick={() => onToggle(value)}
              style={{
                ...styles.choiceButton,
                ...(checked ? styles.choiceButtonActive : null),
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
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
  secondaryButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 34,
    border: "1px solid #cbd5e1",
    borderRadius: 999,
    background: "#ffffff",
    color: "#334155",
    padding: "7px 12px",
    fontSize: 13,
    fontWeight: 900,
    cursor: "pointer",
  },
  iconButton: {
    width: 36,
    height: 36,
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    background: "#ffffff",
    color: "#2563eb",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
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
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 18,
    marginTop: 16,
  },
  choiceTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 900,
    marginBottom: 9,
  },
  choiceGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  choiceButton: {
    border: "1px solid #cbd5e1",
    borderRadius: 999,
    background: "#ffffff",
    color: "#334155",
    padding: "7px 10px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },
  choiceButtonActive: {
    border: "1px solid #2563eb",
    background: "#eff6ff",
    color: "#1d4ed8",
  },
  fieldLabel: {
    display: "grid",
    gap: 8,
    marginTop: 16,
    color: "#0f172a",
    fontSize: 14,
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
