"use client";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { auth } from "@/lib/firebase";
import { posterCopy } from "@/lib/learningPosters/copy";

export default function PosterThumbnail({ posterId, accountUid, version = 0, title }: {
  posterId: string; accountUid: string; version?: number; title: string;
}) {
  const locale = useLocale(); const copy = posterCopy(locale);
  const containerRef = useRef<HTMLDivElement>(null);
  const [thumbnail, setThumbnail] = useState(""); const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let objectUrl = ""; let started = false;
    const load = async () => {
      if (started) return; started = true;
      try {
        const user = auth.currentUser;
        if (!user || user.uid !== accountUid) throw new Error("unauthorized");
        const token = await user.getIdToken();
        const response = await fetch(`/api/producer/learning-posters?posterId=${encodeURIComponent(posterId)}&thumbnail=1&locale=${encodeURIComponent(locale)}&v=${version}`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        if (!response.ok || auth.currentUser?.uid !== accountUid) throw new Error("thumbnail_unavailable");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob); setThumbnail(objectUrl);
      } catch { if (!controller.signal.aborted) setFailed(true); }
    };
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void load(); }
    }, { rootMargin: "200px" });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => { controller.abort(); observer.disconnect(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [accountUid, locale, posterId, version]);
  return <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
    {thumbnail ? <img src={thumbnail} alt={`${copy.thumbnailOf} ${title}`} width={480} height={360} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      : <div style={{ display: "grid", height: "100%", placeItems: "center", padding: 12, textAlign: "center", fontSize: 12, color: "#64748b" }}>{failed ? copy.thumbnailError : copy.thumbnailLoading}</div>}
  </div>;
}
