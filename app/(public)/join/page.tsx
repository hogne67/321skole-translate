// app/(public)/join/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { findSpaceByCode } from "@/lib/spacesClient";

export default function JoinPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [code, setCode] = useState(sp.get("code") ?? "");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const qCode = sp.get("code");
    if (qCode) setCode(qCode);
  }, [sp]);

  async function onJoin() {
    setErr(null);
    setLoading(true);
    try {
      const res = await findSpaceByCode(code);
      if (!res) {
        setErr("Fant ikke space. Sjekk koden.");
        return;
      }
      router.push(`/space/${res.spaceId}`);
    } catch (e: any) {
      setErr(e?.message ?? "Ukjent feil");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: 16 }}>
      <h1>Bli med i klasse</h1>
      <p style={{ opacity: 0.8 }}>Skriv inn koden du fikk av læreren.</p>

      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="ABC123"
        style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
      />

      {err && <div style={{ color: "crimson", marginTop: 10 }}>{err}</div>}

      <button
        onClick={onJoin}
        disabled={loading}
        style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10 }}
      >
        {loading ? "Sjekker..." : "Bli med"}
      </button>
    </div>
  );
}
