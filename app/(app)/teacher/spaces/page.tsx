// app/(app)/teacher/spaces/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import type { SpaceDoc } from "@/lib/spacesClient";
import AttestationAndModeCard from "@/components/AttestationAndModeCard";

type Row = { id: string; data: SpaceDoc };
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

export default function TeacherSpacesPage() {
  // ✅ kun innlogging, ikke “approved teacher”
  return (
    <AuthGate>
      <TeacherSpacesInner />
    </AuthGate>
  );
}

function TeacherSpacesInner() {
  const { user, profile, loading } = useUserProfile();
  const [rows, setRows] = useState<Row[]>([]);

  const mode: Mode = useMemo(() => readModeFromProfile(profile), [profile]);
  const hasAttested = useMemo(() => readHasAttested(profile), [profile]);

  const canCreateSpace =
    Boolean(user?.uid) && hasAttested && (mode === "teacher" || mode === "creator");

  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, "spaces"),
      where("ownerId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    return onSnapshot(q, (snap) => {
      const next: Row[] = snap.docs.map((d) => ({
        id: d.id,
        data: (d.data() as SpaceDoc) ?? ({} as SpaceDoc),
      }));
      setRows(next);
    });
  }, [user?.uid]);

  if (loading) {
    return (
      <div style={{ maxWidth: 920, margin: "0 auto", padding: 16, opacity: 0.8 }}>
        Laster…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Teacher Spaces</h1>

        {/* ✅ Hvis ikke B1-ready: send til /teacher/spaces/new som viser guard og AttestationAndModeCard */}
        <Link
          href="/teacher/spaces/new"
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: canCreateSpace ? "1px solid transparent" : "1px solid rgba(0,0,0,0.2)",
            background: canCreateSpace ? "black" : "transparent",
            color: canCreateSpace ? "white" : "inherit",
            textDecoration: "none",
          }}
        >
          + New space
        </Link>
      </div>

      <p style={{ opacity: 0.8 }}>
        Spaces er klasser du kan dele oppgaver i via lenke eller kode. (B1: Deling til Space krever attestering, men
        ikke fullt navn.)
      </p>

      {/* ✅ Inline B1-hjelp hvis de ikke oppfyller krav */}
      {!canCreateSpace && (
        <div style={{ display: "grid", gap: 12, marginBottom: 14 }}>
          <AttestationAndModeCard
            attestationVersion="2026-02-09"
            allowedModes={["student", "teacher", "creator", "parent"]}
            requireAttestationForProModes={true}
          />
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((r) => (
          <div
            key={r.id}
            style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 12 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700 }}>{r.data.title}</div>
                <div style={{ opacity: 0.75 }}>
                  Kode: <b>{r.data.code}</b> · Åpen: {r.data.isOpen ? "Ja" : "Nei"}
                </div>
              </div>
              <Link href={`/teacher/spaces/${r.id}`}>Open</Link>
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <div style={{ opacity: 0.75 }}>Ingen spaces ennå. Lag en med “New space”.</div>
        )}
      </div>
    </div>
  );
}