"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

export default function ApplyCreatorPage() {
  return (
    <AuthGate>
      <Inner />
    </AuthGate>
  );
}

function Inner() {
  const router = useRouter();
  const { user, profile, loading } = useUserProfile();

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const uid = user?.uid;
  const userRef = useMemo(() => (uid ? doc(db, "users", uid) : null), [uid]);

  const isCreator = profile?.roles?.creator === true;
  const creatorStatus = profile?.creatorStatus ?? "none";

  const isTeacherApproved =
    profile?.teacherStatus === "approved" && profile?.roles?.teacher === true;

  // Hvis allerede creator → rett inn
  useEffect(() => {
    if (loading) return;
    if (isCreator) router.replace("/creator");
  }, [isCreator, loading, router]);

  if (loading) return <div style={{ padding: 16 }}>Laster…</div>;

  if (!user) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
        <h1>Søk om Creator</h1>
        <p>Du må være innlogget for å søke.</p>
        <Link href="/login">Logg inn</Link>
      </div>
    );
  }

  if (user.isAnonymous) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
        <h1>Søk om Creator</h1>
        <p>Anonyme brukere kan ikke være creator.</p>
        <Link href="/login">Logg inn / opprett konto</Link>
      </div>
    );
  }

  // Teacher trenger ikke søke
  if (isTeacherApproved) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
        <h1>Creator</h1>
        <p>
          Du er godkjent teacher. Teacher får creator-tilgang automatisk.
        </p>
        <Link href="/creator">Gå til Creator</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <h1>Søk om Creator</h1>

      <p style={{ opacity: 0.85 }}>
        Creator kan lage og redigere lessons. Tilgang krever godkjenning.
      </p>

      <div
        style={{
          marginTop: 12,
          padding: 12,
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.12)",
          background: "white",
        }}
      >
        <div style={{ fontSize: 13, opacity: 0.7 }}>Din status</div>
        <div style={{ fontWeight: 800 }}>{creatorStatus}</div>

        {creatorStatus === "pending" && (
          <p style={{ marginTop: 10 }}>
            Søknaden er sendt og venter på godkjenning ⏳
          </p>
        )}

        {(creatorStatus === "none" || creatorStatus === "rejected") && (
          <button
            disabled={saving || !userRef}
            onClick={async () => {
              if (!userRef) return;
              setSaving(true);
              setMsg(null);
              try {
                await updateDoc(userRef, {
                  creatorStatus: "pending",
                  creatorAppliedAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
                setMsg("Søknad sendt ✅");
              } catch (e: any) {
                console.error("apply creator failed", e);
                setMsg("Kunne ikke sende søknad.");
              } finally {
                setSaving(false);
              }
            }}
            style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10 }}
          >
            {saving ? "Sender…" : "Søk om creator"}
          </button>
        )}

        {msg && <div style={{ marginTop: 10 }}>{msg}</div>}
      </div>

      <div style={{ marginTop: 14 }}>
        <Link href="/student">Tilbake</Link>
      </div>
    </div>
  );
}
