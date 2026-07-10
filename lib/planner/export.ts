import type { Planner } from "./types";

export type PlannerExportOptions = {
  showCompactOverview?: boolean;
  showWeekPlans?: boolean;
  showReflectionLog?: boolean;
  showYearEndSummary?: boolean;
  periodId?: string;
};

export function plannerToMarkdown(planner: Planner, options: PlannerExportOptions = {}): string {
  const { document, frame, curriculum } = planner;
  const showCompactOverview = options.showCompactOverview !== false;
  const showWeekPlans = options.showWeekPlans !== false;
  const showReflectionLog = options.showReflectionLog !== false;
  const showYearEndSummary = options.showYearEndSummary !== false;
  const periods = getScopedPeriods(planner, options.periodId);
  const lines: string[] = [];

  pushHeading(lines, 1, document.title || "Uten tittel");
  pushMeta(lines, [
    ["Fag", frame.subject],
    ["Nivå", frame.level],
    ["Skoleår", frame.schoolYear],
    ["Timer", String(frame.totalHours)],
    ["Land", frame.country],
    ["Skoleslag", frame.schoolType],
    ["Læreplangrunnlag", curriculum.framework || curriculum.type],
  ]);

  pushSection(lines, "Planramme", document.description);
  if (showCompactOverview) pushCompactOverview(lines, planner, periods);
  pushSection(lines, "Fagets relevans", document.subjectRelevance);
  pushSection(lines, "Sentrale verdier", document.coreValues);
  pushSection(lines, "Kjerneelementer", document.coreElements);
  pushSection(lines, "Tverrfaglige temaer", document.interdisciplinaryThemes);
  pushSection(lines, "Grunnleggende ferdigheter", document.basicSkills);
  pushSection(lines, "Læringsmål", document.learningGoals);

  if (document.concreteLearningGoals.length > 0) {
    pushHeading(lines, 2, "Konkrete læringsmål");
    document.concreteLearningGoals.forEach((goal, index) => {
      pushHeading(lines, 3, `Mål ${index + 1}`);
      pushMeta(lines, [
        ["Konkret læringsmål", goal.goal],
        ["Elevspråk", goal.studentLanguage],
        ["Slik kan eleven vise det", goal.evidence],
      ]);
    });
  }

  pushSection(lines, "Vurderingsformer", document.assessmentForms);
  pushSection(lines, "Arbeidsmåter", document.workMethods);
  pushSection(lines, "Årsoversikt", document.annualOverview);

  if (frame.planType === "individual") {
    pushHeading(lines, 2, "Individuell plan");
    pushMeta(lines, [
      ["Elev / deltaker", document.individualDetails.learnerName],
      ["Utgangspunkt og kontekst", document.individualDetails.learnerContext],
      ["Behov for støtte", document.individualDetails.supportNeeds],
      ["Tilrettelegging", document.individualDetails.adaptations],
      ["Individuell progresjon", document.individualDetails.progression],
      ["Samarbeid", document.individualDetails.collaboration],
      ["Evaluering og justering", document.individualDetails.evaluation],
    ]);
  }

  pushHeading(lines, 2, "Perioder");
  if (periods.length === 0) {
    lines.push("Ingen perioder er lagt inn ennå.", "");
  } else {
    periods.forEach((period) => {
      pushHeading(lines, 3, period.title || "Uten tittel");
      pushMeta(lines, [
        ["Status", formatPeriodStatus(period.status)],
        ["Uker", period.weeks],
      ]);
      pushMeta(lines, [
        ["Mål", period.goals],
        ["Innhold", period.content],
        ["Arbeidsmåter", period.methods],
        ["Vurdering", period.assessment],
        ["Refleksjon", period.reflection],
      ]);
      pushOfficialGoals(lines, period.officialGoalIds, planner.officialBasis?.competenceGoals ?? []);
      pushPeriodLearningGoals(lines, period.learningGoals);
      pushLinkedGoals(lines, "Koblede læringsmål", period.linkedGoalIds, document.concreteLearningGoals);

      if (showWeekPlans && period.weekPlans.length > 0) {
        pushHeading(lines, 4, "Ukeplaner");
        period.weekPlans.forEach((weekPlan) => {
          pushHeading(lines, 5, `${weekPlan.week || "Uke ikke satt"}: ${weekPlan.title || "Uten tittel"}`);
          pushMeta(lines, [
            ["Mål", weekPlan.goals],
            ["Aktiviteter", weekPlan.activities],
            ["Vurdering", weekPlan.assessment],
            ["Notater", weekPlan.notes],
          ]);
          pushLinkedGoals(lines, "Koblede mål", weekPlan.linkedGoalIds, document.concreteLearningGoals);
        });
      }
    });
  }

  pushHeading(lines, 2, "Aktiviteter");
  if (document.activities.length === 0) {
    lines.push("Ingen aktiviteter er lagt inn ennå.", "");
  } else {
    document.activities.forEach((activity) => {
      pushHeading(lines, 3, activity.title || "Uten tittel");
      pushMeta(lines, [
        ["Periode", activity.period],
        ["Beskrivelse", activity.description],
        ["Metode", activity.method],
        ["Vurdering", activity.assessment],
      ]);
      pushSection(lines, "Undervisningsopplegg", activity.teachingPlan);
    });
  }

  pushSection(lines, "Refleksjonsfelt", document.reflection);

  if (showYearEndSummary && (document.yearEndSummary || document.nextYearNotes)) {
    pushSection(lines, "Årsoppsummering", document.yearEndSummary);
    pushSection(lines, "Notater til neste skoleår", document.nextYearNotes);
  }

  if (showReflectionLog && document.reflectionLog.length > 0) {
    pushHeading(lines, 2, "Refleksjonslogg");
    document.reflectionLog.forEach((entry) => {
      pushHeading(lines, 3, entry.title || "Refleksjon");
      pushMeta(lines, [
        ["Dato", entry.date],
        ["Periode", entry.period],
        ["Hva fungerte?", entry.whatWorked],
        ["Hva bør justeres?", entry.whatToAdjust],
        ["Neste steg", entry.nextStep],
      ]);
    });
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

export function plannerToStudentMarkdown(planner: Planner, options: Pick<PlannerExportOptions, "periodId"> = {}): string {
  const { document, frame } = planner;
  const periods = getScopedPeriods(planner, options.periodId);
  const lines: string[] = [];

  pushHeading(lines, 1, "Dette skal vi lære");
  pushMeta(lines, [
    ["Fag", frame.subject],
    ["Nivå", frame.level],
    ["Skoleår", frame.schoolYear],
  ]);

  pushSection(lines, document.title || "Plan for læring", document.description || document.subjectRelevance);

  if (document.concreteLearningGoals.length > 0) {
    pushHeading(lines, 2, "Mål vi jobber mot");
    document.concreteLearningGoals.forEach((goal, index) => {
      pushHeading(lines, 3, `Mål ${index + 1}`);
      pushMeta(lines, [
        ["Dette skal du kunne", goal.studentLanguage || goal.goal],
        ["Slik kan du vise det", goal.evidence],
      ]);
    });
  } else {
    pushSection(lines, "Mål vi jobber mot", document.learningGoals);
  }

  if (periods.length > 0) {
    pushHeading(lines, 2, options.periodId ? "Dette jobber vi med nå" : "Slik jobber vi gjennom året");
    periods.forEach((period) => {
      pushHeading(lines, 3, period.title || "Periode");
      pushMeta(
        lines,
        period.learningGoals.length > 0
          ? [["Uker", period.weeks]]
          : [
              ["Uker", period.weeks],
              ["Dette jobber vi med", period.goals || period.content],
            ]
      );
      if (period.learningGoals.length > 0) {
        lines.push("**Mål i denne perioden:**");
        period.learningGoals.forEach((goal) => lines.push(`- ${goal.studentLanguage || goal.goal}`));
        lines.push("");
      }
      pushLinkedGoals(lines, "Mål i denne perioden", period.linkedGoalIds, document.concreteLearningGoals);
    });
  }

  pushSection(lines, "Hvordan vi jobber", document.workMethods);
  pushSection(lines, "Hvordan du kan vise læring", document.assessmentForms);

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

function pushHeading(lines: string[], level: number, value: string) {
  lines.push(`${"#".repeat(level)} ${value.trim() || "-"}`, "");
}

function getScopedPeriods(planner: Planner, periodId?: string) {
  if (!periodId) return planner.document.periods;
  return planner.document.periods.filter((period) => period.id === periodId);
}

function pushSection(lines: string[], title: string, value: string) {
  pushHeading(lines, 2, title);
  lines.push(value.trim() || "-", "");
}

function pushCompactOverview(lines: string[], planner: Planner, periods: Planner["document"]["periods"]) {
  const calendarEvents = getCalendarEvents(planner);
  const localInitiatives = [
    ...planner.localFramework.interdisciplinaryProjects.map((item) => ({ ...item, kind: "Prosjekt" })),
    ...planner.localFramework.themeWeeks.map((item) => ({ ...item, kind: "Temauke" })),
  ].filter((item) => item.title.trim() || item.description.trim());

  if (calendarEvents.length === 0 && localInitiatives.length === 0 && periods.length === 0) return;

  pushHeading(lines, 2, "Kort planoversikt");

  if (calendarEvents.length > 0) {
    pushHeading(lines, 3, "Skolerute");
    calendarEvents.forEach((event) => {
      lines.push(
        `- ${event.title || "Skolerute"}: ${formatDateRange(event.startDate, event.endDate)} (${formatWeekRange(
          event.startDate,
          event.endDate
        )})`
      );
    });
    lines.push("");
  }

  if (localInitiatives.length > 0) {
    pushHeading(lines, 3, "Lokale prosjekt og temauker");
    localInitiatives.forEach((item) => {
      lines.push(`- ${item.kind}: ${item.title || "Uten tittel"}`);
      const timing = [formatDateRange(item.startDate, item.endDate), item.timing, item.locked ? "Låst i årsplan" : ""]
        .filter(Boolean)
        .join(" · ");
      if (timing) lines.push(`  - Tid: ${timing}`);
      if (item.description.trim()) lines.push(`  - Beskrivelse: ${item.description.trim()}`);
    });
    lines.push("");
  }

  if (periods.length > 0) {
    pushHeading(lines, 3, "Perioder og læringsmål");
    periods.forEach((period) => {
      lines.push(`- ${period.title || "Periode"} (${period.weeks || "uker/dato ikke satt"})`);
      const learningGoals = period.learningGoals.map((goal) => goal.studentLanguage || goal.goal).filter(Boolean);
      if (learningGoals.length > 0) {
        learningGoals.forEach((goal) => lines.push(`  - Mål: ${goal}`));
      } else if (period.goals.trim()) {
        lines.push(`  - Mål: ${period.goals.trim()}`);
      }
      if (period.content.trim()) lines.push(`  - Innhold: ${period.content.trim()}`);
    });
    lines.push("");
  }
}

function pushMeta(lines: string[], items: Array<[string, string]>) {
  items.forEach(([label, value]) => {
    lines.push(`**${label}:** ${value.trim() || "-"}`);
  });
  lines.push("");
}

function getCalendarEvents(planner: Planner) {
  const calendar = planner.frame.schoolCalendar;
  const events = calendar.events.length > 0
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
  return events
    .filter((event) => event.title.trim() || event.startDate || event.endDate)
    .map((event) => ({
      ...event,
      title: event.title.trim() || "Skolerute",
      endDate: event.endDate || event.startDate,
    }));
}

function formatDate(value: string): string {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "short" }).format(date);
}

function formatDateRange(startDate: string, endDate: string): string {
  if (!startDate && !endDate) return "";
  if (!endDate || startDate === endDate) return formatDate(startDate);
  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

function formatWeekRange(startDate: string, endDate: string): string {
  const startWeek = getIsoWeekNumber(startDate);
  const endWeek = getIsoWeekNumber(endDate || startDate);
  if (!startWeek && !endWeek) return "uke ikke satt";
  if (!endWeek || startWeek === endWeek) return `uke ${startWeek}`;
  return `uke ${startWeek}-${endWeek}`;
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

function pushLinkedGoals(
  lines: string[],
  title: string,
  goalIds: string[],
  goals: Array<{ id: string; goal: string; studentLanguage: string }>
) {
  const linkedGoals = goalIds
    .map((goalId) => goals.find((goal) => goal.id === goalId))
    .filter((goal): goal is { id: string; goal: string; studentLanguage: string } => Boolean(goal));
  if (linkedGoals.length === 0) return;

  lines.push(`**${title}:**`);
  linkedGoals.forEach((goal) => {
    lines.push(`- ${goal.studentLanguage || goal.goal || "-"}`);
  });
  lines.push("");
}

function pushOfficialGoals(lines: string[], goalIds: string[], goals: string[]) {
  const selectedGoals = goalIds
    .map((goalId) => {
      const match = goalId.match(/^udir-goal-(\d+)$/);
      return match ? goals[Number(match[1]) - 1] : undefined;
    })
    .filter((goal): goal is string => Boolean(goal));
  if (selectedGoals.length === 0) return;

  lines.push("**Offisielle kompetansemål:**");
  selectedGoals.forEach((goal) => lines.push(`- ${goal}`));
  lines.push("");
}

function pushPeriodLearningGoals(
  lines: string[],
  goals: Planner["document"]["periods"][number]["learningGoals"]
) {
  if (goals.length === 0) return;
  lines.push("**Lokale læringsmål:**");
  goals.forEach((goal, index) => {
    lines.push(`${index + 1}. ${goal.goal}`);
    lines.push(`   - Elev-/deltakerspråk: ${goal.studentLanguage}`);
    const sourceNumbers = goal.sourceOfficialGoalIds
      .map((goalId) => goalId.match(/^udir-goal-(\d+)$/)?.[1])
      .filter(Boolean)
      .join(", ");
    lines.push(`   - Bygger på Udir-mål: ${sourceNumbers || "ikke angitt"}`);
  });
  lines.push("");
}

function formatPeriodStatus(status: string): string {
  if (status === "active") return "Pågår";
  if (status === "completed") return "Fullført";
  return "Planlagt";
}
