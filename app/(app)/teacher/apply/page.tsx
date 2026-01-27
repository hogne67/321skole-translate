"use client";

import { auth, db } from "@/lib/firebase";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useUserProfile } from "@/lib/useUserProfile";
import Link from "next/link";
import { useState } from "react";

export default function TeacherApplyPage() {
  const { profile, loading } = useUserProfile();
  const [busy, setBusy] = useState(false);

  if (loading) return <div style={{ padding: 24 }}>Laster…</div>;
  if (!profile) return null;

  const status = profile.teacherStatus;

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16 }}>
      <h1>Teacher-tilgang</h1>

      {status === "approved" ? (
        <p>
          Du er godkjent ✅ Gå til <Link href="/teacher">Teacher</Link>.
        </p>
      ) : status === "pending" ? (
        <p>
          Søknaden din er sendt og venter på godkjenning ⏳
          <br />
          (I test: sett <code>teacherStatus</code> til <code>approved</code> i Firestore.)
        </p>
      ) : (
        <>
          <p style={{ opacity: 0.8 }}>
            Teacher-tilgang gir mulighet til å lage og publisere oppgaver.
          </p>

          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const user = auth.currentUser;
                if (!user) return;

                await updateDoc(doc(db, "users", user.uid), {
                  teacherStatus: "pending",
                  updatedAt: serverTimestamp(),
                });
              } finally {
                setBusy(false);
              }
            }}
            style={{
              marginTop: 12,
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.14)",
              background: "white",
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.6 : 1,
              fontWeight: 600,
            }}
          >
            {busy ? "Sender…" : "Send søknad"}
          </button>
        </>
      )}
    </main>
  );
}
