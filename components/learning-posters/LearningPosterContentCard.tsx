"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { auth } from "@/lib/firebase";
import type { ContentItem } from "@/lib/contentFeed";
import { posterLanguageLabel, posterLevelLabel } from "@/lib/learningPosters/presentation";

export default function LearningPosterContentCard({ poster, accountUid }: {
  poster: Extract<ContentItem, { type: "learningPoster" }>; accountUid: string;
}) {
  const locale = useLocale(); const t = useTranslations("content");
  const thumbnailRef = useRef<HTMLAnchorElement>(null);
  const version = poster.updatedAt?.getTime() || 0;
  const [thumbnail, setThumbnail] = useState(""); const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let objectUrl = ""; let started = false;
    const load = async () => {
      if (started) return; started = true;
      try {
        const user = auth.currentUser;
        if (!user || user.uid !== accountUid) throw new Error("unauthorized");
        const token = await user.getIdToken();
        const response = await fetch(`/api/producer/learning-posters?posterId=${encodeURIComponent(poster.id)}&thumbnail=1&locale=${encodeURIComponent(locale)}&v=${version}`, {
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
    if (thumbnailRef.current) observer.observe(thumbnailRef.current);
    return () => { controller.abort(); observer.disconnect(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [accountUid, locale, poster.id, version]);
  return <article className="box-border w-full min-w-0 rounded-2xl border border-solid border-slate-300 bg-white p-3 shadow-sm sm:p-4">
    <div className="flex min-w-0 flex-col gap-4 sm:flex-row">
      <Link ref={thumbnailRef} href={poster.href} aria-label={t("posters.openEdit")} className="block aspect-[4/3] w-full max-w-[240px] shrink-0 self-start overflow-hidden rounded-xl border border-solid border-sky-200 bg-sky-50 no-underline sm:w-44">
        {thumbnail ? <img src={thumbnail} alt={t("posters.thumbnailAlt", { title: poster.title })} width={480} height={360} className="h-full w-full object-contain" />
          : <div className="grid h-full place-items-center p-3 text-center text-xs text-slate-500">{failed ? t("posters.thumbnailUnavailable") : t("posters.loadingThumbnail")}</div>}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-black uppercase tracking-wide text-sky-700">{t("cardTypes.learningPoster")}</div>
        <h2 className="mt-2 break-words text-base font-black leading-tight text-slate-900"><Link href={poster.href} className="text-slate-900 no-underline hover:underline">{poster.title}</Link></h2>
        <p className="mt-2 text-sm text-slate-600">{posterLevelLabel(poster.level)} · {posterLanguageLabel(poster.language, locale)}</p>
        {poster.updatedAt && <p className="mt-1 text-xs text-slate-500">{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(poster.updatedAt)}</p>}
        {poster.sourceTitle && <p className="mt-2 break-words text-sm text-slate-600">{t("posters.source")}: {poster.sourceHref ? <Link href={poster.sourceHref} className="underline">{poster.sourceTitle}</Link> : poster.sourceTitle}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={poster.href} className="inline-flex items-center justify-center rounded-xl border border-solid border-slate-300 bg-white px-3 py-2 text-sm font-extrabold text-slate-800 no-underline hover:bg-zinc-50">{t("posters.openEdit")}</Link>
          {poster.sourceHref && <Link href={poster.sourceHref} className="inline-flex items-center justify-center rounded-xl border border-solid border-slate-300 bg-white px-3 py-2 text-sm font-extrabold text-slate-800 no-underline hover:bg-zinc-50">{t("posters.openSource")}</Link>}
        </div>
      </div>
    </div>
  </article>;
}
