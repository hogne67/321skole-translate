"use client";

import type { Planner } from "@/lib/planner/types";

type PlannerDocumentViewOptions = {
  showWeekPlans?: boolean;
  showReflectionLog?: boolean;
  showYearEndSummary?: boolean;
  periodId?: string;
};

export function PlannerDocumentView({
  planner,
  options = {},
}: {
  planner: Planner;
  options?: PlannerDocumentViewOptions;
}) {
  const { document, frame, curriculum } = planner;
  const showWeekPlans = options.showWeekPlans !== false;
  const showReflectionLog = options.showReflectionLog !== false;
  const showYearEndSummary = options.showYearEndSummary !== false;
  const periods = getScopedPeriods(planner, options.periodId);

  return (
    <article className="planner-document grid gap-5 rounded-lg border border-slate-200 bg-white p-6 text-slate-950 shadow-sm">
      <header className="border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo321ny.png" alt="321skole" className="h-12 w-12 rounded-lg object-contain" />
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">321Planner</div>
            <h1 className="m-0 mt-1 text-3xl font-black text-slate-950">{document.title || "Uten tittel"}</h1>
          </div>
        </div>
        <div className="mt-4 grid gap-2 text-sm text-slate-700 md:grid-cols-4">
          <Meta label="Fag" value={frame.subject} />
          <Meta label="Nivå" value={frame.level} />
          <Meta label="Skoleår" value={frame.schoolYear} />
          <Meta label="Timer" value={`${frame.totalHours}`} />
        </div>
      </header>

      <Section title="Planramme">
        <p>{document.description}</p>
        <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
          <Meta label="Land" value={frame.country} />
          <Meta label="Skoleslag" value={frame.schoolType} />
          <Meta label="Læreplangrunnlag" value={curriculum.framework || curriculum.type} />
        </div>
      </Section>

      <TwoColumn>
        <Section title="Fagets relevans">{document.subjectRelevance}</Section>
        <Section title="Sentrale verdier">{document.coreValues}</Section>
      </TwoColumn>

      <TwoColumn>
        <Section title="Kjerneelementer">{document.coreElements}</Section>
        <Section title="Tverrfaglige temaer">{document.interdisciplinaryThemes}</Section>
      </TwoColumn>

      <TwoColumn>
        <Section title="Grunnleggende ferdigheter">{document.basicSkills}</Section>
        <Section title="Læringsmål">{document.learningGoals}</Section>
      </TwoColumn>

      {document.concreteLearningGoals.length > 0 ? (
        <section>
          <h2 className="m-0 text-xl font-black text-slate-950">Konkrete læringsmål</h2>
          <div className="mt-3 grid gap-3">
            {document.concreteLearningGoals.map((goal, index) => (
              <div key={goal.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">Mål {index + 1}</div>
                <h3 className="m-0 mt-1 text-base font-black text-slate-950">{goal.goal || "Uten måltekst"}</h3>
                <div className="mt-3 grid gap-3 text-sm leading-6 md:grid-cols-2">
                  <TextBlock label="Elevspråk" value={goal.studentLanguage} />
                  <TextBlock label="Slik kan eleven vise det" value={goal.evidence} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <TwoColumn>
        <Section title="Vurderingsformer">{document.assessmentForms}</Section>
        <Section title="Arbeidsmåter">{document.workMethods}</Section>
      </TwoColumn>

      <Section title="Årsoversikt">{document.annualOverview}</Section>

      {frame.planType === "individual" ? (
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h2 className="m-0 text-xl font-black text-slate-950">Individuell plan</h2>
          <div className="mt-3 grid gap-3 text-sm leading-6 md:grid-cols-2">
            <TextBlock label="Elev / deltaker" value={document.individualDetails.learnerName} />
            <TextBlock label="Utgangspunkt og kontekst" value={document.individualDetails.learnerContext} />
            <TextBlock label="Behov for støtte" value={document.individualDetails.supportNeeds} />
            <TextBlock label="Tilrettelegging" value={document.individualDetails.adaptations} />
            <TextBlock label="Individuell progresjon" value={document.individualDetails.progression} />
            <TextBlock label="Samarbeid" value={document.individualDetails.collaboration} />
          </div>
          <TextBlock label="Evaluering og justering" value={document.individualDetails.evaluation} className="mt-3" />
        </section>
      ) : null}

      <section>
        <h2 className="m-0 text-xl font-black text-slate-950">Perioder</h2>
        <div className="mt-3 grid gap-3">
          {periods.length === 0 ? (
            <p className="m-0 text-sm text-slate-600">Ingen perioder er lagt inn ennå.</p>
          ) : (
            periods.map((period) => (
              <div key={period.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="m-0 text-base font-black text-slate-950">{period.title || "Uten tittel"}</h3>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
                      {formatPeriodStatus(period.status)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
                      {period.weeks || "Uker ikke satt"}
                    </span>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 text-sm leading-6 md:grid-cols-2">
                  <TextBlock label="Mål" value={period.goals} />
                  <TextBlock label="Innhold" value={period.content} />
                  <TextBlock label="Arbeidsmåter" value={period.methods} />
                  <TextBlock label="Vurdering" value={period.assessment} />
                </div>
                <LinkedGoals
                  title="Koblede læringsmål"
                  goalIds={period.linkedGoalIds}
                  goals={document.concreteLearningGoals}
                />
                {period.reflection ? <TextBlock label="Refleksjon" value={period.reflection} className="mt-3" /> : null}
                {showWeekPlans && period.weekPlans.length > 0 ? (
                  <div className="mt-4 grid gap-2">
                    <div className="text-xs font-black uppercase tracking-wide text-slate-500">Ukeplaner</div>
                    {period.weekPlans.map((weekPlan) => (
                      <div key={weekPlan.id} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h4 className="m-0 text-sm font-black text-slate-950">
                            {weekPlan.title || "Uten tittel"}
                          </h4>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-600">
                            {weekPlan.week || "Uke ikke satt"}
                          </span>
                        </div>
                        <div className="mt-2 grid gap-2 text-sm leading-6 md:grid-cols-2">
                          <TextBlock label="Mål" value={weekPlan.goals} />
                          <TextBlock label="Aktiviteter" value={weekPlan.activities} />
                          <TextBlock label="Vurdering" value={weekPlan.assessment} />
                          <TextBlock label="Notater" value={weekPlan.notes} />
                        </div>
                        <LinkedGoals
                          title="Koblede mål"
                          goalIds={weekPlan.linkedGoalIds}
                          goals={document.concreteLearningGoals}
                          compact
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="m-0 text-xl font-black text-slate-950">Aktiviteter</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {document.activities.length === 0 ? (
            <p className="m-0 text-sm text-slate-600">Ingen aktiviteter er lagt inn ennå.</p>
          ) : (
            document.activities.map((activity) => (
              <div key={activity.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">{activity.period}</div>
                <h3 className="m-0 mt-1 text-base font-black text-slate-950">{activity.title}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{activity.description}</p>
                <TextBlock label="Metode" value={activity.method} />
                <TextBlock label="Vurdering" value={activity.assessment} />
              </div>
            ))
          )}
        </div>
      </section>

      <Section title="Refleksjonsfelt">{document.reflection}</Section>

      {showYearEndSummary && (document.yearEndSummary || document.nextYearNotes) ? (
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h2 className="m-0 text-xl font-black text-slate-950">Årsoppsummering og videreføring</h2>
          <div className="mt-3 grid gap-3 text-sm leading-6 md:grid-cols-2">
            <TextBlock label="Årsoppsummering" value={document.yearEndSummary} />
            <TextBlock label="Notater til neste skoleår" value={document.nextYearNotes} />
          </div>
        </section>
      ) : null}

      {showReflectionLog && document.reflectionLog.length > 0 ? (
        <section>
          <h2 className="m-0 text-xl font-black text-slate-950">Refleksjonslogg</h2>
          <div className="mt-3 grid gap-3">
            {document.reflectionLog.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="m-0 text-base font-black text-slate-950">{entry.title || "Refleksjon"}</h3>
                    <p className="m-0 mt-1 text-xs font-bold text-slate-500">
                      {[entry.date, entry.period].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 text-sm leading-6 md:grid-cols-3">
                  <TextBlock label="Hva fungerte?" value={entry.whatWorked} />
                  <TextBlock label="Hva bør justeres?" value={entry.whatToAdjust} />
                  <TextBlock label="Neste steg" value={entry.nextStep} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}

export function StudentPlannerDocumentView({
  planner,
  options = {},
}: {
  planner: Planner;
  options?: Pick<PlannerDocumentViewOptions, "periodId">;
}) {
  const { document, frame } = planner;
  const periods = getScopedPeriods(planner, options.periodId);

  return (
    <article className="planner-document grid gap-5 rounded-lg border border-slate-200 bg-white p-6 text-slate-950 shadow-sm">
      <header className="border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo321ny.png" alt="321skole" className="h-12 w-12 rounded-lg object-contain" />
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">321Planner</div>
            <h1 className="m-0 mt-1 text-3xl font-black text-slate-950">
              Dette skal vi lære
            </h1>
            <p className="m-0 mt-2 text-sm font-bold text-slate-600">
              {[frame.subject, frame.level, frame.schoolYear].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      </header>

      <Section title={document.title || "Plan for læring"}>
        {document.description || document.subjectRelevance || "Her finner du målene vi skal jobbe med."}
      </Section>

      {document.concreteLearningGoals.length > 0 ? (
        <section>
          <h2 className="m-0 text-xl font-black text-slate-950">Mål vi jobber mot</h2>
          <div className="mt-3 grid gap-3">
            {document.concreteLearningGoals.map((goal, index) => (
              <div key={goal.id} className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-xs font-black uppercase tracking-wide text-emerald-800">Mål {index + 1}</div>
                <h3 className="m-0 mt-1 text-base font-black text-emerald-950">
                  {goal.studentLanguage || goal.goal || "Uten måltekst"}
                </h3>
                <TextBlock label="Slik kan du vise det" value={goal.evidence} className="mt-3" />
              </div>
            ))}
          </div>
        </section>
      ) : (
        <Section title="Mål vi jobber mot">{document.learningGoals}</Section>
      )}

      {periods.length > 0 ? (
        <section>
          <h2 className="m-0 text-xl font-black text-slate-950">
            {options.periodId ? "Dette jobber vi med nå" : "Slik jobber vi gjennom året"}
          </h2>
          <div className="mt-3 grid gap-3">
            {periods.map((period) => (
              <div key={period.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="m-0 text-base font-black text-slate-950">{period.title || "Periode"}</h3>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
                    {period.weeks || "Uker ikke satt"}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {period.goals || period.content || "Vi jobber med målene i planen."}
                </p>
                <LinkedGoals
                  title="Mål i denne perioden"
                  goalIds={period.linkedGoalIds}
                  goals={document.concreteLearningGoals}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <TwoColumn>
        <Section title="Hvordan vi jobber">{document.workMethods}</Section>
        <Section title="Hvordan du kan vise læring">{document.assessmentForms}</Section>
      </TwoColumn>
    </article>
  );
}

function formatPeriodStatus(status: string): string {
  if (status === "active") return "Pågår";
  if (status === "completed") return "Fullført";
  return "Planlagt";
}

function getScopedPeriods(planner: Planner, periodId?: string) {
  if (!periodId) return planner.document.periods;
  return planner.document.periods.filter((period) => period.id === periodId);
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 font-bold text-slate-900">{value || "-"}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="m-0 text-xl font-black text-slate-950">{title}</h2>
      <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{children || "-"}</div>
    </section>
  );
}

function TwoColumn({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-5 md:grid-cols-2">{children}</div>;
}

function TextBlock({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 whitespace-pre-wrap text-slate-700">{value || "-"}</div>
    </div>
  );
}

function LinkedGoals({
  title,
  goalIds,
  goals,
  compact = false,
}: {
  title: string;
  goalIds: string[];
  goals: Array<{ id: string; goal: string; studentLanguage: string }>;
  compact?: boolean;
}) {
  const linkedGoals = goalIds
    .map((goalId) => goals.find((goal) => goal.id === goalId))
    .filter((goal): goal is { id: string; goal: string; studentLanguage: string } => Boolean(goal));
  if (linkedGoals.length === 0) return null;

  return (
    <div className={compact ? "mt-3" : "mt-4"}>
      <div className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</div>
      <ul className="m-0 mt-2 grid gap-1 pl-4 text-sm leading-6 text-slate-700">
        {linkedGoals.map((goal) => (
          <li key={goal.id}>{goal.studentLanguage || goal.goal || "-"}</li>
        ))}
      </ul>
    </div>
  );
}
