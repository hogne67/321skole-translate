// app/(auth)/onboarding/OnboardingClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import GeoSearchSelect from "@/components/geo/GeoSearchSelect";
import { COUNTRIES } from "@/lib/geo/countries";
import { NO_MUNICIPALITY_NAMES } from "@/lib/geo/noMunicipalities";

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

export default function OnboardingClient({ nextUrl }: { nextUrl?: string }) {
  const router = useRouter();

  const safeNext = useMemo(() => {
    const rawNext = nextUrl || "/student";
    const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/student";
    if (next === "/login" || next === "/onboarding" || next === "/") return "/student";
    return next;
  }, [nextUrl]);

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
          const p = (snap.data() ?? {}) as Record<string, unknown>;

          if (p.onboardingComplete === true) {
            router.replace(safeNext || "/student");
            return;
          }

          const pDisplayName = typeof p.displayName === "string" ? p.displayName : "";
          setDisplayName(String(pDisplayName || authName || "").trim());

          const org = (p.org ?? {}) as Record<string, unknown>;

          const orgCountry = typeof org.country === "string" ? org.country : "NO";
          const orgMunicipality = typeof org.municipality === "string" ? org.municipality : "";
          const orgInstitutionName =
            typeof org.institutionName === "string" ? org.institutionName : "";

          const rawInstType = org.institutionType;
          const instType: InstitutionType | "" = isInstitutionType(rawInstType) ? rawInstType : "";

          setCountry(String(orgCountry).trim() || "NO");
          setMunicipality(String(orgMunicipality).trim());

          setInstitutionType(instType);
          setInstitutionName(String(orgInstitutionName).trim());
        } else {
          setDisplayName(authName);
          setCountry("NO");
          setMunicipality("");
          setInstitutionType("");
          setInstitutionName("");
        }
      } catch {
        // hvis noe feiler under lesing av profil – fall tilbake på auth displayName
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
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });

      await setDoc(ref, payload, { merge: true });

      // send videre til "safeNext" (ikke hardkod /student)
      window.location.href = safeNext;
      return;
    } catch (err: unknown) {
      setErr(toErrorString(err));
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
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={inputStyle}
          />
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
              <input
                value={municipality}
                onChange={(e) => setMunicipality(e.target.value)}
                style={inputStyle}
              />
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
                onChange={(e) => {
                  const v = e.target.value;
                  setInstitutionType(isInstitutionType(v) ? v : "");
                }}
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
