"use client";

import React, { useEffect, useMemo, useState } from "react";
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

type Role = "student" | "teacher";
function isRole(x: unknown): x is Role {
  return x === "student" || x === "teacher";
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

function normalizeNext(raw: string | null | undefined, locale: string): string {
  const fallback = `/${locale}/student`;
  const candidate = raw ?? fallback;

  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;

  const normalized = candidate.replace(/\/+$/, "");
  const blocked = new Set([`/${locale}/login`, `/${locale}/onboarding`, "/login", "/onboarding", "/", `/${locale}`]);
  if (blocked.has(normalized)) return fallback;

  // already locale-prefixed
  if (/^\/(en|no|pt)(\/|$)/.test(normalized)) return normalized || fallback;

  return `/${locale}${normalized}`;
}

type Props = { nextUrl?: string };

export default function OnboardingClient({ nextUrl }: Props) {
  const t = useTranslations("auth.onboarding");
  const locale = useLocale();
  const router = useRouter();

  // Safe translation helper: never throws (prevents “spinner” from missing keys)
  function safeT(key: string, fallback = ""): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (t as any)(key) as string;
    } catch {
      return fallback;
    }
  }

  const safeNext = useMemo(() => normalizeNext(nextUrl, locale), [nextUrl, locale]);

  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // “Hard errors” only for save failures etc.
  const [err, setErr] = useState<string | null>(null);

  // Form
  const [role, setRole] = useState<Role | "">("");
  const [roleTouched, setRoleTouched] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [country, setCountry] = useState("NO");
  const [municipality, setMunicipality] = useState("");

  const [institutionType, setInstitutionType] = useState<InstitutionType | "">("");
  const [institutionName, setInstitutionName] = useState("");

  const isNorway = country === "NO";

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

  // Validation (disable submit)
  const chosenRole = role;
  const nameOk = !!displayName.trim();
  const countryOk = !!country.trim();
  const municipalityOk = !!municipality.trim();
  const roleOk = !!chosenRole;

  const canSubmit = roleOk && nameOk && countryOk && municipalityOk;

  // Friendly hint box (instead of “error”)
  const showRoleHint = roleTouched && !roleOk;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace(`/${locale}/login?next=${encodeURIComponent(safeNext)}`);
        return;
      }

      // Onboarding requires a non-anon account
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
            router.replace(safeNext);
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
          const orgInstitutionName = typeof org.institutionName === "string" ? org.institutionName : "";

          const rawInstType = org.institutionType;
          const instType: InstitutionType | "" = isInstitutionType(rawInstType) ? rawInstType : "";

          setCountry(String(orgCountry).trim() || "NO");
          setMunicipality(String(orgMunicipality).trim());
          setInstitutionType(instType);
          setInstitutionName(String(orgInstitutionName).trim());
        } else {
          setDisplayName(authName);
          setRole("");
          setRoleTouched(false);
          setCountry("NO");
          setMunicipality("");
          setInstitutionType("");
          setInstitutionName("");
        }
      } catch {
        setDisplayName((u.displayName || "").trim());
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router, safeNext, locale]);

  async function saveProfile() {
    if (!uid) return;

    setErr(null);

    // Mark touched to show hint if missing
    if (!roleTouched) setRoleTouched(true);

    const chosen = role;
    const name = displayName.trim();
    const c = country.trim();
    const m = municipality.trim();
    const instName = institutionName.trim();

    // Friendly: we don’t set “missingRole” as error anymore. Hint handles it.
    if (!chosen) return;

    // These can still be “errors” if user somehow bypasses disabled state
    if (!name) return setErr(safeT("errors.missingName", "Skriv inn fullt navn."));
    if (!c) return setErr(safeT("errors.missingCountry", "Velg land."));
    if (!m)
      return setErr(
        isNorway
          ? safeT("errors.missingMunicipalityNo", "Velg kommune.")
          : safeT("errors.missingMunicipalityOther", "Skriv inn by/område.")
      );

    setSaving(true);
    try {
      const ref = doc(db, "users", uid);

      const payload = stripUndefined({
        displayName: name,
        locale, // active locale
        role: chosen,

        org: stripUndefined({
          country: c,
          municipality: m,
          institutionType: chosen === "teacher" ? (institutionType || undefined) : undefined,
          institutionName: chosen === "teacher" ? (instName || undefined) : undefined,
        }),

        onboardingComplete: true,
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });

      await setDoc(ref, payload, { merge: true });

      // Hard redirect (avoids router edge cases)
      window.location.href = safeNext;
    } catch (e: unknown) {
      setErr(toErrorString(e));
    } finally {
      setSaving(false);
    }
  }

  // ===== UI styles =====
  const pageBg: React.CSSProperties = {
    minHeight: "100vh",
    padding: 16,
    background: "linear-gradient(180deg, rgba(124,199,255,0.18), rgba(255,255,255,1) 320px)",
  };

  const card: React.CSSProperties = {
    maxWidth: 760,
    margin: "40px auto",
    background: "white",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 18,
    boxShadow: "0 12px 34px rgba(0,0,0,0.10)",
    padding: 18,
  };

  const titleRow: React.CSSProperties = { display: "grid", gap: 6, marginBottom: 10 };

  const smallTop: React.CSSProperties = { fontSize: 12, opacity: 0.65, fontWeight: 900 };

  const inputStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.14)",
    outline: "none",
    background: "white",
  };

  const labelStyle: React.CSSProperties = { display: "grid", gap: 6 };

  const roleGrid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  };

  const roleCard = (active: boolean): React.CSSProperties => ({
    border: "1px solid rgba(0,0,0,0.14)",
    borderRadius: 14,
    padding: 12,
    cursor: "pointer",
    background: active ? "rgba(17,24,39,0.95)" : "white",
    color: active ? "white" : "black",
    boxShadow: active ? "0 10px 26px rgba(0,0,0,0.18)" : "0 1px 2px rgba(0,0,0,0.06)",
    display: "grid",
    gap: 4,
  });

  const hintBox: React.CSSProperties = {
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(245,158,11,0.35)",
    background: "rgba(245,158,11,0.10)",
    fontSize: 13,
  };

  const errorBox: React.CSSProperties = {
    marginTop: 12,
    padding: 12,
    border: "1px solid rgba(200,0,0,0.35)",
    borderRadius: 12,
    background: "rgba(200,0,0,0.06)",
    fontSize: 13,
  };

  const primaryBtn: React.CSSProperties = {
    marginTop: 8,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.14)",
    background: "black",
    color: "white",
    fontWeight: 900,
  };

  if (loading) {
    return (
      <main style={pageBg}>
        <div style={card}>
          <div style={titleRow}>
            <div style={smallTop}>{safeT("title", "Kom i gang")} · 1/1</div>
            <h1 style={{ margin: 0 }}>{safeT("title", "Kom i gang")}</h1>
            <p style={{ opacity: 0.75, margin: 0 }}>{safeT("loading", "Laster…")}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={pageBg}>
      <div style={card}>
        <div style={titleRow}>
          <div style={smallTop}>{safeT("title", "Kom i gang")} · 1/1</div>
          <h1 style={{ margin: 0 }}>{safeT("title", "Kom i gang")}</h1>
          <p style={{ opacity: 0.75, margin: 0 }}>
            {safeT("subtitle", "Navn er obligatorisk. Land og kommune velges fra liste. Institusjon er valgfritt.")}
          </p>
        </div>

        {err ? <div style={errorBox}>{err}</div> : null}

        <section style={{ marginTop: 14, display: "grid", gap: 12 }}>
          {/* ROLE PICKER */}
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 900 }}>{safeT("fields.role.label", "Velg rolle *")}</div>

            <div style={roleGrid}>
              <button
                type="button"
                onClick={() => {
                  setRoleTouched(true);
                  setRole("student");
                  setErr(null);
                }}
                style={roleCard(role === "student")}
              >
                <div style={{ fontWeight: 900, fontSize: 14 }}>
                  👩‍🎓 {safeT("fields.role.student", "Student")}
                </div>
                <div style={{ fontSize: 12, opacity: role === "student" ? 0.85 : 0.7 }}>
                  {safeT("fields.role.hint", "Velg rolle for å fortsette.")}
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setRoleTouched(true);
                  setRole("teacher");
                  setErr(null);
                }}
                style={roleCard(role === "teacher")}
              >
                <div style={{ fontWeight: 900, fontSize: 14 }}>
                  👩‍🏫 {safeT("fields.role.teacher", "Lærer")}
                </div>
                <div style={{ fontSize: 12, opacity: role === "teacher" ? 0.85 : 0.7 }}>
                  {safeT("fields.role.hint", "Velg rolle for å fortsette.")}
                </div>
              </button>
            </div>

            {showRoleHint ? (
              <div style={hintBox}>
                {safeT("errors.missingRole", "Velg rolle (Student eller Lærer).")}
              </div>
            ) : null}
          </div>

          <label style={labelStyle}>
            {safeT("fields.fullName.label", "Fullt navn *")}
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <GeoSearchSelect
              label={safeT("fields.country.label", "Land *")}
              value={country}
              options={countryOptions}
              placeholder={safeT("fields.country.placeholder", "Søk land…")}
              onChange={(v) => {
                setCountry(v);
                setMunicipality("");
              }}
            />

            {isNorway ? (
              <GeoSearchSelect
                label={safeT("fields.municipalityNo.label", "Kommune *")}
                value={municipality}
                options={municipalityOptions}
                placeholder={safeT("fields.municipalityNo.placeholder", "Søk kommune…")}
                onChange={setMunicipality}
              />
            ) : (
              <label style={labelStyle}>
                {safeT("fields.municipalityOther.label", "By/område *")}
                <input value={municipality} onChange={(e) => setMunicipality(e.target.value)} style={inputStyle} />
              </label>
            )}
          </div>

          {/* Institution only for teacher */}
          {role === "teacher" ? (
            <div style={{ marginTop: 6, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>
                {safeT("institution.title", "Læringsinstitusjon (valgfritt)")}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={labelStyle}>
                  {safeT("institution.typeLabel", "Type")}
                  <select
                    value={institutionType}
                    onChange={(e) => {
                      const v = e.target.value;
                      setInstitutionType(isInstitutionType(v) ? v : "");
                    }}
                    style={inputStyle}
                  >
                    <option value="">{safeT("institution.none", "Ingen")}</option>
                    {institutionOptions.map((x) => (
                      <option key={x.value} value={x.value}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={labelStyle}>
                  {safeT("institution.nameLabel", "Navn (valgfritt)")}
                  <input
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    style={inputStyle}
                    placeholder={safeT("institution.namePlaceholder", "")}
                  />
                </label>
              </div>
            </div>
          ) : null}

          <button
            onClick={() => {
              if (!roleTouched) setRoleTouched(true);
              saveProfile();
            }}
            disabled={saving || !canSubmit}
            style={{
              ...primaryBtn,
              cursor: saving || !canSubmit ? "not-allowed" : "pointer",
              opacity: saving || !canSubmit ? 0.55 : 1,
            }}
          >
            {saving ? safeT("buttons.saving", "Lagrer…") : safeT("buttons.complete", "Fullfør profil")}
          </button>

          {/* Small “what’s missing” hint */}
          {!canSubmit ? (
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {!roleOk ? `• ${safeT("errors.missingRole", "Velg rolle (Student eller Lærer).")}` : null}
              {!nameOk ? `${roleOk ? "" : " "}• ${safeT("errors.missingName", "Skriv inn fullt navn.")}` : null}
              {!countryOk ? ` • ${safeT("errors.missingCountry", "Velg land.")}` : null}
              {!municipalityOk
                ? ` • ${
                    isNorway
                      ? safeT("errors.missingMunicipalityNo", "Velg kommune.")
                      : safeT("errors.missingMunicipalityOther", "Skriv inn by/område.")
                  }`
                : null}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}