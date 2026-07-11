import type { PlannerFrame, PlannerPeriod } from "@/lib/planner/types";

type SchoolWeek = {
  date: Date;
  week: number;
  year: number;
};

export type PeriodStructureResult = {
  periods: PlannerPeriod[];
  usedCalendarDates: boolean;
};

export function createBlankPeriodStructure(frame: PlannerFrame, requestedCount: number): PeriodStructureResult {
  const calendarWeeks = getTeachingWeeksFromCalendar(frame);
  const usedCalendarDates = calendarWeeks.length > 0;
  const availableWeeks = usedCalendarDates ? calendarWeeks.length : Math.max(1, frame.teachingWeeks);
  const count = Math.min(availableWeeks, Math.max(1, Math.round(requestedCount)));
  const totalWeeks = Math.max(count, availableWeeks);
  const groups = usedCalendarDates
    ? splitBySemesters(calendarWeeks, count)
    : splitEvenly(totalWeeks, count);
  let weekOffset = 0;

  const periods = groups.map((groupSize, index): PlannerPeriod => {
    const selectedWeeks = calendarWeeks.slice(weekOffset, weekOffset + groupSize);
    const start = weekOffset + 1;
    const end = weekOffset + groupSize;
    weekOffset = end;

    return {
      id: `period-${Date.now()}-${index + 1}`,
      status: "planned",
      title: `Periode ${index + 1}`,
      weeks: usedCalendarDates
        ? formatCalendarWeeks(selectedWeeks)
        : `Undervisningsuke ${start}-${end}`,
      officialGoalIds: [],
      learningGoals: [],
      linkedGoalIds: [],
      goals: "",
      content: "",
      methods: "",
      assessment: "",
      reflection: "",
      weekPlans: [],
    };
  });

  return { periods, usedCalendarDates };
}

function getTeachingWeeksFromCalendar(frame: PlannerFrame): SchoolWeek[] {
  const firstDay = parseDate(frame.schoolCalendar.firstSchoolDay);
  const lastDay = parseDate(frame.schoolCalendar.lastSchoolDay);
  if (!firstDay || !lastDay || firstDay > lastDay) return [];

  const breaks = getCalendarBreaks(frame)
    .filter((period): period is { start: Date; end: Date } => Boolean(period.start && period.end));

  const weeks: SchoolWeek[] = [];
  let monday = startOfIsoWeek(firstDay);
  const finalMonday = startOfIsoWeek(lastDay);

  while (monday <= finalMonday && weeks.length < 60) {
    const friday = addUtcDays(monday, 4);
    const overlapsBreak = breaks.some((period) => weekdayOverlap(monday, friday, period.start, period.end) >= 3);
    if (!overlapsBreak) {
      const { week, year } = isoWeek(monday);
      weeks.push({ date: monday, week, year });
    }
    monday = addUtcDays(monday, 7);
  }

  return weeks;
}

function getCalendarBreaks(frame: PlannerFrame): Array<{ start: Date | null; end: Date | null }> {
  const explicitEvents = frame.schoolCalendar.events.filter((event) => event.startDate || event.endDate);
  if (explicitEvents.length > 0) {
    return explicitEvents.map((event) => {
      const startValue = event.startDate || event.endDate;
      const endValue = event.endDate || event.startDate;
      return { start: parseDate(startValue), end: parseDate(endValue) };
    });
  }

  return [
    [frame.schoolCalendar.autumnBreakStart, frame.schoolCalendar.autumnBreakEnd],
    [frame.schoolCalendar.christmasBreakStart, frame.schoolCalendar.christmasBreakEnd],
    [frame.schoolCalendar.winterBreakStart, frame.schoolCalendar.winterBreakEnd],
    [frame.schoolCalendar.easterBreakStart, frame.schoolCalendar.easterBreakEnd],
    [frame.schoolCalendar.mayDay, frame.schoolCalendar.mayDay],
    [frame.schoolCalendar.constitutionDay, frame.schoolCalendar.constitutionDay],
    [frame.schoolCalendar.ascensionDay, frame.schoolCalendar.ascensionDay],
    [frame.schoolCalendar.whitMonday, frame.schoolCalendar.whitMonday],
  ].map(([start, end]) => ({ start: parseDate(start), end: parseDate(end) }));
}

function splitEvenly(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index >= count - remainder ? 1 : 0));
}

function splitBySemesters(weeks: SchoolWeek[], count: number): number[] {
  if (weeks.length === 0) return splitEvenly(count, count);
  const firstYear = weeks[0].year;
  const autumnWeeks = weeks.filter((week) => week.year === firstYear).length;
  const springWeeks = weeks.length - autumnWeeks;
  if (autumnWeeks === 0 || springWeeks === 0) return splitEvenly(weeks.length, count);

  const autumnCount = Math.max(1, Math.min(count - 1, Math.floor((autumnWeeks / weeks.length) * count)));
  const springCount = Math.max(1, count - autumnCount);
  return [...splitEvenly(autumnWeeks, autumnCount), ...splitEvenly(springWeeks, springCount)];
}

function formatCalendarWeeks(weeks: SchoolWeek[]): string {
  if (weeks.length === 0) return "Uker ikke satt";
  const ranges: Array<{ start: SchoolWeek; end: SchoolWeek }> = [];

  for (const current of weeks) {
    const previousRange = ranges[ranges.length - 1];
    const isNextWeek = previousRange
      ? addUtcDays(previousRange.end.date, 7).getTime() === current.date.getTime()
      : false;
    if (previousRange && isNextWeek) previousRange.end = current;
    else ranges.push({ start: current, end: current });
  }

  return ranges
    .map(({ start, end }) => {
      const weekLabel = start.week === end.week ? `uke ${start.week}` : `uke ${start.week}-${end.week}`;
      return start.year === end.year ? `${weekLabel} (${start.year})` : `${weekLabel} (${start.year}/${end.year})`;
    })
    .join(", ");
}

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfIsoWeek(date: Date): Date {
  const day = date.getUTCDay() || 7;
  return addUtcDays(date, 1 - day);
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function weekdayOverlap(weekStart: Date, weekEnd: Date, breakStart: Date, breakEnd: Date): number {
  let overlap = 0;
  for (let date = new Date(weekStart); date <= weekEnd; date = addUtcDays(date, 1)) {
    if (date >= breakStart && date <= breakEnd) overlap += 1;
  }
  return overlap;
}

function isoWeek(date: Date): { week: number; year: number } {
  const thursday = new Date(date);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstWeekStart = startOfIsoWeek(firstThursday);
  const week = Math.floor((thursday.getTime() - firstWeekStart.getTime()) / 604_800_000) + 1;
  return { week, year };
}
