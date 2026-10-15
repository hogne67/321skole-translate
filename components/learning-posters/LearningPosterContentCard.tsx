"use client";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ContentItem } from "@/lib/contentFeed";
import { posterLanguageLabel, posterLevelLabel } from "@/lib/learningPosters/presentation";
import PosterThumbnail from "./PosterThumbnail";

export default function LearningPosterContentCard({ poster, accountUid }: {
  poster: Extract<ContentItem, { type: "learningPoster" }>; accountUid: string;
}) {
  const locale = useLocale(); const t = useTranslations("content");
  const version = poster.updatedAt?.getTime() || 0;
  return <article className="box-border w-full min-w-0 rounded-2xl border border-solid border-slate-300 bg-white p-3 shadow-sm sm:p-4">
    <div className="flex min-w-0 flex-col gap-4 sm:flex-row">
      <Link href={poster.href} aria-label={t("posters.openEdit")} className="block aspect-[4/3] w-full max-w-[240px] shrink-0 self-start overflow-hidden rounded-xl border border-solid border-sky-200 bg-sky-50 no-underline sm:w-44">
        <PosterThumbnail key={`${accountUid}:${locale}:${poster.id}:${version}`} posterId={poster.id} accountUid={accountUid} version={version} title={poster.title} />
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
