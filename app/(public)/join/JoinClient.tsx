// app/(public)/join/JoinClient.tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export default function JoinClient() {
  const sp = useSearchParams();
  const router = useRouter();

  // eksempel: /join?code=ABC123
  const initialCode = useMemo(() => (sp.get("code") ?? "").trim(), [sp]);

  const [code, setCode] = useState(initialCode);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim();
    if (!c) return;

    // TODO: din join-flow her (router.push til space, eller kall API, osv.)
    // router.push(`/spaces/join?code=${encodeURIComponent(c)}`);
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
        />
        <button type="submit" style={{ marginLeft: 8, padding: "8px 12px" }}>
          Join
        </button>
      </form>
    </div>
  );
}
