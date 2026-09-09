"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { getAuth } from "firebase/auth";
import { useEffect, useState, type CSSProperties } from "react";
import { useUserProfile } from "@/lib/useUserProfile";

type CurrentRole = "teacher" | "parent" | "student" | "other";
type PartnerAvailability = "low" | "medium" | "high";

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

const CONTRIBUTION_OPTIONS = [
  ["test_features", "Test features"],
  ["give_feedback", "Give feedback"],
  ["create_content", "Create content"],
  ["share_321school", "Share 321school"],
  ["school_contacts", "School contacts"],
  ["translate", "Translate"],
  ["social_media", "Social media"],
  ["local_market_insight", "Local insight"],
] as const;

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return String(e);
}

async function authedPost<T = unknown>(url: string, body: unknown): Promise<T> {
  const user = getAuth().currentUser;
  if (!user || user.isAnonymous) throw new Error("Du må være innlogget.");

  const token = await user.getIdToken();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
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
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : raw || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data as T;
}

function SectionList({ title, items }: { title: string; items: string[] }) {
  return (
    <section style={styles.panel}>
      <h2 style={styles.h2}>{title}</h2>
      <ul style={styles.list}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export default function PartnerApplyPage() {
  const locale = useLocale();
  const { user, profile, loading } = useUserProfile();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [languagesText, setLanguagesText] = useState("");
  const [currentRole, setCurrentRole] = useState<CurrentRole>("teacher");
  const [partnerRoles, setPartnerRoles] = useState<string[]>(["teacher"]);
  const [partnerCompetenceAreas, setPartnerCompetenceAreas] = useState<string[]>([]);
  const [partnerContributionTypes, setPartnerContributionTypes] = useState<string[]>([
    "test_features",
    "give_feedback",
  ]);
  const [partnerAvailability, setPartnerAvailability] = useState<PartnerAvailability>("medium");
  const [partnerProfileBio, setPartnerProfileBio] = useState("");
  const [partnerDirectoryVisible, setPartnerDirectoryVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSignedIn = Boolean(user && !user.isAnonymous);
  const loginHref = `/${locale}/login?next=${encodeURIComponent(`/${locale}/apply/321school-partner`)}`;

  const prefilledEmail = user?.email || profile?.email || "";
  const prefilledName = user?.displayName || profile?.displayName || "";

  useEffect(() => {
    if (prefilledName) setName((current) => current || prefilledName);
    if (prefilledEmail) setEmail((current) => current || prefilledEmail);
  }, [prefilledEmail, prefilledName]);

  const existingStatus = profile?.partnerStatus ?? "none";

  async function submit() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const languages = languagesText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      await authedPost("/api/partner/apply", {
        name,
        email,
        city,
        country,
        languages,
        currentRole,
        partnerRoles,
        partnerCompetenceAreas,
        partnerContributionTypes,
        partnerAvailability,
        partnerProfileBio,
        partnerDirectoryVisible,
      });

      setMessage("Takk. Interessen din er registrert og venter på gjennomgang.");
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div style={styles.kicker}>321school Partner</div>
        <h1 style={styles.h1}>Terms of partnership</h1>
        <p style={styles.lead}>
          This page is for people 321school has found and invited directly. Partnership is not a
          separate main role, but may give Plus-like access after approval.
        </p>
      </section>

      <div style={styles.grid}>
        <div style={styles.copyStack}>
          <SectionList
            title="As a 321school Partner you get:"
            items={[
              "Free use of the platform",
              "Participation in an international educational sharing network",
              "Communication with other partners around the world",
              "Priority for future engagements, collaborations or employment opportunities",
            ]}
          />

          <SectionList
            title="As a 321school Partner you are expected to:"
            items={[
              "believe that AI can provide learning support for teachers, students and parents",
              "believe that AI can help produce learning materials faster and better",
              "be able to communicate in English",
              "share experiences and information with other partners",
              "suggest improvements and new learning generators",
              "help share or promote 321school through relevant channels",
              "where relevant, create or develop images/videos for social media",
            ]}
          />

          <p style={styles.note}>
            The partnership lasts as long as you use the platform actively and respond to
            communication from 321school.
          </p>
        </div>

        <section style={styles.formPanel}>
          <h2 style={styles.h2}>Accept and become a 321school Partner</h2>

          {loading ? <p style={styles.muted}>Laster innlogging...</p> : null}

          {!loading && !isSignedIn ? (
            <div style={styles.loginBox}>
              <p style={{ margin: 0 }}>
                Du må være innlogget for å registrere interesse som 321school Partner.
              </p>
              <Link href={loginHref} style={styles.primaryLink}>
                Logg inn
              </Link>
            </div>
          ) : null}

          {!loading && isSignedIn ? (
            <div style={styles.form}>
              {existingStatus !== "none" ? (
                <div style={styles.statusBox}>Din partnerstatus: {existingStatus}</div>
              ) : null}

              <label style={styles.label}>
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} style={styles.input} />
              </label>

              <label style={styles.label}>
                Email
                <input value={email} onChange={(e) => setEmail(e.target.value)} style={styles.input} />
              </label>

              <label style={styles.label}>
                City/place
                <input value={city} onChange={(e) => setCity(e.target.value)} style={styles.input} />
              </label>

              <label style={styles.label}>
                Country
                <input value={country} onChange={(e) => setCountry(e.target.value)} style={styles.input} />
              </label>

              <label style={styles.label}>
                Languages
                <input
                  value={languagesText}
                  onChange={(e) => setLanguagesText(e.target.value)}
                  placeholder="English, Norwegian, Spanish"
                  style={styles.input}
                />
              </label>

              <label style={styles.label}>
                Current role
                <select
                  value={currentRole}
                  onChange={(e) => setCurrentRole(e.target.value as CurrentRole)}
                  style={styles.input}
                >
                  <option value="teacher">teacher</option>
                  <option value="parent">parent</option>
                  <option value="student">student</option>
                  <option value="other">other</option>
                </select>
              </label>

              <ChoiceGroup
                title="Relevant roles"
                options={ROLE_OPTIONS}
                values={partnerRoles}
                onToggle={(value) => setPartnerRoles((current) => toggleValue(current, value))}
              />

              <ChoiceGroup
                title="Competence areas"
                options={COMPETENCE_OPTIONS}
                values={partnerCompetenceAreas}
                onToggle={(value) =>
                  setPartnerCompetenceAreas((current) => toggleValue(current, value))
                }
              />

              <ChoiceGroup
                title="Preferred contribution"
                options={CONTRIBUTION_OPTIONS}
                values={partnerContributionTypes}
                onToggle={(value) =>
                  setPartnerContributionTypes((current) => toggleValue(current, value))
                }
              />

              <label style={styles.label}>
                Availability
                <select
                  value={partnerAvailability}
                  onChange={(e) => setPartnerAvailability(e.target.value as PartnerAvailability)}
                  style={styles.input}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>

              <label style={styles.label}>
                Short note
                <textarea
                  value={partnerProfileBio}
                  onChange={(e) => setPartnerProfileBio(e.target.value)}
                  maxLength={800}
                  placeholder="Tell us briefly where you think you can contribute."
                  style={styles.textarea}
                />
              </label>

              <label style={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={partnerDirectoryVisible}
                  onChange={(e) => setPartnerDirectoryVisible(e.target.checked)}
                />
                Show my profile in a future partner directory
              </label>

              <button onClick={submit} disabled={saving} style={styles.button}>
                {saving ? "Sending..." : "Submit"}
              </button>

              {message ? <div style={styles.success}>{message}</div> : null}
              {error ? <div style={styles.error}>Feil: {error}</div> : null}
            </div>
          ) : null}
        </section>
      </div>
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
    maxWidth: 1120,
    margin: "0 auto",
    padding: "40px 16px 64px",
    color: "#111827",
  },
  hero: {
    padding: "24px 0 30px",
  },
  kicker: {
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: 0,
    color: "#0f766e",
  },
  h1: {
    margin: "6px 0 0",
    fontSize: 42,
    lineHeight: 1.08,
    letterSpacing: 0,
  },
  lead: {
    maxWidth: 720,
    margin: "14px 0 0",
    fontSize: 18,
    lineHeight: 1.6,
    color: "#475569",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.15fr) minmax(320px, 0.85fr)",
    gap: 18,
    alignItems: "start",
  },
  copyStack: {
    display: "grid",
    gap: 14,
  },
  panel: {
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: 18,
    background: "#ffffff",
  },
  formPanel: {
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: 18,
    background: "#f8fafc",
  },
  h2: {
    margin: 0,
    fontSize: 20,
    letterSpacing: 0,
  },
  list: {
    margin: "12px 0 0",
    paddingLeft: 20,
    lineHeight: 1.7,
    color: "#334155",
  },
  note: {
    margin: 0,
    padding: 16,
    borderRadius: 8,
    background: "#ecfdf5",
    color: "#065f46",
    lineHeight: 1.6,
  },
  form: {
    display: "grid",
    gap: 12,
    marginTop: 14,
  },
  label: {
    display: "grid",
    gap: 6,
    fontSize: 13,
    fontWeight: 800,
  },
  input: {
    width: "100%",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 15,
    background: "#ffffff",
  },
  textarea: {
    width: "100%",
    minHeight: 96,
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 15,
    lineHeight: 1.5,
    background: "#ffffff",
    resize: "vertical",
  },
  choiceTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: 900,
    marginBottom: 8,
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
    border: "1px solid #0f766e",
    background: "#ecfdf5",
    color: "#047857",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    color: "#334155",
    fontSize: 13,
    fontWeight: 800,
  },
  button: {
    border: "1px solid #0f766e",
    borderRadius: 8,
    padding: "11px 14px",
    fontWeight: 800,
    color: "#ffffff",
    background: "#0f766e",
    cursor: "pointer",
  },
  muted: {
    color: "#64748b",
  },
  loginBox: {
    display: "grid",
    gap: 12,
    marginTop: 14,
    color: "#334155",
  },
  primaryLink: {
    display: "inline-flex",
    width: "fit-content",
    borderRadius: 8,
    padding: "10px 14px",
    background: "#0f766e",
    color: "#ffffff",
    fontWeight: 800,
    textDecoration: "none",
  },
  statusBox: {
    border: "1px solid #bfdbfe",
    borderRadius: 8,
    padding: 10,
    background: "#eff6ff",
    color: "#1d4ed8",
    fontWeight: 700,
  },
  success: {
    border: "1px solid #a7f3d0",
    borderRadius: 8,
    padding: 10,
    background: "#ecfdf5",
    color: "#047857",
  },
  error: {
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: 10,
    background: "#fef2f2",
    color: "#b91c1c",
  },
};
