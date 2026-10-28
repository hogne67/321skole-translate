import { schoolDpaContent as copyFor } from "@/lib/trust/schoolContent";
import { TrustNavigation } from "@/components/trust/TrustNavigation";
import Link from "next/link";
import { getLocale } from "next-intl/server";

type Section = { id?: string; title: string; body: string; points: string[] };

function localizedPath(locale: string, path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

export default async function SchoolDpaPage() {
  const locale = (await getLocale()) as string;
  const text = copyFor(locale);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <TrustNavigation locale={locale} currentPath="/school/dpa" />

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
          <p className="inline-flex rounded-full bg-amber-50 px-4 py-2 text-sm font-bold text-amber-900">{text.eyebrow}</p>
          <h1 className="mt-5 text-4xl font-black tracking-tight md:text-6xl">{text.title}</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-700">{text.lead}</p>
          <p className="mt-5 text-sm font-semibold text-slate-500">{text.updated}</p>
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">{text.warning}</div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-8 md:grid-cols-2">
        {text.sections.map((section) => <InfoCard key={section.title} section={section} />)}
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-14">
        <div className="rounded-2xl bg-slate-950 p-6 text-white md:p-8">
          <h2 className="text-2xl font-black">{text.relatedTitle}</h2>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {text.relatedLinks.map((link) => (
              <Link key={link.href} href={localizedPath(locale, link.href)} className="inline-flex justify-center rounded-xl border border-white/25 px-5 py-3 text-sm font-black text-white hover:bg-white/10">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function InfoCard(props: { section: Section }) {
  return (
    <article id={props.section.id} className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-black">{props.section.title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">{props.section.body}</p>
      <ul className="mt-4 grid gap-2">
        {props.section.points.map((point) => <li key={point} className="text-sm leading-6 text-slate-700">• {point}</li>)}
      </ul>
    </article>
  );
}
