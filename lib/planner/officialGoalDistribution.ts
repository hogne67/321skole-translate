import {
  normalizePlannerPeriodLearningGoal,
  type PlannerLocalInitiative,
  type PlannerPeriod,
  type PlannerPeriodLearningGoal,
} from "@/lib/planner/types";

type OfficialGoalPeriodLink = {
  periodId: string;
  officialGoalIds: string[];
};

type PeriodLearningGoalLink = {
  periodId: string;
  learningGoals: PlannerPeriodLearningGoal[];
};

type PeriodPlanningSuggestion = {
  periodId: string;
  goals: string;
  content: string;
  methods: string;
  assessment: string;
};

type OfficialGoalDistributionResult = {
  officialGoalPeriodLinks: OfficialGoalPeriodLink[];
  periodLearningGoalLinks: PeriodLearningGoalLink[];
  periodPlanningSuggestions: PeriodPlanningSuggestion[];
};

export function validateOfficialGoalDistribution(
  value: unknown,
  periods: PlannerPeriod[],
  officialGoalCount: number,
  lockedInitiatives: PlannerLocalInitiative[] = []
): OfficialGoalDistributionResult | null {
  const record = isRecord(value) ? value : {};
  if (officialGoalCount <= 0 || periods.length === 0) return null;

  const validPeriodIds = new Set(periods.map((period) => period.id));
  const validGoalIds = new Set(Array.from({ length: officialGoalCount }, (_, index) => `udir-goal-${index + 1}`));
  const rawAssignments = Array.isArray(record.goalAssignments) ? record.goalAssignments : [];
  const assignmentMap = new Map<string, Set<string>>();

  rawAssignments.forEach((item) => {
    const assignment = isRecord(item) ? item : {};
    const officialGoalId = typeof assignment.officialGoalId === "string" ? assignment.officialGoalId : "";
    if (!validGoalIds.has(officialGoalId)) return;

    const periodIds = Array.isArray(assignment.periodIds)
      ? assignment.periodIds.filter((id): id is string => typeof id === "string" && validPeriodIds.has(id))
      : [];
    if (periodIds.length === 0) return;

    assignmentMap.set(officialGoalId, new Set([...(assignmentMap.get(officialGoalId) ?? []), ...periodIds]));
  });

  for (let index = 0; index < officialGoalCount; index += 1) {
    const goalId = `udir-goal-${index + 1}`;
    if (assignmentMap.has(goalId)) continue;
    const targetPeriod = periods[Math.floor((index * periods.length) / officialGoalCount)] ?? periods[0];
    assignmentMap.set(goalId, new Set([targetPeriod.id]));
  }

  const assignments = [...assignmentMap.entries()].map(([officialGoalId, periodIds]) => ({
    officialGoalId,
    periodIds: [...periodIds],
  }));

  let officialGoalPeriodLinks = periods.map((period) => ({
    periodId: period.id,
    officialGoalIds: assignments
      .filter((assignment) => assignment.periodIds.includes(period.id))
      .map((assignment) => assignment.officialGoalId),
  }));
  officialGoalPeriodLinks = balanceGoalCoverageAcrossPeriods(officialGoalPeriodLinks, officialGoalCount);

  const learningGoalRecords = (Array.isArray(record.periodLearningGoals) ? record.periodLearningGoals : []).map((item) => {
    const periodGoalRecord = isRecord(item) ? item : {};
    return {
      periodId: typeof periodGoalRecord.periodId === "string" ? periodGoalRecord.periodId : "",
      learningGoals: Array.isArray(periodGoalRecord.learningGoals) ? periodGoalRecord.learningGoals : [],
    };
  });
  const seenLearningGoalPeriodIds = new Set<string>();
  const validLearningGoalRecords = learningGoalRecords.filter((item) => {
    if (!validPeriodIds.has(item.periodId) || seenLearningGoalPeriodIds.has(item.periodId)) return false;
    seenLearningGoalPeriodIds.add(item.periodId);
    return true;
  });

  const officialGoalsByPeriod = new Map(
    officialGoalPeriodLinks.map((link) => [link.periodId, new Set(link.officialGoalIds)])
  );
  const periodLearningGoalLinks = validLearningGoalRecords.flatMap((item): PeriodLearningGoalLink[] => {
    const period = periods.find((candidate) => candidate.id === item.periodId);
    const targetCount = period ? targetLearningGoalCount(periods, period) : 1;
    const learningGoals = item.learningGoals.slice(0, 4).map((goal, index) => {
      const normalized = normalizePlannerPeriodLearningGoal(goal, index);
      return {
        ...normalized,
        id: `period-learning-goal-${item.periodId}-${index + 1}`,
        sourceOfficialGoalIds: [...new Set(normalized.sourceOfficialGoalIds)],
      };
    });
    const validLearningGoals = learningGoals.filter(
      (goal) =>
        goal.goal.trim() &&
        goal.studentLanguage.trim() &&
        goal.sourceOfficialGoalIds.length > 0 &&
        goal.sourceOfficialGoalIds.every((goalId) => officialGoalsByPeriod.get(item.periodId)?.has(goalId))
    );
    while (validLearningGoals.length < targetCount) {
      const sourceOfficialGoalIds = [...(officialGoalsByPeriod.get(item.periodId) ?? new Set<string>())].slice(0, 1);
      if (sourceOfficialGoalIds.length === 0) break;
      validLearningGoals.push(createFallbackLearningGoal(item.periodId, validLearningGoals.length, sourceOfficialGoalIds));
    }
    return validLearningGoals.length > 0 ? [{ periodId: item.periodId, learningGoals: validLearningGoals }] : [];
  });
  const periodLearningGoalIds = new Set(periodLearningGoalLinks.map((link) => link.periodId));
  for (const period of periods) {
    if (periodLearningGoalIds.has(period.id)) continue;
    const sourceOfficialGoalIds = [...(officialGoalsByPeriod.get(period.id) ?? new Set<string>())].slice(0, 1);
    if (sourceOfficialGoalIds.length === 0) continue;
    const targetCount = targetLearningGoalCount(periods, period);
    periodLearningGoalLinks.push({
      periodId: period.id,
      learningGoals: Array.from({ length: targetCount }, (_, index) =>
        createFallbackLearningGoal(period.id, index, sourceOfficialGoalIds)
      ),
    });
  }

  const planningSuggestions = (Array.isArray(record.periodPlanningSuggestions) ? record.periodPlanningSuggestions : []).map((item) => {
    const suggestion = isRecord(item) ? item : {};
    return {
      periodId: typeof suggestion.periodId === "string" ? suggestion.periodId : "",
      goals: sanitizePlanningText(suggestion.goals, "goals", 700),
      content: sanitizePlanningText(suggestion.content, "content", 1000),
      methods: sanitizePlanningText(suggestion.methods, "methods", 1000),
      assessment: sanitizePlanningText(suggestion.assessment, "assessment", 1000),
    };
  });
  const seenPlanningPeriodIds = new Set<string>();
  const validPlanningSuggestions = planningSuggestions.filter((item) => {
    if (!validPeriodIds.has(item.periodId) || seenPlanningPeriodIds.has(item.periodId)) return false;
    if (!item.goals.trim() || !item.content.trim() || !item.methods.trim() || !item.assessment.trim()) return false;
    seenPlanningPeriodIds.add(item.periodId);
    return true;
  });

  const planningPeriodIds = new Set(validPlanningSuggestions.map((item) => item.periodId));
  for (const period of periods) {
    if (planningPeriodIds.has(period.id)) continue;
    validPlanningSuggestions.push(createFallbackPlanningSuggestion(period));
  }
  const planningSuggestionsWithLockedInitiatives = applyLockedInitiatives(
    validPlanningSuggestions,
    periods,
    lockedInitiatives
  );

  return {
    officialGoalPeriodLinks,
    periodLearningGoalLinks,
    periodPlanningSuggestions: planningSuggestionsWithLockedInitiatives,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function balanceGoalCoverageAcrossPeriods(
  links: OfficialGoalPeriodLink[],
  officialGoalCount: number
): OfficialGoalPeriodLink[] {
  if (links.length === 0 || officialGoalCount === 0) return links;
  const allGoalIds = Array.from({ length: officialGoalCount }, (_, index) => `udir-goal-${index + 1}`);
  const emptyPeriodCount = links.filter((link) => link.officialGoalIds.length === 0).length;

  if (links.length > officialGoalCount && emptyPeriodCount > 0) {
    return links.map((link, index) => {
      const primaryGoalId = allGoalIds[Math.min(officialGoalCount - 1, Math.floor((index * officialGoalCount) / links.length))];
      return { ...link, officialGoalIds: [primaryGoalId] };
    });
  }

  return links.map((link, index) => {
    if (link.officialGoalIds.length > 0) return link;
    const previous = [...links].slice(0, index).reverse().find((item) => item.officialGoalIds.length > 0);
    const next = links.slice(index + 1).find((item) => item.officialGoalIds.length > 0);
    return {
      ...link,
      officialGoalIds: previous?.officialGoalIds.slice(0, 1) ?? next?.officialGoalIds.slice(0, 1) ?? [allGoalIds[0]],
    };
  });
}

function targetLearningGoalCount(periods: PlannerPeriod[], period: PlannerPeriod): number {
  if (periods.length >= 30) return 1;
  const weekCount = estimateWeekCount(period.weeks);
  if (weekCount <= 1) return 1;
  return 3;
}

function estimateWeekCount(value: string): number {
  const numbers = new Set<number>();
  for (const match of value.matchAll(/(?:uke|undervisningsuke)\s*(\d+)(?:\s*[-–]\s*(\d+))?/gi)) {
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (end >= start) {
      for (let week = start; week <= end && week <= start + 8; week += 1) numbers.add(week);
    } else {
      for (let week = start; week <= 53; week += 1) numbers.add(week);
      for (let week = 1; week <= end; week += 1) numbers.add(week);
    }
  }
  return numbers.size > 0 ? numbers.size : 3;
}

function createFallbackLearningGoal(
  periodId: string,
  index: number,
  sourceOfficialGoalIds: string[]
): PlannerPeriodLearningGoal {
  const variants = [
    {
      goal: "Forstå og forklare sentrale deler av kompetansemålet i arbeid med periodens faglige innhold.",
      studentLanguage: "Jeg kan forklare viktige ideer i det vi arbeider med denne perioden.",
    },
    {
      goal: "Bruke faglige begreper og strategier som hører til kompetansemålet i relevante oppgaver.",
      studentLanguage: "Jeg kan bruke riktige begreper og strategier når jeg løser oppgaver.",
    },
    {
      goal: "Vise faglig utvikling gjennom samtale, arbeid og egen forklaring av hva jeg har lært.",
      studentLanguage: "Jeg kan vise og forklare hva jeg har lært i perioden.",
    },
  ];
  const variant = variants[index % variants.length];
  return {
    id: `period-learning-goal-${periodId}-${index + 1}`,
    goal: variant.goal,
    studentLanguage: variant.studentLanguage,
    sourceOfficialGoalIds,
  };
}

function createFallbackPlanningSuggestion(period: PlannerPeriod): PeriodPlanningSuggestion {
  return {
    periodId: period.id,
    goals: defaultPlanningText("goals"),
    content: defaultPlanningText("content"),
    methods: defaultPlanningText("methods"),
    assessment: defaultPlanningText("assessment"),
  };
}

function applyLockedInitiatives(
  suggestions: PeriodPlanningSuggestion[],
  periods: PlannerPeriod[],
  initiatives: PlannerLocalInitiative[]
): PeriodPlanningSuggestion[] {
  const locked = initiatives.filter((item) => item.locked && item.title.trim());
  if (locked.length === 0) return suggestions;

  return suggestions.map((suggestion) => {
    const period = periods.find((item) => item.id === suggestion.periodId);
    if (!period) return suggestion;
    const matching = locked.filter((initiative) => initiativeMatchesPeriod(initiative, period));
    if (matching.length === 0) return suggestion;

    const addition = matching
      .map((initiative) => `${initiative.title}${initiative.timing ? ` (${initiative.timing})` : ""}`)
      .join(", ");
    const alreadyMentioned = matching.every((initiative) =>
      `${suggestion.content}\n${suggestion.methods}`.toLowerCase().includes(initiative.title.toLowerCase())
    );
    if (alreadyMentioned) return suggestion;

    return {
      ...suggestion,
      content: `${suggestion.content}\n\nLåst lokal ramme: ${addition}.`.trim(),
      methods: `${suggestion.methods}\n\nTa hensyn til den låste lokale rammen i organisering og arbeidsmåter.`.trim(),
    };
  });
}

function initiativeMatchesPeriod(initiative: PlannerLocalInitiative, period: PlannerPeriod): boolean {
  const dateWeeks = weekNumbersFromDates(initiative.startDate, initiative.endDate);
  const periodWeeks = weekNumbers(period.weeks.toLowerCase());
  if (dateWeeks.length > 0 && periodWeeks.length > 0) {
    return dateWeeks.some((week) => periodWeeks.includes(week));
  }

  const timing = initiative.timing.toLowerCase();
  const weeks = period.weeks.toLowerCase();
  const timingWeeks = weekNumbers(timing);
  if (timingWeeks.length > 0 && periodWeeks.length > 0) {
    return timingWeeks.some((week) => periodWeeks.includes(week));
  }
  return Boolean(timing && weeks.includes(timing));
}

function weekNumbersFromDates(startValue: string, endValue: string): number[] {
  const start = parseIsoDate(startValue);
  if (!start) return [];
  const end = parseIsoDate(endValue) ?? start;
  if (end < start) return [];
  const numbers = new Set<number>();
  for (let date = startOfIsoWeek(start); date <= end; date = addUtcDays(date, 7)) {
    numbers.add(isoWeek(date));
  }
  return [...numbers];
}

function parseIsoDate(value: string): Date | null {
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

function isoWeek(date: Date): number {
  const thursday = new Date(date);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstWeekStart = startOfIsoWeek(firstThursday);
  return Math.floor((thursday.getTime() - firstWeekStart.getTime()) / 604_800_000) + 1;
}

function weekNumbers(value: string): number[] {
  const numbers = new Set<number>();
  for (const match of value.matchAll(/(?:uke|week|undervisningsuke)\s*(\d+)(?:\s*-\s*(\d+))?/gi)) {
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    for (let week = start; week <= end && week <= start + 60; week += 1) numbers.add(week);
  }
  return [...numbers];
}

function safeText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function sanitizePlanningText(value: unknown, field: keyof Omit<PeriodPlanningSuggestion, "periodId">, maxLength: number): string {
  const text = safeText(value, maxLength);
  if (!text || isPlaceholderPlanningText(text)) return defaultPlanningText(field);
  return text;
}

function isPlaceholderPlanningText(value: string): boolean {
  const text = value.toLowerCase();
  return [
    "velg faglig innhold",
    "velg innhold",
    "fyll inn",
    "sett inn",
    "choose content",
    "select content",
    "fill in",
    "insert content",
  ].some((phrase) => text.includes(phrase));
}

function defaultPlanningText(field: keyof Omit<PeriodPlanningSuggestion, "periodId">): string {
  if (field === "goals") {
    return "Arbeid med periodens valgte kompetansemål gjennom konkrete lokale læringsmål.";
  }
  if (field === "content") {
    return "Faglig innhold hentes fra temaer, tekster, oppgaver og situasjoner som passer til periodens kompetansemål.";
  }
  if (field === "methods") {
    return "Bruk felles modellering, samtale, samarbeid og individuell øving med tydelige stoppunkter underveis.";
  }
  return "Følg elevenes utvikling gjennom observasjon, samtale, korte elevprodukter og egenvurdering.";
}
