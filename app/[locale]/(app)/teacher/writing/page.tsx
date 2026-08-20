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

function guestWritingCopy(locale: string) {
  if (locale === "en") {
    return {
      banner: "You can explore Text as a guest. Sign in as a teacher when you want to create and save writing activities.",
      loginCreate: "Sign in to create",
    };
  }
  if (locale === "pt") {
    return {
      banner: "Você pode explorar Texto como convidado. Entre como professor quando quiser criar e salvar atividades de escrita.",
      loginCreate: "Entrar para criar",
    };
  }
  return {
    banner: "Som gjest kan du utforske Tekst. Logg inn som lærer når du vil lage og lagre skriveaktiviteter.",
    loginCreate: "Logg inn for å lage",
  };
}

export default function TeacherWritingPage() {
  return (
    <AuthGate allowAnonymous>
      <TeacherWritingInner />
    </AuthGate>
  );
}

function TeacherWritingInner() {
  const t = useTranslations("teacherWritingStation");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { user, profile, loading } = useUserProfile();

  const isGuestPreview = Boolean(user?.isAnonymous);
  const canUse = !isGuestPreview && (profile?.role === "teacher" || profile?.role === "admin");
  const loginHref = withLocale(locale, `/login?next=${encodeURIComponent(`/${locale}/teacher/writing`)}`);
  const guestText = guestWritingCopy(locale);

  if (loading) {
    return <div className="w-full py-4 text-sm text-slate-600">{tCommon("loading")}</div>;
  }

  if (!canUse && !isGuestPreview) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
        {t("fallback.unknownError")}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">{t("hub.title")}</h1>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-black uppercase text-amber-800">
                {t("hub.beta")}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{t("hub.subtitle")}</p>
          </div>
          <div className="flex min-w-64 items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-3">
            <div className="grid h-14 w-20 shrink-0 place-items-center rounded-xl border border-sky-100 bg-white">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-700 text-sm font-black text-white">
                {t("hub.videoPlay")}
              </span>
            </div>
            <div>
              <div className="text-sm font-black text-slate-950">{t("hub.videoTitle")}</div>
              <p className="mt-1 text-xs leading-5 text-slate-600">{t("hub.videoSubtitle")}</p>
            </div>
          </div>
        </div>
      </section>

      {isGuestPreview ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold leading-6 text-blue-900">
          {guestText.banner}
        </div>
      ) : null}

      <section className="space-y-4">
        <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm sm:p-5">
          <div className="flex h-full flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black text-emerald-950">{t("hub.newTitle")}</h2>
              <p className="mt-1 text-sm leading-5 text-emerald-900">{t("hub.newSubtitle")}</p>
            </div>
            <Link
              href={isGuestPreview ? loginHref : withLocale(locale, "/producer/text/new")}
              className="inline-flex w-fit shrink-0 items-center justify-center rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-800"
            >
              {isGuestPreview ? guestText.loginCreate : t("hub.form.create")}
            </Link>
          </div>
        </article>

        <article className="rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm sm:p-5">
          <div className="flex h-full flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black text-sky-950">{t("hub.imageWritingTitle")}</h2>
              <p className="mt-1 text-sm leading-5 text-sky-900">{t("hub.imageWritingSubtitle")}</p>
            </div>
            <Link
              href={isGuestPreview ? loginHref : withLocale(locale, "/producer/image-writing")}
              className="inline-flex w-fit shrink-0 items-center justify-center rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-black text-white hover:bg-sky-800"
            >
              {isGuestPreview ? guestText.loginCreate : t("hub.imageWritingAction")}
            </Link>
          </div>
        </article>
      </section>
    </div>
  );
}
