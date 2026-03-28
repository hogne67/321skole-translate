// app/[locale]/(auth)/onboarding/OnboardingClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import GeoSearchSelect from "@/components/geo/GeoSearchSelect";
import { COUNTRIES } from "@/lib/geo/countries";
import { NO_MUNICIPALITY_NAMES } from "@/lib/geo/noMunicipalities";
import { useLocale, useTranslations } from "next-intl";

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function toErrorString(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;

  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const code = typeof o.code === "string" ? o.code : "";
    const message = typeof o.message === "string" ? o.message : "";
    return code || message || JSON.stringify(o);
  }

  return String(err);
}

type Role = "student" | "teacher" | "parent";

function isRole(x: unknown): x is Role {
  return x === "student" || x === "teacher" || x === "parent";
}

type InstitutionType =
  | "school"
  | "kindergarten"
  | "adult_education"
  | "university"
  | "workplace"
  | "other";

function isInstitutionType(x: unknown): x is InstitutionType {
  return (
    x === "school" ||
    x === "kindergarten" ||
    x === "adult_education" ||
    x === "university" ||
    x === "workplace" ||
    x === "other"
  );
}

function homeForRole(role: Role, locale: string): string {
  if (role === "teacher") return `/${locale}/teacher`;
  if (role === "parent") return `/${locale}/parent`;
  return `/${locale}/student`;
}

function normalizeNext(raw: string | null | undefined, locale: string, chosenRole?: Role | ""): string {
  const fallback = homeForRole(
    chosenRole === "teacher" || chosenRole === "parent" ? chosenRole : "student",
    locale
  );
  const candidate = raw ?? fallback;

  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;

  const normalized = candidate.replace(/\/+$/, "");
  const blocked = new Set([
    `/${locale}/login`,
    `/${locale}/onboarding`,
    "/login",
    "/onboarding",
    "/",
    `/${locale}`,
  ]);

  if (blocked.has(normalized)) return fallback;
  if (/^\/(en|no|pt)(\/|$)/.test(normalized)) return normalized || fallback;

  return `/${locale}${normalized}`;
}

type Props = { nextUrl?: string };
type Step = 1 | 2 | 3;

