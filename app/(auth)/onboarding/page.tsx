// app/(auth)/onboarding/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import GeoSearchSelect from "@/components/geo/GeoSearchSelect";
import { COUNTRIES } from "@/lib/geo/countries";
import { NO_MUNICIPALITY_NAMES } from "@/lib/geo/noMunicipalities";

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

type InstitutionType =
  | "school"
  | "kindergarten"
  | "adult_education"
  | "university"
  | "workplace"
  | "other";

const INSTITUTIONS: { value: InstitutionType; label: string }[] = [
  { value: "school", label: "Skole" },
  { value: "kindergarten", label: "Barnehage" },
  { value: "adult_education", label: "Voksenopplæring" },
  { value: "university", label: "Universitet / høyskole" },
  { value: "workplace", label: "Bedrift / arbeidsplass" },
  { value: "other", label: "Annet" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const safeNext = useMemo(() => {
    const rawNext = sp.get("next") || "/student";
    const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/student";
    if (next === "/login" || next === "/onboarding" || next === "/") return "/student";
    return next;
  }, [sp]);

  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace(`/login?next=${encodeURIComponent(safeNext)}`);
        return;
      }

      setUid(u.uid);
      setErr(null);

      try {
        const ref = doc(db, "users", u.uid);
        const snap = await getDoc(ref);
        const authName = (u.displayName || "").trim();

        if (snap.exists()) {
          const p: any = snap.data() || {};

          if (p.onboardingComplete === true) {
            router.replace(safeNext || "/student");
            return;
          }

          setDisplayName(String(p.displayName ?? authName ?? "").trim());

          const org = p.org || {};
          setCountry(String(org.country ?? "NO").trim() || "NO");
          setMunicipality(String(org.municipality ?? "").trim());

          setInstitutionType((org.institutionType as any) ?? "");
          setInstitutionName(String(org.institutionName ?? "").trim());
        } else {
          setDisplayName(authName);
          setCountry("NO");
          setMunicipality("");
          setInstitutionType("");
          setInstitutionName("");
        }
      } catch (e: any) {
        setDisplayName((u.displayName || "").trim());
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router, safeNext]);

  async function saveProfile() {
    if (!uid) return;

    setErr(null);

    const name = displayName.trim();
    const c = country.trim();
    const m = municipality.trim();
    const instName = institutionName.trim();

    if (!name) return setErr("Skriv inn fullt navn.");
    if (!c) return setErr("Velg land.");
    if (!m) return setErr(isNorway ? "Velg kommune." : "Skriv inn by/område.");

    setSaving(true);
    try {
      const ref = doc(db, "users", uid);

      const payload = stripUndefined({
        displayName: name,
        locale: "no",

        org: stripUndefined({
          country: c,
          municipality: m,
          institutionType: institutionType || undefined,
          institutionName: instName || undefined,
        }),

        onboardingComplete: true,

        // ✅ IKKE skriv caps her (unngå å overskrive defaults eller senere oppgraderinger)
        // ✅ IKKE skriv roles/teacherStatus her

        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });

      await setDoc(ref, payload as any, { merge: true });

      // MVP: trygg startside
      window.location.href = "/student";
      return;
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.14)",
    outline: "none",
  };

  if (loading) {
    return (
      <main style={{ maxWidth: 680, margin: "60px auto", padding: 16 }}>
        <h1 style={{ margin: 0 }}>Registrering</h1>
        <p style={{ opacity: 0.75, marginTop: 8 }}>Laster…</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 680, margin: "40px auto", padding: 16 }}>
      <h1 style={{ margin: 0 }}>Registrering</h1>
      <p style={{ opacity: 0.75, marginTop: 8 }}>
        Navn er påkrevd. Land/kommune velges fra liste. Institusjon er valgfritt.
      </p>

      {err ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid rgba(200,0,0,0.35)",
            borderRadius: 12,
            background: "rgba(200,0,0,0.06)",
          }}
        >
          {err}
        </div>
      ) : null}

      <section style={{ marginTop: 16, display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          Fullt navn *
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <GeoSearchSelect
            label="Land *"
            value={country}
            options={countryOptions}
            placeholder="Søk land…"
            onChange={(v) => {
              setCountry(v);
              setMunicipality("");
            }}
          />

          {isNorway ? (
            <GeoSearchSelect
              label="Kommune *"
              value={municipality}
              options={municipalityOptions}
              placeholder="Søk kommune…"
              onChange={setMunicipality}
            />
          ) : (
            <label style={{ display: "grid", gap: 6 }}>
              By/område *
              <input value={municipality} onChange={(e) => setMunicipality(e.target.value)} style={inputStyle} />
            </label>
          )}
        </div>

        <div style={{ marginTop: 6, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Læringsinstitusjon (valgfritt)</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              Type
              <select
                value={institutionType}
                onChange={(e) => setInstitutionType(e.target.value as any)}
                style={inputStyle}
              >
                <option value="">Ingen</option>
                {INSTITUTIONS.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              Navn (valgfritt)
              <input
                value={institutionName}
                onChange={(e) => setInstitutionName(e.target.value)}
                style={inputStyle}
              />
            </label>
          </div>
        </div>

        <button
          onClick={saveProfile}
          disabled={saving}
          style={{
            marginTop: 8,
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.14)",
            background: "black",
            color: "white",
            fontWeight: 900,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Lagrer…" : "Fullfør registrering"}
        </button>
      </section>
    </main>
  );
}
