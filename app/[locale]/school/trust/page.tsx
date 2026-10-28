import { schoolTrustContent } from "@/lib/trust/schoolContent";
import { municipalityDocuments } from "@/lib/trust/schoolReport";
import { translated as t } from "@/lib/trust/schoolFacts";
import { TrustNavigation } from "@/components/trust/TrustNavigation";
import { MunicipalAssessment } from "@/components/trust/MunicipalAssessment";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  Database,
  FileText,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { getLocale } from "next-intl/server";

type LinkItem = { href: string; label: string; note?: string };
type Section = {
  title: string;
  text: string;
  icon: ReactNode;
  links: LinkItem[];
};
type Copy = {
  back: string;
  eyebrow: string;
  title: string;
  lead: string;
  updated: string;
  promisesTitle: string;
  promises: string[];
  audienceTitle: string;
  audience: Array<{ title: string; text: string }>;
  sections: Section[];
  sovereigntyTitle: string;
  sovereigntyText: string;
  sovereigntyPoints: string[];
  cookiesTitle: string;
  cookiesText: string;
  cookiesPoints: string[];
  municipalTemplatesTitle: string;
  municipalTemplatesText: string;
  municipalTemplatesPoints: string[];
  feideTitle: string;
  feideText: string;
  feidePoints: string[];
  footerTitle: string;
  footerText: string;
  contactCta: string;
};

function localizedPath(locale: string, path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

function copyFor(locale: string): Copy {
  return { ...schoolTrustContent(locale), sections: municipalityDocuments(locale).map(document => ({ title: document.title, text: document.summary, icon: <FileText />, links: document.links })) };
}

export default async function SchoolTrustPage() {
  const locale = (await getLocale()) as string;
  const text = copyFor(locale);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <TrustNavigation locale={locale} currentPath="/school/trust" />

      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 md:grid-cols-[1.05fr_0.95fr] md:items-center md:py-16">
          <div>
            <p className="inline-flex rounded-full bg-sky-50 px-4 py-2 text-sm font-bold text-sky-800">
              {text.eyebrow}
            </p>
            <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight md:text-6xl">{text.title}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">{text.lead}</p>
            <p className="mt-5 text-sm font-semibold text-slate-500">{text.updated}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
            <h2 className="text-xl font-black">{text.promisesTitle}</h2>
            <ul className="mt-4 grid gap-3">
              {text.promises.map((promise) => (
                <li key={promise} className="flex gap-3 text-sm leading-6 text-slate-700">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <span>{promise}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <h2 className="text-2xl font-black">{text.audienceTitle}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {text.audience.map((item, index) => (
            <Link href={localizedPath(locale, ["/school/feide", "/school/privacy#purpose-users", "/school/privacy"][index])} key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-sky-400 focus-visible:outline-2 focus-visible:outline-sky-700">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                {index === 0 ? <UserRoundCheck className="h-5 w-5" /> : index === 1 ? <LockKeyhole className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
              </div>
              <h3 className="mt-4 text-lg font-black">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-700">{item.text}</p>
            </Link>
          ))}
        </div>
      </section>

      <section id="documents" aria-label={t(locale, ["Dokumentasjon for skoler og skoleeiere", "Documentation for schools and school owners", "Documentação para escolas e mantenedoras"])} className="mx-auto grid max-w-6xl gap-4 px-6 py-8 md:grid-cols-2">
        {text.sections.map((section) => (
          <TrustSection key={section.title} locale={locale} section={section} />
        ))}
      </section>

      <MunicipalAssessment locale={locale} />

      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-8 md:grid-cols-2">
        <DetailPanel
          icon={<Database className="h-5 w-5" />}
          title={text.sovereigntyTitle}
          text={text.sovereigntyText}
          points={text.sovereigntyPoints}
        />
        <DetailPanel
          icon={<LockKeyhole className="h-5 w-5" />}
          title={text.cookiesTitle}
          text={text.cookiesText}
          points={text.cookiesPoints}
        />
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <DetailPanel
          icon={<FileText className="h-5 w-5" />}
          title={text.municipalTemplatesTitle}
          text={text.municipalTemplatesText}
          points={text.municipalTemplatesPoints}
        />
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="rounded-2xl bg-slate-950 p-6 text-white md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-sky-200">
                <KeyRound className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-2xl font-black">{text.feideTitle}</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/80">{text.feideText}</p>
            </div>
          </div>
          <ul className="mt-5 grid gap-2 md:grid-cols-3">
            {text.feidePoints.map((point) => (
              <li key={point} className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-white/80">
                {point}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-14">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-2xl font-black">{text.footerTitle}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">{text.footerText}</p>
          <Link href={localizedPath(locale, "/contact")} className="mt-5 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800">
            {text.contactCta}
          </Link>
        </div>
      </section>
    </main>
  );
}

function TrustSection(props: { locale: string; section: Section }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-sky-700 [&_svg]:h-5 [&_svg]:w-5">
          {props.section.icon}
        </div>
        <div>
          <h2 className="text-xl font-black">{props.section.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">{props.section.text}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        {props.section.links.map((link) => (
          <Link
            key={`${props.section.title}-${link.href}-${link.label}`}
            href={localizedPath(props.locale, link.href)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-100"
          >
            {link.label}
            {link.note ? <span className="ml-2 font-semibold text-slate-500">{link.note}</span> : null}
          </Link>
        ))}
      </div>
    </article>
  );
}

function DetailPanel(props: { icon: ReactNode; title: string; text: string; points: string[] }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-sky-700">
          {props.icon}
        </div>
        <div>
          <h2 className="text-xl font-black">{props.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">{props.text}</p>
        </div>
      </div>
      <ul className="mt-4 grid gap-2">
        {props.points.map((point) => (
          <li key={point} className="text-sm leading-6 text-slate-700">• {point}</li>
        ))}
      </ul>
    </article>
  );
}
