"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useMemo } from "react";

export default function ThanksPage() {
  const params = useParams<{ spaceId: string; lessonId: string }>();
  const sp = useSearchParams();

  const spaceId = params?.spaceId;
  const lessonId = params?.lessonId;

  const name = useMemo(() => (sp.get("name") ?? "").trim(), [sp]);
  const submissionId = useMemo(() => (sp.get("sid") ?? "").trim(), [sp]);

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Takk!</h1>

      <p style={{ opacity: 0.85 }}>
        Innleveringen er sendt{ name ? <> inn som <b>{name}</b></> : null }.
      </p>

      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {submissionId ? (
          <div style={{ padding: 12, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Kvittering</div>
            <div style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.8 }}>{submissionId}</div>
          </div>
        ) : null}

        <Link
          href={`/space/${spaceId}`}
          style={{ display: "inline-flex", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 10, textDecoration: "none", width: "fit-content" }}
        >
          ← Tilbake til space
        </Link>

        <Link
          href={`/space/${spaceId}/lesson/${lessonId}`}
          style={{ display: "inline-flex", padding: "10px 12px", border: "1px solid #ddd", borderRadius: 10, textDecoration: "none", width: "fit-content" }}
        >
          Åpne oppgaven igjen
        </Link>
      </div>
    </main>
  );
}