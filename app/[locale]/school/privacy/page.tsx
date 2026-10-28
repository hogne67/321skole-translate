import { schoolPrivacyContent as copyFor } from "@/lib/trust/schoolContent";
import { TrustNavigation } from "@/components/trust/TrustNavigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2, Database, Eye, LockKeyhole, School, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { getLocale } from "next-intl/server";

function localizedPath(locale: string, path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

export default async function SchoolPrivacyPage() {
  const locale = (await getLocale()) as string;
  const text = copyFor(locale);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <TrustNavigation locale={locale} currentPath="/school/privacy" />

      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 md:grid-cols-[1.1fr_0.9fr] md:items-center md:py-16">
          <div>
            <p className="inline-flex rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800">
              {text.eyebrow}
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight md:text-6xl">{text.title}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">{text.lead}</p>
            <p className="mt-5 text-sm font-semibold text-slate-500">{text.updated}</p>
          </div>
          <div className="grid gap-3">
            {text.cards.map((card, index) => (
              <TrustCard key={card.title} icon={index === 0 ? <UserRound /> : index === 1 ? <LockKeyhole /> : index === 2 ? <School /> : <Sparkles />} title={card.title} text={card.text} />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-8 md:grid-cols-2">
        {text.sections.map((section, index) => (
          <InfoSection
            key={section.title}
            icon={index === 0 ? <School /> : index === 1 ? <LockKeyhole /> : index === 2 ? <ShieldCheck /> : index === 3 ? <LockKeyhole /> : index === 4 ? <Sparkles /> : index === 5 ? <Database /> : index === 6 ? <ShieldCheck /> : <Eye />}
            title={section.title}
            id={section.id}
            body={section.body}
            points={section.points}
          />
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-14">
        <div className="rounded-2xl bg-slate-950 p-6 text-white md:p-8">
          <h2 className="text-2xl font-black">{text.contactTitle}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/80">{text.contactText}</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link href={localizedPath(locale, "/contact")} className="inline-flex justify-center rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950 hover:bg-slate-100">
              {text.contactCta}
            </Link>
            <Link href={localizedPath(locale, "/school/subprocessors")} className="inline-flex justify-center rounded-xl border border-white/25 px-5 py-3 text-sm font-black text-white hover:bg-white/10">
              {text.subprocessorsCta}
            </Link>
            <Link href={localizedPath(locale, "/school/data-rights")} className="inline-flex justify-center rounded-xl border border-white/25 px-5 py-3 text-sm font-black text-white hover:bg-white/10">
              {text.dataRightsCta}
            </Link>
            <Link href={localizedPath(locale, "/school/dpa")} className="inline-flex justify-center rounded-xl border border-white/25 px-5 py-3 text-sm font-black text-white hover:bg-white/10">
              {text.dpaCta}
            </Link>
            <Link href={localizedPath(locale, "/school/ai-guidelines")} className="inline-flex justify-center rounded-xl border border-white/25 px-5 py-3 text-sm font-black text-white hover:bg-white/10">
              {text.aiGuidelinesCta}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function TrustCard(props: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm [&_svg]:h-5 [&_svg]:w-5">
          {props.icon}
        </div>
        <div>
          <h2 className="text-base font-black">{props.title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{props.text}</p>
        </div>
      </div>
    </article>
  );
}

function InfoSection(props: { id?: string; icon: ReactNode; title: string; body: string; points?: string[] }) {
  return (
    <article id={props.id} className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-sky-700 [&_svg]:h-5 [&_svg]:w-5">
          {props.icon}
        </div>
        <div>
          <h2 className="text-xl font-black">{props.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">{props.body}</p>
        </div>
      </div>
      {props.points?.length ? (
        <ul className="mt-4 grid gap-2">
          {props.points.map((point) => (
            <li key={point} className="flex gap-2 text-sm leading-6 text-slate-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
