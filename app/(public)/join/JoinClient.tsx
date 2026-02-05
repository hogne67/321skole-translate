// app/(public)/join/JoinClient.tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

async function findSpaceByCode(codeRaw: string) {
  const code = (codeRaw || "").trim().toUpperCase();
  if (!code) return null;

  const tries = [
    query(collection(db, "spaces"), where("code", "==", code), limit(1)),
    query(collection(db, "spaces"), where("joinCode", "==", code), limit(1)),
    query(collection(db, "spaces"), where("join.code", "==", code), limit(1)),
  ];

  for (const qy of tries) {
    const snap = await getDocs(qy);
    if (!snap.empty) return snap.docs[0];
  }
  return null;
}

export default function JoinClient() {
  const sp = useSearchParams();
  const router = useRouter();

  const initialCode = useMemo(() => (sp.get("code") ?? "").trim(), [sp]);
  const [code, setCode] = useState(initialCode);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const c = code.trim().toUpperCase();
    if (!c) return;

    setBusy(true);
    setErr(null);

    try {
      const spaceDoc = await findSpaceByCode(c);
      if (!spaceDoc) {
        setErr("Fant ikke space med denne koden. Sjekk at koden er riktig.");
        return;
      }

      const spaceId = spaceDoc.id;

      // MVP: gå til space (landing/overview)
      router.push(`/space/${spaceId}`);
    } catch (e: unknown) {
      const msg = (e as { message?: unknown })?.message;
      setErr(typeof msg === "string" ? msg : "Join feilet");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>Join</h1>

      <form onSubmit={onSubmit} style={{ marginTop: 12 }}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Space code"
          style={{ padding: 8, width: 240 }}
          disabled={busy}
        />
        <button type="submit" style={{ marginLeft: 8, padding: "8px 12px" }} disabled={busy}>
          {busy ? "Joining…" : "Join"}
        </button>
      </form>

      {err ? (
        <div style={{ marginTop: 12, color: "crimson", whiteSpace: "pre-wrap" }}>
          {err}
        </div>
      ) : null}
    </div>
  );
}