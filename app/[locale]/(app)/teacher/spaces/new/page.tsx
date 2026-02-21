// app/(app)/teacher/spaces/new/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";
import { createSpaceForTeacher } from "@/lib/spacesClient";
import AttestationAndModeCard from "@/components/AttestationAndModeCard";

type Mode = "student" | "teacher" | "creator" | "parent";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function readModeFromProfile(profile: unknown): Mode {
  if (!isRecord(profile)) return "student";
  const m = profile["mode"];
  return m === "teacher" || m === "creator" || m === "parent" || m === "student"
    ? m
    : "student";
}

function readHasAttested(profile: unknown): boolean {
  if (!isRecord(profile)) return false;
  const att = profile["attestation"];
  if (!isRecord(att)) return false;
  return Boolean(att["acceptedAt"]);
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export default function NewSpacePage() {
  // ✅ Kun innlogging. Ikke rolle-godkjenning.
  return (
    <AuthGate>
      <NewSpaceInner />
    </AuthGate>
  );
}

function NewSpaceInner() {
  const { user, profile, loading } = useUserProfile();
  const router = useRouter();

  const mode: Mode = useMemo(() => readModeFromProfile(profile), [profile]);
  const hasAttested = useMemo(() => readHasAttested(profile), [profile]);
  const canCreateSpace =
    Boolean(user?.uid) && hasAttested && (mode === "teacher" || mode === "creator");

  const [title, setTitle] = useState("");
  const [isOpen, setIsOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onCreate() {
    setErr(null);

    if (!user?.uid) return setErr("Mangler user.");
    if (!hasAttested) return setErr("Du må godta krav før du kan opprette Space.");
    if (!(mode === "teacher" || mode === "creator")) {
      return setErr("Sett rolle til teacher eller creator før du oppretter Space.");
    }

    if (!title.trim()) return setErr("Gi space et navn.");

    setSaving(true);
    try {
      // NB: Vi beholder eksisterende klientfunksjon.
      // Den må skrive feltene rules krever (ownerId, title, code, isOpen).
      const res = await createSpaceForTeacher({
        ownerId: user.uid,
        title: title.trim(),
        isOpen,
      });

      router.push(`/teacher/spaces/${res.spaceId}`);
    } catch (e: unknown) {
      setErr(getErrorMessage(e) || "Ukjent feil");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>Laster…</div>
    );
  }

  // ✅ B1-guard: hvis ikke attestert eller feil mode, vis kortet og forklaring.
  if (!canCreateSpace) {
    return (
      <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
        <h1>New Teacher Space</h1>
        <p style={{ marginTop: 6, opacity: 0.8 }}>
          For å opprette Space (B1) må du godta krav (attestering). Du trenger ikke fullt navn.
        </p>

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr", marginTop: 16 }}>
          <AttestationAndModeCard
            attestationVersion="2026-02-09"
            allowedModes={["student", "teacher", "creator", "parent"]}
            requireAttestationForProModes={true}
          />

          <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 14, padding: 14 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Manglende krav</div>
            <ul style={{ margin: 0, paddingLeft: 18, opacity: 0.85 }}>
              {!user?.uid && <li>Du må være innlogget.</li>}
              {user?.uid && !(mode === "teacher" || mode === "creator") && (
                <li>
                  Sett rolle (mode) til <b>teacher</b> eller <b>creator</b>.
                </li>
              )}
              {user?.uid && !hasAttested && <li>Du må godta krav (attestering).</li>}
            </ul>
            <div style={{ marginTop: 10, fontSize: 13, opacity: 0.8 }}>
              Når dette er gjort, får du opp skjemaet for å opprette Space.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Skjema (din original, nesten uendret)
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1>New Teacher Space</h1>

      <label style={{ display: "block", marginBottom: 6 }}>Navn</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="F.eks. Norsk A2 – Gruppe 1"
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.2)",
        }}
      />

      <label style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={isOpen}
          onChange={(e) => setIsOpen(e.target.checked)}
        />
        Space er åpen for anonyme innleveringer (anbefalt i MVP)
      </label>

      {err && <div style={{ color: "crimson", marginTop: 10 }}>{err}</div>}

      <button
        onClick={onCreate}
        disabled={saving}
        style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10 }}
      >
        {saving ? "Creating..." : "Create"}
      </button>
    </div>
  );
}