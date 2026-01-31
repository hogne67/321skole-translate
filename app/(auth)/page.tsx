//app/(auth)/page.tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { signInWithGoogle } from "@/lib/auth";
import { useState } from "react";

export default function LoginPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const next = sp.get("next") || "/";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <main style={{ maxWidth: 520, margin: "60px auto", padding: 16 }}>
      <h1 style={{ margin: 0 }}>Logg inn</h1>
      <p style={{ opacity: 0.75, marginTop: 8 }}>
        Fortsett med Google. Flere metoder kan legges til senere.
      </p>

      {error ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid rgba(200,0,0,0.35)",
            borderRadius: 12,
          }}
        >
          {error}
        </div>
      ) : null}

      <button
        onClick={async () => {
          setError(null);
          setLoading(true);
          try {
            await signInWithGoogle();
            router.replace(next);
          } catch (e: any) {
            setError(e?.message || "Kunne ikke logge inn.");
          } finally {
            setLoading(false);
          }
        }}
        disabled={loading}
        style={{
          marginTop: 16,
          width: "100%",
          padding: "12px 12px",
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.14)",
          background: "white",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
          fontWeight: 600,
        }}
      >
        {loading ? "Logger inn…" : "Fortsett med Google"}
      </button>
    </main>
  );
}
