"use client";

import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import { useUserProfile } from "@/lib/useUserProfile";
import { useLocale, useTranslations } from "next-intl";

function withLocale(locale: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (!href.startsWith("/")) return href;

  const seg = href.split("/")[1];
  if (seg === "en" || seg === "nb" || seg === "no" || seg === "pt") return href;

  if (href === "/") return `/${locale}`;
  return `/${locale}${href}`;
}

export default function TeacherWritingPage() {
  return (
    <AuthGate>
      <TeacherWritingInner />
    </AuthGate>
  );
}

function TeacherWritingInner() {
  const t = useTranslations("teacherWritingStation");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { profile, loading } = useUserProfile();

  const canUse = profile?.role === "teacher" || profile?.role === "admin";

  if (loading) {
    return <div className="w-full py-4 text-sm text-slate-600">{tCommon("loading")}</div>;
  }

  if (!canUse) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
        {t("fallback.unknownError")}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">{t("hub.title")}</h1>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-black uppercase text-amber-800">
                {t("hub.beta")}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{t("hub.subtitle")}</p>
          </div>
          <Link
            href={withLocale(locale, "/teacher/spaces")}
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50"
          >
            {t("actions.backToSpace")}
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black text-emerald-950">{t("hub.newTitle")}</h2>
            <p className="mt-1 text-sm leading-5 text-emerald-900">{t("hub.newSubtitle")}</p>
          </div>
          <Link
            href={withLocale(locale, "/producer/text/new")}
            className="inline-flex items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white hover:bg-emerald-800"
          >
            {t("hub.form.create")}
          </Link>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-xl font-black text-slate-950">{t("hub.libraryTitle")}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{t("hub.libraryMoved")}</p>
        <Link
          href={withLocale(locale, "/content?filter=writing")}
          className="mt-4 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50"
        >
          {t("hub.openMyContent")}
        </Link>
      </section>
    </div>
  );
}
