// app/(app)/creator/apply/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

export default function CreatorApplyPage() {
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

  const isCreator = !!profile?.roles?.creator;
  const isTeacherApproved = profile?.teacherStatus === "approved" && !!profile?.roles?.teacher;

  const creatorStatus = profile?.creatorStatus || "none";

  // Hvis du allerede er creator, gå til creator-dashboard
  useEffect(() => {
    if (loading) return;
    if (isCreator) router.replace("/creator");
  }, [isCreator, loading, router]);

  if (loading) return <div style={{ padding: 16 }}>Laster…</div>;

  // Ikke innlogget -> AuthGate vil normalt sende til login, men vi har fallback:
  if (!user) {
    return (
      <div style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
        <h1 style={{ marginTop: 0 }}>Creator</h1>
        <p style={{ opacity: 0.8 }}>Du må være innlogget for å søke om creator.</p>
        <Link href="/login">Gå til login</Link>
      </div>
    );
  }

  // Teacher trenger ikke søke (policy)
  if (isTeacherApproved) {
    return (
      <div style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
        <h1 style={{ marginTop: 0 }}>Creator</h1>
        <p style={{ opacity: 0.85 }}>
          Du er godkjent teacher. Teacher får creator-tilgang automatisk.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
          <Link href="/creator">Gå til Creator</Link>
          <Link href="/teacher">Tilbake til Teacher</Link>
        </div>

        <p style={{ marginTop: 14, opacity: 0.75, fontSize: 12 }}>
          (Hvis du ikke kommer inn i Creator: sjekk at admin-approve har satt <code>roles.creator=true</code>.)
        </p>
      </div>
    );
  }

  // Hvis status pending/rejected, vis tydelig
  const statusLabel =
    creatorStatus === "pending"
      ? "pending"
      : creatorStatus === "approved"
        ? "approved"
        : creatorStatus === "rejected"
          ? "rejected"
          : "none";

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Søk om Creator</h1>

      <p style={{ opacity: 0.85, marginTop: 8 }}>
        Creator kan lage og redigere lessons. Dette krever innlogging og godkjenning.
      </p>

      <div
        style={{
          marginTop: 10,
          padding: 12,
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.12)",
          background: "white",
        }}
      >
        <div style={{ opacity: 0.75, fontSize: 13 }}>Din status</div>
        <div style={{ fontWeight: 800, marginTop: 4 }}>{statusLabel}</div>

        {creatorStatus === "pending" && (
          <p style={{ marginTop: 10, opacity: 0.8 }}>
            Søknaden din er sendt og venter på godkjenning.
          </p>
        )}

        {creatorStatus === "rejected" && (
          <p style={{ marginTop: 10, opacity: 0.8 }}>
            Søknaden ble avslått. Du kan søke på nytt.
          </p>
        )}

        {(creatorStatus === "none" || creatorStatus === "rejected") && (
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
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
                  console.log("[CREATOR APPLY] ERROR =>", e?.code, e?.message, e);
                  setMsg(`Kunne ikke sende søknad: ${e?.message || "ukjent feil"}`);
                } finally {
                  setSaving(false);
                }
              }}
              style={{ padding: "10px 12px", borderRadius: 10 }}
            >
              {saving ? "Sender…" : "Søk om creator"}
            </button>

            <Link href="/teacher/spaces">Tilbake</Link>
          </div>
        )}

        {msg && <div style={{ marginTop: 10, opacity: 0.9 }}>{msg}</div>}
      </div>

      <p style={{ marginTop: 14, opacity: 0.75, fontSize: 12 }}>
        NB: Anonyme brukere kan ikke være creator.
      </p>
    </div>
  );
}
