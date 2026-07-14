import type { Planner, PlannerPeriod } from "./types";

export type PlannerExportOptions = {
  compactOnly?: boolean;
  showCompactOverview?: boolean;
  showWeekPlans?: boolean;
  showReflectionLog?: boolean;
  showYearEndSummary?: boolean;
  periodId?: string;
};

export function plannerToMarkdown(planner: Planner, options: PlannerExportOptions = {}): string {
  const { document, frame, curriculum } = planner;
  const compactOnly = options.compactOnly === true;
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
  if (compactOnly) return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
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
  ].filter((item) => item.title.trim() || item.description.trim()).sort(compareCalendarItems);

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
    const teachingWeeks = getTeachingWeeksForPlanner(planner);
    const officialGoals = planner.officialBasis?.competenceGoals ?? [];
    pushHeading(lines, 3, "Perioder og læringsmål");
    periods.forEach((period) => {
      lines.push(`- ${period.title || "Periode"} (${formatPeriodCalendarRange(period.weeks, teachingWeeks)})`);
      if (period.learningGoals.length > 0) {
        pushGroupedPeriodLearningGoals(lines, period, officialGoals);
      } else if (period.goals.trim()) {
        lines.push(`  - Mål: ${period.goals.trim()}`);
      }
      if (period.content.trim()) pushIndentedLine(lines, "Innhold", period.content);
      const periodInitiatives = getInitiativesForPeriod(period, localInitiatives, teachingWeeks);
      periodInitiatives.forEach((item) => {
        lines.push(`  - Lokal ramme: ${item.kind} - ${item.title || "Uten tittel"}`);
      });
    });
    lines.push("");
  }
}

function pushGroupedPeriodLearningGoals(lines: string[], period: PlannerPeriod, officialGoals: string[]) {
  const selectedGoalIds = period.officialGoalIds.length > 0
    ? period.officialGoalIds
    : [...new Set(period.learningGoals.flatMap((goal) => goal.sourceOfficialGoalIds))];
  const pushedGoalIndexes = new Set<number>();

  selectedGoalIds.forEach((goalId) => {
    const groupedGoals = period.learningGoals
      .map((goal, index) => ({ goal, index }))
      .filter((item) => item.goal.sourceOfficialGoalIds.includes(goalId));
    if (groupedGoals.length === 0) return;

    const officialText = officialGoalText(goalId, officialGoals);
    lines.push(`  - Kompetansemål ${formatOfficialGoalNumber(goalId)}: ${officialText || "Ikke angitt"}`);
    groupedGoals.forEach(({ goal, index }) => {
      pushedGoalIndexes.add(index);
      const text = goal.studentLanguage || goal.goal;
      if (text.trim()) lines.push(`    - Elevmål: ${text.trim()}`);
    });
  });

  period.learningGoals.forEach((goal, index) => {
    if (pushedGoalIndexes.has(index)) return;
    const text = goal.studentLanguage || goal.goal;
    if (text.trim()) lines.push(`  - Elevmål: ${text.trim()}`);
  });
}

function officialGoalText(goalId: string, officialGoals: string[]): string {
  const index = Number(goalId.match(/^udir-goal-(\d+)$/)?.[1] ?? 0) - 1;
  return index >= 0 ? officialGoals[index] ?? "" : "";
}

function formatOfficialGoalNumber(goalId: string): string {
  return goalId.match(/^udir-goal-(\d+)$/)?.[1] ?? goalId;
}

function pushMeta(lines: string[], items: Array<[string, string]>) {
  items.forEach(([label, value]) => {
    lines.push(`**${label}:** ${value.trim() || "-"}`);
  });
  lines.push("");
}

function pushIndentedLine(lines: string[], label: string, value: string) {
  const parts = value
    .trim()
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return;
  lines.push(`  - ${label}: ${parts[0]}`);
  parts.slice(1).forEach((part) => lines.push(`    ${part}`));
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

type TeachingWeekForExport = {
  teachingWeek: number;
  startDate: string;
  endDate: string;
  calendarWeek: number;
};

function getTeachingWeeksForPlanner(planner: Planner): TeachingWeekForExport[] {
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

  const weeks: TeachingWeekForExport[] = [];
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

function formatPeriodCalendarRange(periodWeeks: string, teachingWeeks: TeachingWeekForExport[]): string {
  if (teachingWeeks.length === 0) return periodWeeks || "uker/dato ikke satt";
  const range = parseTeachingWeekRange(periodWeeks);
  if (!range) return periodWeeks || "uker/dato ikke satt";
  const selected = teachingWeeks.filter((week) => week.teachingWeek >= range.start && week.teachingWeek <= range.end);
  if (selected.length === 0) return periodWeeks || "uker/dato ikke satt";
  const first = selected[0];
  const last = selected[selected.length - 1];
  const weekLabel =
    first.calendarWeek === last.calendarWeek ? `uke ${first.calendarWeek}` : `uke ${first.calendarWeek}-${last.calendarWeek}`;
  return `${weekLabel} (${formatDateRange(first.startDate, last.endDate)})`;
}

function getInitiativesForPeriod(
  period: Planner["document"]["periods"][number],
  initiatives: Array<Planner["localFramework"]["interdisciplinaryProjects"][number] & { kind: string }>,
  teachingWeeks: TeachingWeekForExport[]
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

function getPeriodDateRange(periodWeeks: string, teachingWeeks: TeachingWeekForExport[]) {
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
