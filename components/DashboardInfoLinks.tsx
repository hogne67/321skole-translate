"use client";

import Link from "next/link";

const copy = {
  nb: {
    title: "Info og trygg bruk",
    text: "Finn informasjon om 321skole, personvern, skolebruk og kontakt.",
    links: [
      { href: "/about", label: "Om 321skole" },
      { href: "/pricing", label: "Priser" },
      { href: "/privacy", label: "Personvern" },
      { href: "/school/trust", label: "Trust center" },
      { href: "/school/dpa", label: "Databehandleravtale" },
      { href: "/contact", label: "Kontakt" },
    ],
  },
  en: {
    title: "Info and trust",
    text: "Find information about 321school, privacy, school use and contact.",
    links: [
      { href: "/about", label: "About 321school" },
      { href: "/pricing", label: "Pricing" },
      { href: "/privacy", label: "Privacy" },
      { href: "/school/trust", label: "Trust center" },
      { href: "/school/dpa", label: "Data processing" },
      { href: "/contact", label: "Contact" },
    ],
  },
  pt: {
    title: "Informação e confiança",
    text: "Veja informações sobre 321school, privacidade, uso escolar e contato.",
    links: [
      { href: "/about", label: "Sobre 321school" },
      { href: "/pricing", label: "Preços" },
      { href: "/privacy", label: "Privacidade" },
      { href: "/school/trust", label: "Trust center" },
      { href: "/school/dpa", label: "Tratamento de dados" },
      { href: "/contact", label: "Contato" },
    ],
  },
} as const;

function getCopy(locale: string) {
  if (locale.startsWith("en")) return copy.en;
  if (locale.startsWith("pt")) return copy.pt;
  return copy.nb;
}

export default function DashboardInfoLinks({ locale }: { locale: string }) {
  const c = getCopy(locale);

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h2 className="m-0 text-base font-black text-slate-950">{c.title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{c.text}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.links.map((item) => (
            <Link
              key={item.href}
              href={`/${locale}${item.href}`}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800 no-underline hover:bg-white"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
