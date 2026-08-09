"use client";

import Link from "next/link";
import { useState } from "react";

const PROMO_CODE = "START321";

const copy = {
  nb: {
    eyebrow: "Lanseringstilbud",
    title: "50 % rabatt de første 3 månedene",
    text: "Bruk koden START321 i checkout. Eksempel: Student Pro 79 kr blir 39,50 kr/mnd i kampanjeperioden.",
    landingText: "Det er gratis å opprette bruker og teste plattformen. Bruk START321 hvis du vil oppgradere senere.",
    cta: "Se abonnement",
    copy: "Kopier kode",
    copied: "Kopiert",
  },
  en: {
    eyebrow: "Launch offer",
    title: "50% off for the first 3 months",
    text: "Use code START321 at checkout. Example: Student Pro £6.99 becomes about £3.50/month during the campaign.",
    landingText: "It is free to create an account and try the platform. Use START321 if you choose to upgrade later.",
    cta: "See plans",
    copy: "Copy code",
    copied: "Copied",
  },
  pt: {
    eyebrow: "Oferta de lançamento",
    title: "50% de desconto nos primeiros 3 meses",
    text: "Use o código START321 no checkout. Exemplo: Student Pro R$29,99 fica cerca de R$15/mês durante a campanha.",
    landingText: "É grátis criar uma conta e testar a plataforma. Use START321 se quiser fazer upgrade depois.",
    cta: "Ver planos",
    copy: "Copiar código",
    copied: "Copiado",
  },
} as const;

type CampaignLocale = keyof typeof copy;

function campaignLocale(locale: string): CampaignLocale {
  if (locale === "en" || locale === "pt") return locale;
  return "nb";
}

export default function LaunchCampaignBanner({
  locale,
  href,
  variant = "dashboard",
}: {
  locale: string;
  href: string;
  variant?: "landing" | "dashboard";
}) {
  const [copied, setCopied] = useState(false);
  const t = copy[campaignLocale(locale)];
  const isLanding = variant === "landing";

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(PROMO_CODE);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section
      className={
        isLanding
          ? "border-y border-emerald-200 bg-emerald-50/85"
          : "rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm"
      }
    >
      <div
        className={
          isLanding
            ? "mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3"
            : "flex flex-wrap items-center justify-between gap-3"
        }
      >
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-wide text-emerald-700">
            {t.eyebrow}
          </div>
          <div className="mt-0.5 text-base font-black text-slate-950 md:text-lg">
            {t.title}
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">
            {isLanding ? t.landingText : t.text}
          </p>
        </div>

        {!isLanding ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copyCode}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-black text-emerald-800 shadow-sm hover:bg-emerald-50"
            >
              {copied ? t.copied : t.copy}
            </button>
            <Link
              href={href}
              className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-slate-800"
            >
              {t.cta}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
