// app/(app)/apply/teacher/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export default function ApplyTeacherPage() {
  const router = useRouter();
  const { user, profile, loading } = useUserProfile();

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // ✅ Hvis anonym: send til login for oppgradering (beholder uid via linking)
  useEffect(() => {
    if (loading) return;
    if (!user) return; // AuthGate håndterer login
    if (user.isAnonymous) {
      router.replace(`/login?next=${encodeURIComponent("/apply/teacher")}`);
    }
  }, [loading, user, router]);

  const status = profile?.teacherStatus ?? "none";

  async function apply() {
    if (!user) return;
    if (user.isAnonymous) {
      router.replace(`/login?next=${encodeURIComponent("/apply/teacher")}`);
      return;
    }

    setSaving(true);
    setMsg(null);

    try {
      await updateDoc(doc(db, "users", user.uid), {
        teacherStatus: "pending",
        updatedAt: serverTimestamp(),
      });
      setMsg("Søknaden er sendt ✅ (status: pending)");
    } catch (e: unknown) {
      console.error(e);
      setMsg(`Kunne ikke sende søknad: ${getErrorMessage(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthGate>
      <main style={{ maxWidth: 720, margin: "20px auto", padding: 16 }}>
        <h1 style={{ margin: 0 }}>Bli teacher</h1>
        <p style={{ opacity: 0.8, marginTop: 8 }}>
          Send en søknad. Når admin godkjenner får du tilgang til Teacher-dashbordet.
        </p>

        <div
          style={{
            marginTop: 16,
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 12,
            padding: 12,
            background: "white",
          }}
        >
          <div style={{ marginBottom: 10 }}>
            <b>Status:</b> {status}
          </div>

          {loading ? (
            <p style={{ margin: 0 }}>Laster…</p>
          ) : !user ? (
            <p style={{ margin: 0 }}>Du må være innlogget.</p>
          ) : user.isAnonymous ? (
            <div>
              <p style={{ margin: "0 0 10px" }}>
                Du bruker en midlertidig (anonym) bruker. Oppgrader kontoen for å sende søknad.
              </p>
              <button
                onClick={() => router.replace(`/login?next=${encodeURIComponent("/apply/teacher")}`)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.14)",
                  background: "rgba(190,247,192,1)",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Logg inn / oppgrader konto
              </button>
            </div>
          ) : status === "approved" ? (
            <a href="/teacher">Gå til Teacher →</a>
          ) : status === "pending" ? (
            <p style={{ margin: 0 }}>Søknaden din ligger til behandling.</p>
          ) : (
            <button
              onClick={apply}
              disabled={saving}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.14)",
                background: "white",
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Sender…" : "Søk om teacher-tilgang"}
            </button>
          )}

          {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}
        </div>
      </main>
    </AuthGate>
  );
}
