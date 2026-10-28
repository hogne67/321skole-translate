import { schoolDataRightsContent as copyFor } from "@/lib/trust/schoolContent";
import { TrustNavigation } from "@/components/trust/TrustNavigation";

import { getLocale } from "next-intl/server";

type Section = { title: string; body: string; points: string[] };

export default async function SchoolDataRightsPage() {
  const locale = (await getLocale()) as string;
  const text = copyFor(locale);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <TrustNavigation locale={locale} currentPath="/school/data-rights" />
      <Hero eyebrow={text.eyebrow} title={text.title} lead={text.lead} updated={text.updated} />
      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-8 md:grid-cols-2">
        {text.sections.map((section) => <InfoCard key={section.title} section={section} />)}
      </section>
      <Note title={text.noteTitle} text={text.noteText} links={text.sourceLinks} />
    </main>
  );
}

function Hero(props: { eyebrow: string; title: string; lead: string; updated: string }) {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
        <p className="inline-flex rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800">{props.eyebrow}</p>
        <h1 className="mt-5 text-4xl font-black tracking-tight md:text-6xl">{props.title}</h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-700">{props.lead}</p>
        <p className="mt-5 text-sm font-semibold text-slate-500">{props.updated}</p>
      </div>
    </section>
  );
}

function InfoCard(props: { section: Section }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-black">{props.section.title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">{props.section.body}</p>
      <ul className="mt-4 grid gap-2">
        {props.section.points.map((point) => <li key={point} className="text-sm leading-6 text-slate-700">• {point}</li>)}
      </ul>
    </article>
  );
}

function Note(props: { title: string; text: string; links: { href: string; label: string }[] }) {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-14">
      <div className="rounded-2xl bg-slate-950 p-6 text-white md:p-8">
        <h2 className="text-2xl font-black">{props.title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/80">{props.text}</p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
          {props.links.map(link => (
            <a key={link.href} href={link.href} className="rounded text-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-white">{link.label}</a>
          ))}
        </div>
      </div>
    </section>
  );
}
