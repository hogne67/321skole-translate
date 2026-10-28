import { schoolAiContent } from "@/lib/trust/schoolContent";
import { TrustNavigation } from "@/components/trust/TrustNavigation";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  BadgeCheck,
  Eye,
  ImageIcon,
  LockKeyhole,
  Scale,
  School,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import { getLocale } from "next-intl/server";

type Section = {
  id?: string;
  title: string;
  body: string;
  points: string[];
  icon: ReactNode;
};

function localizedPath(locale: string, path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

function copyFor(locale: string) {
  const copy = schoolAiContent(locale);
  const icons = [UserRoundCheck, Sparkles, ImageIcon, School, LockKeyhole, Eye, ShieldCheck];
  return { ...copy, sections: copy.sections.map((section, index) => {
    const Icon = icons[index % icons.length];
    return { ...section, icon: <Icon /> };
  }) };
}

export default async function SchoolAiGuidelinesPage() {
  const locale = (await getLocale()) as string;
  const text = copyFor(locale);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <TrustNavigation locale={locale} currentPath="/school/ai-guidelines" />

      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 md:grid-cols-[1.05fr_0.95fr] md:items-start md:py-16">
          <div>
            <p className="inline-flex rounded-full bg-sky-50 px-4 py-2 text-sm font-bold text-sky-800">
              {text.eyebrow}
            </p>
            <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight md:text-6xl">{text.title}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">{text.lead}</p>
            <p className="mt-5 text-sm font-semibold text-slate-500">{text.updated}</p>
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white text-sky-700 shadow-sm">
              <Scale className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-xl font-black">{text.noticeTitle}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-700">{text.noticeText}</p>
            <p className="mt-3 text-sm leading-6 text-slate-700">{text.municipalStatus}</p>
            <Link href={localizedPath(locale, "/school/trust#school-assessment")} className="mt-4 inline-flex rounded-lg text-sm font-bold text-sky-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-sky-700">{text.assessmentCta}</Link>
          </aside>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-2xl font-black">{text.principlesTitle}</h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {text.principles.map((principle) => (
              <li key={principle} className="flex gap-3 text-sm leading-6 text-slate-700">
                <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <span>{principle}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-8 md:grid-cols-2">
        {text.sections.map((section) => (
          <GuidelineCard key={section.title} section={section} />
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-14">
        <div className="rounded-2xl bg-slate-950 p-6 text-white md:p-8">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-sky-200">
            <Sparkles className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-2xl font-black">{text.footerTitle}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/80">{text.footerText}</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link href={localizedPath(locale, "/school/privacy")} className="inline-flex justify-center rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950 hover:bg-slate-100">
              {text.privacyCta}
            </Link>
            <Link href={localizedPath(locale, "/school/subprocessors")} className="inline-flex justify-center rounded-xl border border-white/25 px-5 py-3 text-sm font-black text-white hover:bg-white/10">
              {text.subprocessorsCta}
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
            {text.sourceLinks.map(link => (
              <a key={link.href} href={link.href} className="rounded text-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-white">{link.label}</a>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function GuidelineCard({ section }: { section: Section }) {
  return (
    <article id={section.id} className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-sky-700 [&_svg]:h-5 [&_svg]:w-5">
          {section.icon}
        </div>
        <div>
          <h2 className="text-xl font-black">{section.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">{section.body}</p>
        </div>
      </div>
      <ul className="mt-4 grid gap-2">
        {section.points.map((point) => (
          <li key={point} className="flex gap-2 text-sm leading-6 text-slate-700">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
