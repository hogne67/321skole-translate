import Link from "next/link";
import { municipalAssessmentAreas, municipalAssessmentUi } from "@/lib/trust/municipalAssessment";
import { TRUST_SOURCES, translated as t } from "@/lib/trust/schoolFacts";

export function MunicipalAssessment({ locale }: { locale: string }) {
  const ui = municipalAssessmentUi(locale);
  return (
    <section id="school-assessment" aria-labelledby="school-assessment-title" className="mx-auto max-w-6xl scroll-mt-6 px-6 py-8">
      <h2 id="school-assessment-title" className="text-2xl font-black">{ui.title}</h2>
      <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-700">{ui.lead}</p>
      <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50 p-5 text-sm leading-7 text-slate-700">
        <p>{ui.status}</p>
        <p className="mt-3">{ui.hierarchy}</p>
        <p className="mt-3 text-xs leading-6">{ui.pilotStatus}</p>
      </div>
      <div className="mt-5 grid items-start gap-4 md:grid-cols-2">
        {municipalAssessmentAreas(locale).map(area => (
          <details key={area.id} id={`assess-${area.id}`} data-assessment-area={area.id} className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer rounded-lg font-bold text-slate-950 focus-visible:outline-2 focus-visible:outline-sky-700">
              <span className="text-lg">{area.title}</span>
              <span className="mt-2 block text-xs font-semibold text-slate-600">{ui.statuses[area.status]}</span>
            </summary>
            <dl className="mt-5 grid gap-4 text-sm leading-7">
              <div><dt className="font-bold">{ui.labels.data}</dt><dd className="ml-0 mt-1 text-slate-700">{area.data}</dd></div>
              <div><dt className="font-bold">{ui.labels.controls}</dt><dd className="ml-0 mt-1 text-slate-700">{area.controls}</dd></div>
              {area.proposal ? <div data-proposed-control="true" className="rounded-xl border border-amber-200 bg-amber-50 p-3"><dt className="font-bold text-amber-950">{ui.labels.proposal}</dt><dd className="ml-0 mt-1 text-amber-950">{area.proposal}</dd></div> : null}
            </dl>
            <Link href={`/${locale}${area.href}`} className="mt-4 inline-flex rounded-lg px-1 py-2 text-sm font-bold text-sky-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-sky-700">{ui.labels.more}</Link>
          </details>
        ))}
      </div>
      <p className="mt-5 max-w-4xl text-sm leading-7 text-slate-700">{ui.changes}</p>
      <a href={TRUST_SOURCES.schoolResponsibility} className="mt-3 inline-flex rounded-lg py-2 text-sm font-semibold text-sky-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-sky-700">{t(locale, ["Udir: skoleeiers personvernansvar", "Udir: school-owner privacy responsibilities", "Udir: responsabilidade de privacidade da mantenedora"])}</a>
    </section>
  );
}
