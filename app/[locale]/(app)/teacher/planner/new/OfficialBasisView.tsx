import { ExternalLink, ShieldCheck } from "lucide-react";
import type {
  OfficialCurriculumBasis,
  OfficialCurriculumSection,
} from "@/lib/planner/officialCurriculum";

export function OfficialBasisView({
  basis,
  selectedLevel,
}: {
  basis: OfficialCurriculumBasis;
  selectedLevel: string;
}) {
  return (
    <article className="grid gap-6 rounded-lg border border-emerald-200 bg-white p-5 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" aria-hidden="true" />
          <div>
            <p className="m-0 text-xs font-black uppercase text-emerald-800">Offisielt læreplangrunnlag</p>
            <h2 className="m-0 mt-1 break-words text-xl font-black text-slate-950">
              {basis.source.title} ({basis.source.planCode})
            </h2>
            <p className="mb-0 mt-2 text-sm leading-6 text-slate-600">
              Status: <strong>{basis.source.status}</strong> · Kompetansemål etter {basis.competenceLevel}
            </p>
          </div>
        </div>
        <a
          href={basis.source.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 no-underline hover:bg-slate-50"
        >
          Åpne hos Udir
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      </header>

      <div className="grid gap-2 border-y border-slate-200 py-4 text-sm sm:grid-cols-3">
        <SourceFact label="Kilde" value={basis.source.provider} />
        <SourceFact label="Valgt trinn" value={selectedLevel} />
        <SourceFact label="Hentet" value={formatTimestamp(basis.source.fetchedAt)} />
      </div>

      <OfficialSection title={`Kompetansemål etter ${basis.competenceLevel}`}>
        <ol className="m-0 grid gap-3 pl-5 text-sm leading-6 text-slate-800">
          {basis.competenceGoals.map((goal, index) => (
            <li key={`${index}-${goal}`}>{goal}</li>
          ))}
        </ol>
      </OfficialSection>

      <CurriculumSections title="Kjerneelementer" sections={basis.coreElements} />
      <CurriculumSections title="Tverrfaglige temaer" sections={basis.interdisciplinaryThemes} />
      <CurriculumSections title="Grunnleggende ferdigheter" sections={basis.basicSkills} />

      <OfficialSection title="Offisielt timetall">
        <p className="m-0 text-sm leading-6 text-slate-700">{basis.hours.note}</p>
        <p className="mb-0 mt-2 text-sm font-semibold leading-6 text-slate-700">
          Timetallet kan være fastsatt samlet for flere årstrinn. Lokal fordeling per skoleår legges inn av læreren senere.
        </p>
        <div className="mt-4 grid gap-5">
          {basis.hours.sections.map((section) => (
            <div key={section.title} className="overflow-x-auto">
              <h4 className="m-0 mb-2 text-sm font-black text-slate-950">{section.title}</h4>
              <table className="w-full border-collapse text-left text-sm">
                <tbody>
                  {section.rows.map((row, rowIndex) => (
                    <tr key={`${section.title}-${rowIndex}`} className="border-b border-slate-200">
                      {row.map((cell, cellIndex) => {
                        const Cell = rowIndex === 0 ? "th" : "td";
                        return (
                          <Cell key={`${rowIndex}-${cellIndex}`} className="px-2 py-2 align-top first:pl-0">
                            {cell}
                          </Cell>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </OfficialSection>
    </article>
  );
}

function CurriculumSections({ title, sections }: { title: string; sections: OfficialCurriculumSection[] }) {
  return (
    <OfficialSection title={title}>
      <div className="grid gap-4">
        {sections.length > 0 ? (
          sections.map((section, index) => (
            <div key={`${title}-${index}`}>
              {section.title ? <h4 className="m-0 text-sm font-black text-slate-950">{section.title}</h4> : null}
              <p className="mb-0 mt-1 text-sm leading-6 text-slate-700">{section.text}</p>
            </div>
          ))
        ) : (
          <p className="m-0 text-sm font-semibold text-amber-800">Ingen opplysninger publisert i denne delen.</p>
        )}
      </div>
    </OfficialSection>
  );
}

function OfficialSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-200 pt-5">
      <h3 className="m-0 mb-3 text-base font-black text-slate-950">{title}</h3>
      {children}
    </section>
  );
}

function SourceFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-bold uppercase text-slate-500">{label}</div>
      <div className="mt-1 font-bold text-slate-950">{value || "Ikke oppgitt"}</div>
    </div>
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
