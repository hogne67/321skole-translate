"use client";

import type { Planner } from "@/lib/planner/types";

type PlannerDocumentViewOptions = {
  showCompactOverview?: boolean;
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
  const showCompactOverview = options.showCompactOverview !== false;
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

      {showCompactOverview ? <CompactPlannerOverview planner={planner} periods={periods} /> : null}

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
                <OfficialGoals
                  goalIds={period.officialGoalIds}
                  goals={planner.officialBasis?.competenceGoals ?? []}
                />
                <PeriodLearningGoals goals={period.learningGoals} />
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

export function CompactPlannerDocumentView({
  planner,
  options = {},
}: {
  planner: Planner;
  options?: Pick<PlannerDocumentViewOptions, "periodId">;
}) {
  const { document, frame, curriculum } = planner;
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

      <CompactPlannerOverview planner={planner} periods={periods} />
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
                {period.learningGoals.length > 0 ? (
                  <ul className="mb-0 mt-3 grid gap-2 pl-5 text-sm leading-6 text-slate-700">
                    {period.learningGoals.map((goal) => (
                      <li key={goal.id}>{goal.studentLanguage || goal.goal}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {period.goals || period.content || "Vi jobber med målene i planen."}
                  </p>
                )}
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

function CompactPlannerOverview({
  planner,
  periods,
}: {
  planner: Planner;
  periods: Planner["document"]["periods"];
}) {
  const calendarEvents = getCalendarEvents(planner);
  const localInitiatives = getLocalInitiatives(planner);
  const teachingWeeks = getTeachingWeeksForPlanner(planner);
  if (calendarEvents.length === 0 && localInitiatives.length === 0 && periods.length === 0) return null;

  return (
    <section className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
      <h2 className="m-0 text-xl font-black text-slate-950">Kort planoversikt</h2>
      <p className="mb-0 mt-1 text-sm leading-6 text-slate-700">
        Kompakt oversikt for deling, utskrift og rask kontroll av datoer, lokale rammer og periodemål.
      </p>

      {calendarEvents.length > 0 ? (
        <div className="mt-4">
          <h3 className="m-0 text-sm font-black uppercase tracking-wide text-slate-600">Skolerute</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-emerald-200">
                  <th className="py-2 pr-3">Navn</th>
                  <th className="py-2 pr-3">Fra</th>
                  <th className="py-2 pr-3">Til og med</th>
                  <th className="py-2 pr-3">Uke</th>
                </tr>
              </thead>
              <tbody>
                {calendarEvents.map((event) => (
                  <tr key={event.id} className="border-b border-emerald-100">
                    <td className="py-2 pr-3 font-bold text-slate-900">{event.title}</td>
                    <td className="py-2 pr-3">{formatDate(event.startDate)}</td>
                    <td className="py-2 pr-3">{formatDate(event.endDate || event.startDate)}</td>
                    <td className="py-2 pr-3">{formatWeekRange(event.startDate, event.endDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {localInitiatives.length > 0 ? (
        <div className="mt-4">
          <h3 className="m-0 text-sm font-black uppercase tracking-wide text-slate-600">Lokale prosjekt og temauker</h3>
          <div className="mt-2 grid gap-2">
            {localInitiatives.map((item) => (
              <div key={`${item.kind}-${item.id}`} className="rounded-lg border border-emerald-100 bg-white p-3 text-sm">
                <div className="font-black text-slate-950">
                  {item.kind}: {item.title || "Uten tittel"}
                </div>
                <div className="mt-1 text-slate-600">
                  {[formatDateRange(item.startDate, item.endDate), item.timing, item.locked ? "Låst i årsplan" : ""]
                    .filter(Boolean)
                    .join(" · ") || "Tidspunkt ikke satt"}
                </div>
                {item.description ? <div className="mt-1 whitespace-pre-wrap text-slate-700">{item.description}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {periods.length > 0 ? (
        <div className="mt-4">
          <h3 className="m-0 text-sm font-black uppercase tracking-wide text-slate-600">Perioder og læringsmål</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-emerald-200">
                  <th className="py-2 pr-3">Periode</th>
                  <th className="py-2 pr-3">Uker/dato</th>
                  <th className="py-2 pr-3">Læringsmål</th>
                  <th className="py-2 pr-3">Innhold</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => {
                  const periodInitiatives = getInitiativesForPeriod(period, localInitiatives, teachingWeeks);
                  return (
                    <tr key={period.id} className="border-b border-emerald-100 align-top">
                      <td className="py-2 pr-3 font-bold text-slate-900">{period.title || "Periode"}</td>
                      <td className="py-2 pr-3">{formatPeriodCalendarRange(period.weeks, teachingWeeks)}</td>
                      <td className="py-2 pr-3">
                        {period.learningGoals.length > 0 ? (
                          <ul className="m-0 grid gap-1 pl-4">
                            {period.learningGoals.map((goal) => (
                              <li key={goal.id}>{goal.studentLanguage || goal.goal}</li>
                            ))}
                          </ul>
                        ) : (
                          period.goals || "-"
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="whitespace-pre-wrap">{period.content || "-"}</div>
                        {periodInitiatives.length > 0 ? (
                          <div className="mt-2 grid gap-1">
                            {periodInitiatives.map((item) => (
                              <div key={`${period.id}-${item.kind}-${item.id}`} className="rounded border border-emerald-100 bg-white px-2 py-1 text-xs font-bold text-emerald-900">
                                Lokal ramme: {item.kind} - {item.title || "Uten tittel"}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function getCalendarEvents(planner: Planner) {
  const calendar = planner.frame.schoolCalendar;
  const storedEvents = calendar.events.length > 0
    ? calendar.events
    : [
        { id: "autumn-break", title: "Høstferie", startDate: calendar.autumnBreakStart, endDate: calendar.autumnBreakEnd },
        { id: "christmas-break", title: "Juleferie", startDate: calendar.christmasBreakStart, endDate: calendar.christmasBreakEnd },
        { id: "winter-break", title: "Vinterferie", startDate: calendar.winterBreakStart, endDate: calendar.winterBreakEnd },
        { id: "easter-break", title: "Påskeferie", startDate: calendar.easterBreakStart, endDate: calendar.easterBreakEnd },
        { id: "public-holiday", title: "Offentlig fridag", startDate: calendar.mayDay, endDate: calendar.mayDay },
        { id: "national-day", title: "Nasjonaldag", startDate: calendar.constitutionDay, endDate: calendar.constitutionDay },
        { id: "ascension-day", title: "Kristi himmelfartsdag", startDate: calendar.ascensionDay, endDate: calendar.ascensionDay },
        { id: "whit-monday", title: "Pinse", startDate: calendar.whitMonday, endDate: calendar.whitMonday },
      ];
  const events = [
    { id: "school-start", title: "Skolestart", startDate: calendar.firstSchoolDay, endDate: calendar.firstSchoolDay },
    ...storedEvents,
    { id: "summer-break-start", title: "Sommerferie starter", startDate: calendar.lastSchoolDay, endDate: calendar.lastSchoolDay },
  ];

  return events
    .filter((event) => event.startDate || event.endDate)
    .map((event) => ({
      ...event,
      title: event.title.trim() || "Skolerute",
      endDate: event.endDate || event.startDate,
    }))
    .sort(compareCalendarItems);
}

function getLocalInitiatives(planner: Planner) {
  return [
    ...planner.localFramework.interdisciplinaryProjects.map((item) => ({ ...item, kind: "Prosjekt" })),
    ...planner.localFramework.themeWeeks.map((item) => ({ ...item, kind: "Temauke" })),
  ].filter((item) => item.title.trim() || item.description.trim()).sort(compareCalendarItems);
}

type TeachingWeekForPrint = {
  teachingWeek: number;
  startDate: string;
  endDate: string;
  calendarWeek: number;
};

function getTeachingWeeksForPlanner(planner: Planner): TeachingWeekForPrint[] {
  const calendar = planner.frame.schoolCalendar;
  const firstDay = parseDate(calendar.firstSchoolDay);
  const lastDay = parseDate(calendar.lastSchoolDay);
  if (!firstDay || !lastDay || firstDay > lastDay) return [];

  const freeDates = new Set<string>();
  const events = calendar.events.length > 0 ? calendar.events : getFallbackCalendarEvents(calendar);
  for (const event of events) {
    const startDate = event.startDate || event.endDate;
    const endDate = event.endDate || event.startDate;
    for (const date of listDatesInclusive(startDate, endDate)) {
      if (isWeekday(date)) freeDates.add(date);
    }
  }

  const weeks: TeachingWeekForPrint[] = [];
  let monday = startOfIsoWeek(firstDay);
  const finalMonday = startOfIsoWeek(lastDay);

  while (monday <= finalMonday && weeks.length < 60) {
    const schoolDates: string[] = [];
    for (let offset = 0; offset < 5; offset += 1) {
      const date = addDays(monday, offset);
      const key = toDateKey(date);
      if (date >= firstDay && date <= lastDay && !freeDates.has(key)) schoolDates.push(key);
    }

    if (schoolDates.length > 0) {
      weeks.push({
        teachingWeek: weeks.length + 1,
        startDate: schoolDates[0],
        endDate: schoolDates[schoolDates.length - 1],
        calendarWeek: getIsoWeekNumber(schoolDates[0]) ?? weeks.length + 1,
      });
    }

    monday = addDays(monday, 7);
  }

  return weeks;
}

function formatPeriodCalendarRange(periodWeeks: string, teachingWeeks: TeachingWeekForPrint[]): string {
  if (teachingWeeks.length === 0) return periodWeeks || "-";
  const range = parseTeachingWeekRange(periodWeeks);
  if (!range) return periodWeeks || "-";
  const selected = teachingWeeks.filter((week) => week.teachingWeek >= range.start && week.teachingWeek <= range.end);
  if (selected.length === 0) return periodWeeks || "-";
  const first = selected[0];
  const last = selected[selected.length - 1];
  const weekLabel =
    first.calendarWeek === last.calendarWeek ? `Uke ${first.calendarWeek}` : `Uke ${first.calendarWeek}-${last.calendarWeek}`;
  return `${weekLabel} (${formatDateRange(first.startDate, last.endDate)})`;
}

function getInitiativesForPeriod(
  period: Planner["document"]["periods"][number],
  initiatives: ReturnType<typeof getLocalInitiatives>,
  teachingWeeks: TeachingWeekForPrint[]
) {
  const periodRange = getPeriodDateRange(period.weeks, teachingWeeks);
  return initiatives.filter((initiative) => {
    const initiativeStart = initiative.startDate || initiative.endDate;
    const initiativeEnd = initiative.endDate || initiative.startDate;
    if (periodRange && initiativeStart && initiativeEnd) {
      return dateRangesOverlap(periodRange.startDate, periodRange.endDate, initiativeStart, initiativeEnd);
    }

    const periodWeeks = weekNumbersFromText(period.weeks);
    const initiativeWeeks = [
      ...new Set([
        ...weekNumbersFromText(initiative.timing),
        ...weekNumbersFromDates(initiativeStart, initiativeEnd),
      ]),
    ];
    return initiativeWeeks.length > 0 && periodWeeks.some((week) => initiativeWeeks.includes(week));
  });
}

function getPeriodDateRange(periodWeeks: string, teachingWeeks: TeachingWeekForPrint[]) {
  const range = parseTeachingWeekRange(periodWeeks);
  if (!range) return null;
  const selected = teachingWeeks.filter((week) => week.teachingWeek >= range.start && week.teachingWeek <= range.end);
  if (selected.length === 0) return null;
  return {
    startDate: selected[0].startDate,
    endDate: selected[selected.length - 1].endDate,
  };
}

function dateRangesOverlap(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string): boolean {
  const leftStartDate = parseDate(leftStart);
  const leftEndDate = parseDate(leftEnd);
  const rightStartDate = parseDate(rightStart);
  const rightEndDate = parseDate(rightEnd);
  if (!leftStartDate || !leftEndDate || !rightStartDate || !rightEndDate) return false;
  return leftStartDate <= rightEndDate && rightStartDate <= leftEndDate;
}

function weekNumbersFromText(value: string): number[] {
  const numbers = new Set<number>();
  for (const match of value.matchAll(/uke\s*(\d+)(?:\s*[-–]\s*(\d+))?/gi)) {
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    for (let week = start; week <= end && week <= start + 60; week += 1) numbers.add(week);
  }
  return [...numbers];
}

function weekNumbersFromDates(startDate: string, endDate: string): number[] {
  if (!startDate && !endDate) return [];
  const numbers = new Set<number>();
  for (const date of listDatesInclusive(startDate || endDate, endDate || startDate)) {
    const week = getIsoWeekNumber(date);
    if (week) numbers.add(week);
  }
  return [...numbers];
}

function parseTeachingWeekRange(value: string): { start: number; end: number } | null {
  const range = value.match(/Undervisningsuke\s*(\d+)\s*[-–]\s*(\d+)/i);
  if (range) return { start: Number(range[1]), end: Number(range[2]) };
  const single = value.match(/Undervisningsuke\s*(\d+)/i);
  if (single) return { start: Number(single[1]), end: Number(single[1]) };
  return null;
}

function getFallbackCalendarEvents(calendar: Planner["frame"]["schoolCalendar"]) {
  return [
    { id: "autumn-break", title: "Høstferie", startDate: calendar.autumnBreakStart, endDate: calendar.autumnBreakEnd },
    { id: "christmas-break", title: "Juleferie", startDate: calendar.christmasBreakStart, endDate: calendar.christmasBreakEnd },
    { id: "winter-break", title: "Vinterferie", startDate: calendar.winterBreakStart, endDate: calendar.winterBreakEnd },
    { id: "easter-break", title: "Påskeferie", startDate: calendar.easterBreakStart, endDate: calendar.easterBreakEnd },
    { id: "public-holiday", title: "Offentlig fridag", startDate: calendar.mayDay, endDate: calendar.mayDay },
    { id: "national-day", title: "Nasjonaldag", startDate: calendar.constitutionDay, endDate: calendar.constitutionDay },
    { id: "ascension-day", title: "Kristi himmelfartsdag", startDate: calendar.ascensionDay, endDate: calendar.ascensionDay },
    { id: "whit-monday", title: "Pinse", startDate: calendar.whitMonday, endDate: calendar.whitMonday },
  ];
}

function compareCalendarItems(left: { startDate: string; endDate?: string }, right: { startDate: string; endDate?: string }) {
  const leftTime = calendarSortTime(left.startDate || left.endDate || "");
  const rightTime = calendarSortTime(right.startDate || right.endDate || "");
  return leftTime - rightTime;
}

function calendarSortTime(value: string): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfIsoWeek(date: Date): Date {
  const day = date.getDay() || 7;
  return addDays(date, 1 - day);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function listDatesInclusive(startDate: string, endDate: string): string[] {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || start > end) return [];
  const dates: string[] = [];
  for (let date = new Date(start); date <= end; date = addDays(date, 1)) {
    dates.push(toDateKey(date));
  }
  return dates;
}

function isWeekday(value: string): boolean {
  const date = parseDate(value);
  if (!date) return false;
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function formatDate(value: string): string {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "short" }).format(date);
}

function formatDateRange(startDate: string, endDate: string): string {
  if (!startDate && !endDate) return "";
  if (!startDate) return `Til og med ${formatDate(endDate)}`;
  if (!endDate) return `Fra ${formatDate(startDate)}`;
  if (!endDate || startDate === endDate) return formatDate(startDate);
  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

function formatWeekRange(startDate: string, endDate: string): string {
  const startWeek = getIsoWeekNumber(startDate || endDate);
  const endWeek = getIsoWeekNumber(endDate || startDate);
  if (!startWeek && !endWeek) return "-";
  if (!endWeek || startWeek === endWeek) return `Uke ${startWeek}`;
  return `Uke ${startWeek}-${endWeek}`;
}

function getIsoWeekNumber(value: string): number | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
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

function OfficialGoals({ goalIds, goals }: { goalIds: string[]; goals: string[] }) {
  const selectedGoals = goalIds
    .map((goalId) => {
      const match = goalId.match(/^udir-goal-(\d+)$/);
      return match ? goals[Number(match[1]) - 1] : undefined;
    })
    .filter((goal): goal is string => Boolean(goal));
  if (selectedGoals.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="text-xs font-black uppercase tracking-wide text-slate-500">Offisielle kompetansemål</div>
      <ul className="mb-0 mt-2 grid gap-2 pl-5 text-sm leading-6 text-slate-700">
        {selectedGoals.map((goal, index) => <li key={`${index}-${goal}`}>{goal}</li>)}
      </ul>
    </div>
  );
}

function PeriodLearningGoals({ goals }: { goals: Planner["document"]["periods"][number]["learningGoals"] }) {
  if (goals.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="text-xs font-black uppercase tracking-wide text-slate-500">Lokale læringsmål</div>
      <div className="mt-2 grid gap-2">
        {goals.map((goal, index) => (
          <div key={goal.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700">
            <div className="font-black text-slate-950">Mål {index + 1}: {goal.goal}</div>
            <div className="mt-1"><strong>Elev-/deltakerspråk:</strong> {goal.studentLanguage}</div>
            <div className="mt-1 text-xs font-bold text-slate-500">
              Bygger på Udir-mål {goal.sourceOfficialGoalIds
                .map((goalId) => goalId.match(/^udir-goal-(\d+)$/)?.[1])
                .filter(Boolean)
                .join(", ") || "ikke angitt"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
