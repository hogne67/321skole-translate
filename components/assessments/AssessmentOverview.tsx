import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, FileText, Headphones, MessageCircle, Mic, Calculator, Printer } from "lucide-react";
import { ASSESSMENT_PLANS, getAssessmentCopy } from "@/lib/assessments/catalog";

const SUPPORT_TOOLS = [
  { id: "writingTool", description: "writingToolDescription", href: "/producer/text/new", icon: FileText },
  { id: "audioTool", description: "audioToolDescription", href: "/tools/audio-reading", icon: Mic },
  { id: "speakingTool", description: "speakingToolDescription", href: "/tools/speaking-topic", icon: MessageCircle },
  { id: "mathTool", description: "mathToolDescription", href: "/producer/math", icon: Calculator },
] as const;

export default function AssessmentOverview({ locale }: { locale: string }) {
  const copy = getAssessmentCopy(locale);
  return (
    <main className="mx-auto box-border w-full min-w-0 max-w-5xl px-4 py-8 text-slate-900">
      <Link href={`/${locale}/tools`} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 no-underline hover:text-sky-800">
        <ArrowLeft size={16} aria-hidden="true" />{copy.back}
      </Link>
      <header className="mb-7">
        <h1 className="text-3xl font-extrabold tracking-tight">{copy.title}</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">{copy.subtitle}</p>
        <p className="mt-4 rounded-xl border border-solid border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">{copy.overviewNote}</p>
      </header>

      <section aria-labelledby="available-assessments" className="mb-8">
        <h2 id="available-assessments" className="mb-3 text-xl font-bold">{copy.available}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
        <Link href={`/${locale}/producer/reading-tests/new`} className="group block rounded-2xl border border-solid border-sky-300 bg-sky-50 p-5 text-slate-900 no-underline transition hover:border-sky-500 hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700 sm:p-6">
          <BookOpen size={32} className="mb-4 text-sky-700" aria-hidden="true" />
          <div className="flex flex-wrap items-center gap-3"><h3 className="text-xl font-bold">{copy.reading}</h3><span className="rounded-full border border-solid border-sky-200 bg-white px-3 py-1 text-xs font-bold text-sky-800">{copy.readingLevel}</span></div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">{copy.readingDescription}</p>
          <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-600"><Printer size={16} aria-hidden="true" />{copy.readingFormat}</p>
          <span className="mt-5 inline-flex items-center gap-2 font-bold text-sky-800">{copy.readingAction}<ArrowRight size={18} aria-hidden="true" /></span>
        </Link>
        <Link href={`/${locale}/tools/listening-tests`} className="group block rounded-2xl border border-solid border-sky-300 bg-sky-50 p-5 text-slate-900 no-underline transition hover:border-sky-500 hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700 sm:p-6">
          <Headphones size={32} className="mb-4 text-sky-700" aria-hidden="true" />
          <div className="flex flex-wrap items-center gap-3"><h3 className="text-xl font-bold">{copy.listening}</h3><span className="rounded-full border border-solid border-sky-200 bg-white px-3 py-1 text-xs font-bold text-sky-800">{copy.firstVersion}</span></div>
          <p className="mt-2 text-sm leading-6 text-slate-700">{copy.listeningDescription}</p>
          <p className="mt-4 text-sm font-semibold text-slate-600">{copy.listeningFormat}</p>
          <span className="mt-5 inline-flex items-center gap-2 font-bold text-sky-800">{copy.listeningAction}<ArrowRight size={18} aria-hidden="true" /></span>
        </Link>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-600">{copy.readingNote}</p>
      </section>

      <section aria-labelledby="assessment-support" className="mb-8">
        <h2 id="assessment-support" className="text-xl font-bold">{copy.togetherTitle}</h2>
        <p className="mb-4 mt-2 text-sm leading-6 text-slate-600">{copy.togetherDescription}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {SUPPORT_TOOLS.map(({ id, description, href, icon: Icon }) => (
            <Link key={id} href={`/${locale}${href}`} className="group min-w-0 rounded-xl border border-solid border-slate-200 bg-white p-5 text-slate-900 no-underline transition hover:border-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700">
              <Icon size={26} className="mb-3 text-sky-700" aria-hidden="true" />
              <h3 className="text-lg font-bold">{copy[id]}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{copy[description]}</p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-sky-800">{copy.openTool}<ArrowRight size={16} aria-hidden="true" /></span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="planned-assessments" className="mb-8">
        <h2 id="planned-assessments" className="text-xl font-bold">{copy.plannedTitle}</h2>
        <p className="mb-4 mt-2 text-sm leading-6 text-slate-600">{copy.plannedDescription}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {ASSESSMENT_PLANS.map(id => (
            <article key={id} className="min-w-0 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-base font-bold">{copy[id]}</h3><span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-600">{copy.planned}</span></div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{copy[`${id}Description`]}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-5 rounded-2xl border border-solid border-sky-200 bg-sky-50 p-5 sm:grid-cols-2" aria-label={copy.formatTitle}>
        <div><FileText size={24} className="mb-3 text-sky-700" aria-hidden="true" /><h2 className="text-base font-bold">{copy.formatTitle}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{copy.formatDescription}</p></div>
        <div><Headphones size={24} className="mb-3 text-sky-700" aria-hidden="true" /><h2 className="text-base font-bold">{copy.paperTitle}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{copy.paperDescription}</p></div>
      </section>
    </main>
  );
}
