"use client";

import Link from "next/link";
import { ArrowUpRight, DoorOpen, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

export default function SpaceRoomCard({ spaceId, title, memberCount, loading = false }: {
  spaceId: string;
  title: string;
  memberCount?: number;
  loading?: boolean;
}) {
  const t = useTranslations("spaces");
  const locale = useLocale();

  return (
    <Link
      href={`/${locale}/teacher/spaces/${spaceId}`}
      className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 no-underline shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 sm:p-6 motion-reduce:transform-none"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100">
          <DoorOpen className="h-6 w-6" aria-hidden="true" />
        </span>
        <ArrowUpRight className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:text-emerald-700" aria-hidden="true" />
      </div>
      <h2 className="mt-5 break-words text-lg font-bold text-slate-900">{title || t("list.untitled")}</h2>
      <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
        <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{t("list.members")} <span className="font-semibold text-slate-700">{loading ? "…" : memberCount ?? "—"}</span></span>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm font-semibold text-emerald-700">
        <span>{t("list.openSpace")}</span>
        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
      </div>
    </Link>
  );
}
