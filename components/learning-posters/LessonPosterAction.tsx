"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { auth } from "@/lib/firebase";
import { posterCopy } from "@/lib/learningPosters/copy";
import { normalizedText } from "@/lib/learningPosters/model";
import "./learningPosters.css";
export default function LessonPosterAction({ lessonId, sourceText, save, disabled = false }: {
  lessonId: string; sourceText: string; save: () => Promise<boolean>; disabled?: boolean;
}) {
  const locale = useLocale(); const copy = posterCopy(locale); const router = useRouter();
  const [busy, setBusy] = useState(false); const inFlight = useRef(false); const [error, setError] = useState("");
  const [posters, setPosters] = useState<{ id: string; title: string; sourceText: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const user = auth.currentUser; if (!user || user.isAnonymous) return;
      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/producer/learning-posters?lessonId=${encodeURIComponent(lessonId)}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) return;
        const data = await response.json(); if (!cancelled && Array.isArray(data.posters)) setPosters(data.posters);
      } catch { /* Opening the generator still allows a fresh request. */ }
    })();
    return () => { cancelled = true; };
  }, [lessonId]);
  async function open() {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError("");
    try {
      if (!await save()) return;
      router.push(`/${locale}/producer/learning-posters?lessonId=${encodeURIComponent(lessonId)}`);
    } catch { setError(copy.genericError); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="lp-launch"><button type="button" disabled={disabled || busy || !sourceText.trim()} onClick={() => void open()}>{busy ? copy.working : copy.launch}</button>
    {error && <p role="alert">{error}</p>}
    {posters.length > 0 && <><p style={{ marginTop: 12, fontWeight: 700 }}>{copy.linked}</p><ul>{posters.map(p => <li key={p.id}>
      <Link href={`/${locale}/producer/learning-posters?posterId=${encodeURIComponent(p.id)}`}>{p.title}</Link>
      {normalizedText(p.sourceText) !== normalizedText(sourceText) && <span style={{ display: "block", color: "#92400e", fontSize: 13 }}>{copy.sourceChanged}</span>}
    </li>)}</ul></>}
  </div>;
}
