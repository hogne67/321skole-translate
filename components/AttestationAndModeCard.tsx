// AttestationAndModeCard
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";

type Mode = "student" | "teacher" | "creator" | "parent";

function isMode(v: unknown): v is Mode {
  return v === "student" || v === "teacher" || v === "creator" || v === "parent";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const anyErr = err as { code?: unknown; message?: unknown };
    const code = typeof anyErr.code === "string" ? anyErr.code : "";
    const msg = typeof anyErr.message === "string" ? anyErr.message : "";
    if (code && msg) return `${code}: ${msg}`;
    if (msg) return msg;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function readModeFromProfile(profile: unknown): Mode {
  if (!isRecord(profile)) return "student";
  const m = profile["mode"];
  return isMode(m) ? m : "student";
}

function readAttestation(profile: unknown): { acceptedAt: unknown | null; version: string | null } {
  if (!isRecord(profile)) return { acceptedAt: null, version: null };
  const att = profile["attestation"];
  if (!isRecord(att)) return { acceptedAt: null, version: null };

  const acceptedAt = att["acceptedAt"] ?? null;
  const versionRaw = att["version"];
  const version = typeof versionRaw === "string" ? versionRaw : null;

  return { acceptedAt, version };
}

type Props = {
  attestationVersion?: string;
  allowedModes?: Mode[];
  requireAttestationForProModes?: boolean;
  className?: string;
};

export default function AttestationAndModeCard({
  attestationVersion = "2026-02-09",
  allowedModes = ["student", "teacher", "creator", "parent"],
  requireAttestationForProModes = true,
  className = "",
}: Props) {
  const { user, profile, loading } = useUserProfile();

  const currentMode: Mode = useMemo(() => readModeFromProfile(profile), [profile]);

  const { acceptedAt: attestedAt, version: attestedVersion } = useMemo(
    () => readAttestation(profile),
    [profile]
  );
  const hasAttested = Boolean(attestedAt);

  const [mode, setMode] = useState<Mode>(currentMode);
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // ✅ Hold UI-mode i sync når profile oppdateres (f.eks. etter save)
  useEffect(() => {
    setMode(currentMode);
  }, [currentMode]);

  const canChooseMode = Boolean(user) && !busy;
  const proMode = mode === "teacher" || mode === "creator";

  const blockedByAttestation = requireAttestationForProModes && proMode && !hasAttested;

  async function ensureUserDoc() {
    if (!user) return;
    const ref = doc(db, "users", user.uid);
    const payload = {
      uid: user.uid,
      createdAt: serverTimestamp(),
      mode: currentMode,
    };

    console.log("[attestation/mode] ensureUserDoc setDoc merge", {
      path: `users/${user.uid}`,
      payloadKeys: Object.keys(payload),
    });

    await setDoc(ref, payload, { merge: true });
  }

  async function saveAttestation() {
    if (!user) return;
    setBusy(true);
    setMsg(null);

    const ref = doc(db, "users", user.uid);
    const payload = {
      attestation: {
        version: attestationVersion,
        acceptedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    };

    console.log("[attestation] saveAttestation clicked", {
      uid: user.uid,
      path: `users/${user.uid}`,
      payload: { attestationVersion },
    });

    try {
      await ensureUserDoc();

      try {
        await updateDoc(ref, payload);
        console.log("[attestation] SAVE OK");
      } catch (e) {
        console.error("[attestation] SAVE FAILED", e);
        throw e;
      }

      setAccept(false);
      setMsg("Attestering lagret ✅");
    } catch (e: unknown) {
      setMsg(getErrorMessage(e) || "Kunne ikke lagre attestering.");
    } finally {
      setBusy(false);
    }
  }

  async function saveMode(next: Mode) {
    if (!user) return;
    setBusy(true);
    setMsg(null);

    const ref = doc(db, "users", user.uid);
    const payload = {
      mode: next,
      updatedAt: serverTimestamp(),
    };

    console.log("[mode] saveMode clicked", {
      uid: user.uid,
      path: `users/${user.uid}`,
      next,
      blockedByAttestation,
      currentMode,
    });

    try {
      await ensureUserDoc();

      try {
        await updateDoc(ref, payload);
        console.log("[mode] SAVE OK");
      } catch (e) {
        console.error("[mode] SAVE FAILED", e);
        throw e;
      }

      // Optimistisk UI (men useEffect syncer også etter profile update)
      setMode(next);
      setMsg("Rolle oppdatert ✅");
    } catch (e: unknown) {
      setMsg(getErrorMessage(e) || "Kunne ikke oppdatere rolle.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className={`rounded-2xl border p-4 ${className}`}>
        <div className="text-sm text-muted-foreground">Laster…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={`rounded-2xl border p-4 ${className}`}>
        <div className="text-base font-semibold">Du må være innlogget</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Logg inn for å velge rolle og signere krav.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Rolle og krav</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Velg hvordan du vil bruke 321skole. Teacher/Creator krever attestering for å kunne dele
            til Space (B1).
          </p>
        </div>

        <div className="text-right text-xs text-muted-foreground">
          <div>UID: {user.uid.slice(0, 8)}…</div>
        </div>
      </div>

      {/* Status */}
      <div className="mt-4 rounded-xl border p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Status:</span>
          <span className="rounded-full border px-2 py-0.5">
            Mode: <b>{currentMode}</b>
          </span>
          <span className="rounded-full border px-2 py-0.5">
            Attestering: <b>{hasAttested ? "OK" : "mangler"}</b>
          </span>
          {hasAttested && (
            <span className="rounded-full border px-2 py-0.5">
              Versjon: <b>{attestedVersion || "ukjent"}</b>
            </span>
          )}
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          Public/publisering til 321skole kan du senere “gjerde” strengere (fullt navn + AI-sjekk).
        </p>
      </div>

      {/* Mode select */}
      <div className="mt-5">
        <label className="text-sm font-medium">Velg rolle (mode)</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {allowedModes.map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                disabled={!canChooseMode}
                onClick={() => setMode(m)}
                className={[
                  "rounded-xl border px-3 py-2 text-sm",
                  active ? "bg-black text-white" : "bg-white",
                  !canChooseMode ? "opacity-60" : "hover:shadow-sm",
                ].join(" ")}
              >
                {m}
              </button>
            );
          })}
        </div>

        {blockedByAttestation && (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
            For å bruke <b>{mode}</b> og kunne dele til Space (B1), må du først godta krav.
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={!canChooseMode || blockedByAttestation || mode === currentMode}
            onClick={() => saveMode(mode)}
            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Lagre rolle
          </button>
          <span className="text-xs text-muted-foreground">
            (Dette endrer kun UI/flow — rettigheter styres av rules)
          </span>
        </div>
      </div>

      {/* Attestation */}
      <div className="mt-6">
        <label className="text-sm font-medium">Attestering (krav)</label>
        <div className="mt-2 rounded-xl border p-3">
          <div className="text-sm">
            <div className="font-medium">Jeg bekrefter at jeg har lest og godtar kravene</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Versjon: <b>{attestationVersion}</b>
            </div>
          </div>

          {!hasAttested ? (
            <>
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={accept}
                  onChange={(e) => setAccept(e.target.checked)}
                  className="h-4 w-4"
                />
                Jeg godtar kravene
              </label>

              <button
                type="button"
                disabled={!accept || busy}
                onClick={saveAttestation}
                className="mt-3 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Lagre attestering
              </button>
            </>
          ) : (
            <div className="mt-2 text-sm">✅ Attestering er lagret. Du kan nå dele til Space (B1).</div>
          )}
        </div>
      </div>

      {msg && <div className="mt-4 rounded-xl border p-3 text-sm">{msg}</div>}
    </div>
  );
}