export default function OnboardingClient({ nextUrl }: Props) {
  const t = useTranslations("auth.onboarding");
  const locale = useLocale();
  const router = useRouter();

  function safeT(key: string, fallback = ""): string {
    try {
      return t(key);
    } catch {
      return fallback;
    }
  }

  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [role, setRole] = useState<Role | "">("");
  const [roleTouched, setRoleTouched] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [country, setCountry] = useState("NO");
  const [municipality, setMunicipality] = useState("");

  const [institutionType, setInstitutionType] = useState<InstitutionType | "">("");
  const [institutionName, setInstitutionName] = useState("");

  const [step, setStep] = useState<Step>(1);

  const isNorway = country === "NO";
  const isTeacher = role === "teacher";

  const countryOptions = useMemo(
    () => COUNTRIES.map((c) => ({ value: c.code, label: c.label })),
    []
  );

  const municipalityOptions = useMemo(
    () => NO_MUNICIPALITY_NAMES.map((n) => ({ value: n, label: n })),
    []
  );

  const institutionOptions = useMemo(
    () =>
      ([
        "school",
        "kindergarten",
        "adult_education",
        "university",
        "workplace",
        "other",
      ] as InstitutionType[]).map((value) => ({
        value,
        label: safeT(`institution.types.${value}`, value),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  );

  const safeNext = useMemo(() => normalizeNext(nextUrl, locale), [nextUrl, locale]);

  const nameOk = !!displayName.trim();
  const countryOk = !!country.trim();
  const municipalityOk = !!municipality.trim();
  const roleOk = !!role;
  const canSubmit = roleOk && nameOk && countryOk && municipalityOk;
  const showRoleHint = roleTouched && !roleOk;

  function totalStepsForRole(currentRole: Role | "") {
    return currentRole === "teacher" ? 3 : 2;
  }

  const totalSteps = totalStepsForRole(role);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace(`/${locale}/login?next=${encodeURIComponent(safeNext)}`);
        return;
      }

      if (u.isAnonymous) {
        router.replace(`/${locale}/login?next=${encodeURIComponent(`/${locale}/onboarding`)}`);
        return;
      }

      setUid(u.uid);
      setErr(null);

      try {
        const ref = doc(db, "users", u.uid);
        const snap = await getDoc(ref);
        const authName = (u.displayName || "").trim();

        if (snap.exists()) {
          const p = (snap.data() ?? {}) as Record<string, unknown>;

          if (p.onboardingComplete === true) {
            router.replace(normalizeNext(nextUrl, locale, isRole(p.role) ? p.role : ""));
            return;
          }

          const pDisplayName = typeof p.displayName === "string" ? p.displayName : "";
          setDisplayName(String(pDisplayName || authName || "").trim());

          const pRole = p.role;
          const r = isRole(pRole) ? pRole : "";
          setRole(r);
          setRoleTouched(!!r);

          const org = (p.org ?? {}) as Record<string, unknown>;
          const orgCountry = typeof org.country === "string" ? org.country : "NO";
          const orgMunicipality = typeof org.municipality === "string" ? org.municipality : "";
          const orgInstitutionName =
            typeof org.institutionName === "string" ? org.institutionName : "";

          const rawInstType = org.institutionType;
          const instType: InstitutionType | "" = isInstitutionType(rawInstType)
            ? rawInstType
            : "";

          setCountry(String(orgCountry).trim() || "NO");
          setMunicipality(String(orgMunicipality).trim());
          setInstitutionType(instType);
          setInstitutionName(String(orgInstitutionName).trim());

          if (r) {
            setStep(2);
          } else {
            setStep(1);
          }
        } else {
          setDisplayName(authName);
          setRole("");
          setRoleTouched(false);
          setCountry("NO");
          setMunicipality("");
          setInstitutionType("");
          setInstitutionName("");
          setStep(1);
        }
      } catch {
        setDisplayName((u.displayName || "").trim());
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router, locale, nextUrl, safeNext]);

  function validateStep(currentStep: Step): boolean {
    setErr(null);

    if (currentStep === 1) {
      setRoleTouched(true);
      if (!role) {
        setErr(safeT("errors.missingRole", "Choose a role (Student, Teacher or Parent)."));
        return false;
      }
      return true;
    }

    if (currentStep === 2) {
      if (!displayName.trim()) {
        setErr(safeT("errors.missingName", "Enter your full name."));
        return false;
      }

      if (!country.trim()) {
        setErr(safeT("errors.missingCountry", "Choose a country."));
        return false;
      }

      if (!municipality.trim()) {
        setErr(
          isNorway
            ? safeT("errors.missingMunicipalityNo", "Choose a municipality.")
            : safeT("errors.missingMunicipalityOther", "Enter a city or area.")
        );
        return false;
      }

      return true;
    }

    return true;
  }

  function goNext() {
    if (!validateStep(step)) return;

    if (step === 1) {
      setStep(2);
      return;
    }

    if (step === 2 && isTeacher) {
      setStep(3);
    }
  }

  function goBack() {
    setErr(null);

    if (step === 3) {
      setStep(2);
      return;
    }

    if (step === 2) {
      setStep(1);
    }
  }

  function chooseRole(nextRole: Role) {
    setRoleTouched(true);
    setRole(nextRole);
    setErr(null);
    setStep(2);
  }

  async function saveProfile() {
    if (!uid) return;

    setErr(null);
    setRoleTouched(true);

    if (!role) {
      setErr(safeT("errors.missingRole", "Choose a role (Student, Teacher or Parent)."));
      return;
    }

    const name = displayName.trim();
    const c = country.trim();
    const m = municipality.trim();
    const instName = institutionName.trim();

    if (!name) {
      setStep(2);
      setErr(safeT("errors.missingName", "Enter your full name."));
      return;
    }

    if (!c) {
      setStep(2);
      setErr(safeT("errors.missingCountry", "Choose a country."));
      return;
    }

    if (!m) {
      setStep(2);
      setErr(
        isNorway
          ? safeT("errors.missingMunicipalityNo", "Choose a municipality.")
          : safeT("errors.missingMunicipalityOther", "Enter a city or area.")
      );
      return;
    }

    setSaving(true);
    try {
      const ref = doc(db, "users", uid);

      const payload = stripUndefined({
        displayName: name,
        locale,
        role,
        org: stripUndefined({
          country: c,
          municipality: m,
          institutionType: role === "teacher" ? institutionType || undefined : undefined,
          institutionName: role === "teacher" ? instName || undefined : undefined,
        }),
        onboardingComplete: true,
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });

      await setDoc(ref, payload, { merge: true });

      const finalNext = normalizeNext(nextUrl, locale, role);
      window.location.href = `/${locale}/post-login?next=${encodeURIComponent(finalNext)}`;
    } catch (e: unknown) {
      setErr(toErrorString(e));
    } finally {
      setSaving(false);
    }
  }

  const pageBg: React.CSSProperties = {
    minHeight: "100vh",
    padding: "12px 14px 28px",
    background: "linear-gradient(180deg, rgba(124,199,255,0.16), rgba(255,255,255,1) 340px)",
  };

  const wrap: React.CSSProperties = {
    maxWidth: 820,
    margin: "12px auto",
  };

  const card: React.CSSProperties = {
    background: "white",
    border: "1px solid rgba(15,23,42,0.08)",
    borderRadius: 24,
    boxShadow: "0 18px 50px rgba(15,23,42,0.10)",
    padding: 18,
  };

  const logoWrap: React.CSSProperties = {
    display: "flex",
    justifyContent: "center",
    marginBottom: 10,
  };

  const header: React.CSSProperties = {
    display: "grid",
    gap: 8,
    textAlign: "center",
    marginBottom: 16,
  };

  const eyebrow: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.3,
    color: "rgba(15,23,42,0.55)",
    textTransform: "uppercase",
  };

  const title: React.CSSProperties = {
    margin: 0,
    fontSize: 28,
    lineHeight: 1.08,
    fontWeight: 900,
    color: "#0f172a",
  };

  const subtitle: React.CSSProperties = {
    margin: 0,
    color: "rgba(15,23,42,0.72)",
    fontSize: 14,
    lineHeight: 1.55,
  };

  const progressOuter: React.CSSProperties = {
    height: 10,
    borderRadius: 999,
    background: "rgba(148,163,184,0.18)",
    overflow: "hidden",
    marginTop: 6,
    marginBottom: 18,
  };

  const progressInner: React.CSSProperties = {
    height: "100%",
    width: `${(step / totalSteps) * 100}%`,
    background: "linear-gradient(90deg, #2563eb, #06b6d4)",
    borderRadius: 999,
    transition: "width 180ms ease",
  };

  const section: React.CSSProperties = {
    display: "grid",
    gap: 14,
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 20,
    fontWeight: 900,
    color: "#0f172a",
    margin: 0,
  };

  const sectionText: React.CSSProperties = {
    margin: 0,
    color: "rgba(15,23,42,0.72)",
    fontSize: 14,
    lineHeight: 1.5,
  };

  const roleGrid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
  };

  const roleCard = (active: boolean): React.CSSProperties => ({
    border: active ? "2px solid #2563eb" : "1px solid rgba(15,23,42,0.10)",
    borderRadius: 18,
    padding: 14,
    cursor: "pointer",
    background: active
      ? "linear-gradient(180deg, rgba(37,99,235,0.16), rgba(6,182,212,0.12))"
      : "white",
    color: "#0f172a",
    boxShadow: active
      ? "0 14px 30px rgba(37,99,235,0.18)"
      : "0 2px 8px rgba(15,23,42,0.04)",
    display: "grid",
    gap: 8,
    textAlign: "left",
    minHeight: 142,
    position: "relative",
    transition: "all 160ms ease",
  });

  const selectedBadge = (active: boolean): React.CSSProperties => ({
    position: "absolute",
    top: 10,
    right: 10,
    minWidth: 28,
    height: 28,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: 900,
    color: active ? "white" : "transparent",
    background: active ? "#2563eb" : "transparent",
    border: active ? "none" : "1px solid transparent",
  });

  const roleEmoji: React.CSSProperties = {
    fontSize: 26,
    lineHeight: 1,
    marginTop: 2,
  };

  const roleTitle: React.CSSProperties = {
    fontWeight: 900,
    fontSize: 16,
    color: "#0f172a",
  };

  const roleHint: React.CSSProperties = {
    fontSize: 13,
    lineHeight: 1.45,
    color: "#475569",
  };

  const hintBox: React.CSSProperties = {
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(245,158,11,0.30)",
    background: "rgba(245,158,11,0.10)",
    fontSize: 13,
    color: "#78350f",
  };

  const errorBox: React.CSSProperties = {
    marginBottom: 14,
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(220,38,38,0.25)",
    background: "rgba(220,38,38,0.06)",
    color: "#991b1b",
    fontSize: 14,
  };

  const changeRoleButton: React.CSSProperties = {
    background: "transparent",
    border: "none",
    padding: 0,
    color: "#2563eb",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    justifySelf: "start",
  };

  const labelStyle: React.CSSProperties = { display: "grid", gap: 6 };
  const labelTextStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 800,
    color: "#0f172a",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 50,
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.14)",
    outline: "none",
    fontSize: 15,
    background: "#fff",
  };

  const twoCol: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  };

  const footerRow: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 18,
    flexWrap: "wrap",
  };

  const secondaryBtn: React.CSSProperties = {
    minHeight: 50,
    padding: "12px 16px",
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "#fff",
    color: "#0f172a",
    fontWeight: 800,
    fontSize: 15,
  };

  const primaryBtn: React.CSSProperties = {
    minHeight: 50,
    padding: "12px 18px",
    borderRadius: 14,
    border: "1px solid rgba(37,99,235,0.35)",
    background: "linear-gradient(180deg, #2563eb, #1d4ed8)",
    color: "#fff",
    fontWeight: 900,
    fontSize: 15,
    boxShadow: "0 12px 28px rgba(37,99,235,0.24)",
  };

  if (loading) {
    return (
      <main style={pageBg}>
        <div style={wrap}>
          <div style={card}>
            <div style={logoWrap}>
              <Image
                src="/logo 321_2.png"
                alt="321skole"
                width={220}
                height={72}
                priority
                style={{ width: "auto", height: "56px", objectFit: "contain" }}
              />
            </div>

            <div style={header}>
              <div style={eyebrow}>{safeT("title", "Get started")}</div>
              <h1 style={title}>{safeT("title", "Get started")}</h1>
              <p style={subtitle}>{safeT("loading", "Loading…")}</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={pageBg}>
      <div style={wrap}>
        <div style={card}>
          <div style={logoWrap}>
            <Image
              src="/logo 321_2.png"
              alt="321skole"
              width={220}
              height={72}
              priority
              style={{ width: "auto", height: "56px", objectFit: "contain" }}
            />
          </div>

          <div style={header}>
            <div style={eyebrow}>
              {safeT("title", "Get started")} · {step}/{totalSteps}
            </div>
            <h1 style={title}>{safeT("title", "Get started")}</h1>
            <p style={subtitle}>
              {safeT(
                "subtitle",
                "Choose your role and fill in basic information to continue."
              )}
            </p>
          </div>

          <div style={progressOuter}>
            <div style={progressInner} />
          </div>

          {err ? <div style={errorBox}>{err}</div> : null}

          {step === 1 ? (
            <section style={section}>
              <h2 style={sectionTitle}>
                {safeT("steps.role.title", "Choose your role")}
              </h2>
              <p style={sectionText}>
                {safeT(
                  "steps.role.text",
                  "Tap the role that fits you best. You can change it later."
                )}
              </p>

              <div style={roleGrid}>
                <button
                  type="button"
                  className="role-card"
                  aria-pressed={role === "student"}
                  onClick={() => chooseRole("student")}
                  style={roleCard(role === "student")}
                >
                  <span style={selectedBadge(role === "student")}>✓</span>
                  <div style={roleEmoji}>👩‍🎓</div>
                  <div style={roleTitle}>{safeT("fields.role.student", "Student")}</div>
                  <div style={roleHint}>
                    {safeT(
                      "fields.role.studentHint",
                      "For pupils and students who want to learn more on their own or together with others."
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  className="role-card"
                  aria-pressed={role === "teacher"}
                  onClick={() => chooseRole("teacher")}
                  style={roleCard(role === "teacher")}
                >
                  <span style={selectedBadge(role === "teacher")}>✓</span>
                  <div style={roleEmoji}>👩‍🏫</div>
                  <div style={roleTitle}>{safeT("fields.role.teacher", "Teacher")}</div>
                  <div style={roleHint}>
                    {safeT(
                      "fields.role.teacherHint",
                      "Learning platform for teaching staff with classes, classrooms and digital whiteboard."
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  className="role-card"
                  aria-pressed={role === "parent"}
                  onClick={() => chooseRole("parent")}
                  style={roleCard(role === "parent")}
                >
                  <span style={selectedBadge(role === "parent")}>✓</span>
                  <div style={roleEmoji}>👨‍👩‍👧</div>
                  <div style={roleTitle}>{safeT("fields.role.parent", "Parent")}</div>
                  <div style={roleHint}>
                    {safeT(
                      "fields.role.parentHint",
                      "For guardians who want to help their children learn more. Create your own study spaces and give them adapted tasks."
                    )}
                  </div>
                </button>
              </div>

              {showRoleHint ? (
                <div style={hintBox}>
                  {safeT("errors.missingRole", "Choose a role (Student, Teacher or Parent).")}
                </div>
              ) : null}
            </section>
          ) : null}

          {step === 2 ? (
            <section style={section}>
              <button
                type="button"
                onClick={() => setStep(1)}
                style={changeRoleButton}
              >
                ← {safeT("buttons.changeRole", "Change role")}
              </button>

              <h2 style={sectionTitle}>
                {safeT("steps.profile.title", "Basic profile")}
              </h2>
              <p style={sectionText}>
                {safeT(
                  "steps.profile.text",
                  "Tell us a little about yourself so we can tailor the experience."
                )}
              </p>

              <label style={labelStyle}>
                <span style={labelTextStyle}>
                  {safeT("fields.fullName.label", "Full name *")}
                </span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  style={inputStyle}
                  autoComplete="name"
                />
              </label>

              <div style={twoCol}>
                <GeoSearchSelect
                  label={safeT("fields.country.label", "Country *")}
                  value={country}
                  options={countryOptions}
                  placeholder={safeT("fields.country.placeholder", "Search country…")}
                  onChange={(v) => {
                    setCountry(v);
                    setMunicipality("");
                  }}
                />

                {isNorway ? (
                  <GeoSearchSelect
                    label={safeT("fields.municipalityNo.label", "Municipality *")}
                    value={municipality}
                    options={municipalityOptions}
                    placeholder={safeT(
                      "fields.municipalityNo.placeholder",
                      "Search municipality…"
                    )}
                    onChange={setMunicipality}
                  />
                ) : (
                  <label style={labelStyle}>
                    <span style={labelTextStyle}>
                      {safeT("fields.municipalityOther.label", "City / area *")}
                    </span>
                    <input
                      value={municipality}
                      onChange={(e) => setMunicipality(e.target.value)}
                      style={inputStyle}
                    />
                  </label>
                )}
              </div>

              <div style={footerRow}>
                <button
                  type="button"
                  onClick={goBack}
                  style={{ ...secondaryBtn, cursor: "pointer" }}
                >
                  {safeT("buttons.back", "Back")}
                </button>

                {isTeacher ? (
                  <button
                    type="button"
                    onClick={goNext}
                    style={{ ...primaryBtn, cursor: "pointer" }}
                  >
                    {safeT("buttons.continue", "Continue")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={saveProfile}
                    disabled={saving || !canSubmit}
                    style={{
                      ...primaryBtn,
                      cursor: saving || !canSubmit ? "not-allowed" : "pointer",
                      opacity: saving || !canSubmit ? 0.6 : 1,
                    }}
                  >
                    {saving
                      ? safeT("buttons.saving", "Saving…")
                      : safeT("buttons.complete", "Complete profile")}
                  </button>
                )}
              </div>
            </section>
          ) : null}

          {step === 3 && isTeacher ? (
            <section style={section}>
              <button
                type="button"
                onClick={goBack}
                style={changeRoleButton}
              >
                ← {safeT("buttons.back", "Back")}
              </button>

              <h2 style={sectionTitle}>
                {safeT("steps.institution.title", "Learning institution")}
              </h2>
              <p style={sectionText}>
                {safeT(
                  "steps.institution.text",
                  "This step is optional, but it helps us tailor the teacher experience."
                )}
              </p>

              <div style={twoCol}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>
                    {safeT("institution.typeLabel", "Type")}
                  </span>
                  <select
                    value={institutionType}
                    onChange={(e) => {
                      const v = e.target.value;
                      setInstitutionType(isInstitutionType(v) ? v : "");
                    }}
                    style={inputStyle}
                  >
                    <option value="">{safeT("institution.none", "None")}</option>
                    {institutionOptions.map((x) => (
                      <option key={x.value} value={x.value}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={labelStyle}>
                  <span style={labelTextStyle}>
                    {safeT("institution.nameLabel", "Name (optional)")}
                  </span>
                  <input
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    style={inputStyle}
                    placeholder={safeT("institution.namePlaceholder", "")}
                  />
                </label>
              </div>

              <div style={footerRow}>
                <div />
                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={saving}
                  style={{
                    ...primaryBtn,
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving
                    ? safeT("buttons.saving", "Saving…")
                    : safeT("buttons.complete", "Complete profile")}
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <style jsx>{`
        .role-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
        }

        @media (max-width: 860px) {
          div[style*="repeat(3, minmax(0, 1fr))"] {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 720px) {
          div[style*="grid-template-columns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }

          main :global(button),
          main :global(input),
          main :global(select) {
            min-height: 46px;
          }
        }
      `}</style>
    </main>
  );
}