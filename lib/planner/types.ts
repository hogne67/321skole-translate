export type PlannerStatus = "draft" | "active" | "archived";
export type PlannerType = "annual" | "individual";
export type PlannerAiLevel = "short" | "standard" | "detailed";
export type CurriculumSourceType = "official" | "custom" | "upload";
export type PlannerPeriodStatus = "planned" | "active" | "completed";

export type PlannerDate = { toDate: () => Date };

export type PlannerFrame = {
  country: string;
  schoolType: string;
  subject: string;
  level: string;
  language: string;
  schoolYear: string;
  teachingWeeks: number;
  totalHours: number;
  focusArea: string;
  planType: PlannerType;
  aiLevel: PlannerAiLevel;
};

export type CurriculumSource = {
  type: CurriculumSourceType;
  framework: string;
  customText: string;
  uploadName: string;
};

export type PlannerPeriod = {
  id: string;
  status: PlannerPeriodStatus;
  title: string;
  weeks: string;
  linkedGoalIds: string[];
  goals: string;
  content: string;
  methods: string;
  assessment: string;
  reflection: string;
  weekPlans: PlannerWeekPlan[];
};

export type PlannerActivity = {
  id: string;
  title: string;
  period: string;
  description: string;
  method: string;
  assessment: string;
};

export type PlannerWeekPlan = {
  id: string;
  week: string;
  title: string;
  linkedGoalIds: string[];
  goals: string;
  activities: string;
  assessment: string;
  notes: string;
};

export type PlannerConcreteLearningGoal = {
  id: string;
  goal: string;
  studentLanguage: string;
  evidence: string;
};

export type PlannerIndividualDetails = {
  learnerName: string;
  learnerContext: string;
  supportNeeds: string;
  adaptations: string;
  progression: string;
  collaboration: string;
  evaluation: string;
};

export type PlannerReflectionEntry = {
  id: string;
  date: string;
  title: string;
  period: string;
  whatWorked: string;
  whatToAdjust: string;
  nextStep: string;
};

export type PlannerDocument = {
  title: string;
  description: string;
  subjectRelevance: string;
  coreValues: string;
  coreElements: string;
  interdisciplinaryThemes: string;
  basicSkills: string;
  learningGoals: string;
  assessmentForms: string;
  workMethods: string;
  annualOverview: string;
  reflection: string;
  yearEndSummary: string;
  nextYearNotes: string;
  concreteLearningGoals: PlannerConcreteLearningGoal[];
  individualDetails: PlannerIndividualDetails;
  reflectionLog: PlannerReflectionEntry[];
  periods: PlannerPeriod[];
  activities: PlannerActivity[];
};

export type Planner = {
  id: string;
  ownerUid: string;
  status: PlannerStatus;
  frame: PlannerFrame;
  curriculum: CurriculumSource;
  document: PlannerDocument;
  createdAt?: PlannerDate | null;
  updatedAt?: PlannerDate | null;
};

export type PlannerFormValues = Omit<Planner, "id" | "ownerUid" | "createdAt" | "updatedAt">;

export const DEFAULT_PLANNER_FRAME: PlannerFrame = {
  country: "Norge",
  schoolType: "Voksenopplæring",
  subject: "Norsk",
  level: "A2",
  language: "Norsk",
  schoolYear: "2026/2027",
  teachingWeeks: 38,
  totalHours: 114,
  focusArea: "",
  planType: "annual",
  aiLevel: "standard",
};

export const DEFAULT_CURRICULUM_SOURCE: CurriculumSource = {
  type: "official",
  framework: "LK20 / FOV",
  customText: "",
  uploadName: "",
};

export const DEFAULT_PLANNER_DOCUMENT: PlannerDocument = {
  title: "",
  description: "",
  subjectRelevance: "",
  coreValues: "",
  coreElements: "",
  interdisciplinaryThemes: "",
  basicSkills: "",
  learningGoals: "",
  assessmentForms: "",
  workMethods: "",
  annualOverview: "",
  reflection: "",
  yearEndSummary: "",
  nextYearNotes: "",
  concreteLearningGoals: [],
  individualDetails: {
    learnerName: "",
    learnerContext: "",
    supportNeeds: "",
    adaptations: "",
    progression: "",
    collaboration: "",
    evaluation: "",
  },
  reflectionLog: [],
  periods: [],
  activities: [],
};

export const DEFAULT_PLANNER_FORM: PlannerFormValues = {
  status: "draft",
  frame: DEFAULT_PLANNER_FRAME,
  curriculum: DEFAULT_CURRICULUM_SOURCE,
  document: DEFAULT_PLANNER_DOCUMENT,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringOrDefault(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberOrDefault(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

function stringArrayOrDefault(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizePlannerStatus(value: unknown): PlannerStatus {
  if (value === "active" || value === "archived") return value;
  return "draft";
}

function normalizePlannerType(value: unknown): PlannerType {
  return value === "individual" ? "individual" : "annual";
}

function normalizeAiLevel(value: unknown): PlannerAiLevel {
  if (value === "short" || value === "detailed") return value;
  return "standard";
}

function normalizeCurriculumSourceType(value: unknown): CurriculumSourceType {
  if (value === "custom" || value === "upload") return value;
  return "official";
}

function normalizePeriodStatus(value: unknown): PlannerPeriodStatus {
  if (value === "active" || value === "completed") return value;
  return "planned";
}

export function normalizePlannerFrame(value: unknown): PlannerFrame {
  const record = isRecord(value) ? value : {};
  return {
    country: stringOrDefault(record.country, DEFAULT_PLANNER_FRAME.country),
    schoolType: stringOrDefault(record.schoolType, DEFAULT_PLANNER_FRAME.schoolType),
    subject: stringOrDefault(record.subject, DEFAULT_PLANNER_FRAME.subject),
    level: stringOrDefault(record.level, DEFAULT_PLANNER_FRAME.level),
    language: stringOrDefault(record.language, DEFAULT_PLANNER_FRAME.language),
    schoolYear: stringOrDefault(record.schoolYear, DEFAULT_PLANNER_FRAME.schoolYear),
    teachingWeeks: numberOrDefault(record.teachingWeeks, DEFAULT_PLANNER_FRAME.teachingWeeks),
    totalHours: numberOrDefault(record.totalHours, DEFAULT_PLANNER_FRAME.totalHours),
    focusArea: stringOrDefault(record.focusArea),
    planType: normalizePlannerType(record.planType),
    aiLevel: normalizeAiLevel(record.aiLevel),
  };
}

export function normalizeCurriculumSource(value: unknown): CurriculumSource {
  const record = isRecord(value) ? value : {};
  return {
    type: normalizeCurriculumSourceType(record.type),
    framework: stringOrDefault(record.framework, DEFAULT_CURRICULUM_SOURCE.framework),
    customText: stringOrDefault(record.customText),
    uploadName: stringOrDefault(record.uploadName),
  };
}

export function normalizePlannerPeriod(value: unknown, index: number): PlannerPeriod {
  const record = isRecord(value) ? value : {};
  return {
    id: stringOrDefault(record.id, `period-${index + 1}`),
    status: normalizePeriodStatus(record.status),
    title: stringOrDefault(record.title),
    weeks: stringOrDefault(record.weeks),
    linkedGoalIds: stringArrayOrDefault(record.linkedGoalIds),
    goals: stringOrDefault(record.goals),
    content: stringOrDefault(record.content),
    methods: stringOrDefault(record.methods),
    assessment: stringOrDefault(record.assessment),
    reflection: stringOrDefault(record.reflection),
    weekPlans: Array.isArray(record.weekPlans)
      ? record.weekPlans.map((weekPlan, weekIndex) => normalizePlannerWeekPlan(weekPlan, weekIndex))
      : [],
  };
}

export function normalizePlannerWeekPlan(value: unknown, index: number): PlannerWeekPlan {
  const record = isRecord(value) ? value : {};
  return {
    id: stringOrDefault(record.id, `week-${index + 1}`),
    week: stringOrDefault(record.week),
    title: stringOrDefault(record.title),
    linkedGoalIds: stringArrayOrDefault(record.linkedGoalIds),
    goals: stringOrDefault(record.goals),
    activities: stringOrDefault(record.activities),
    assessment: stringOrDefault(record.assessment),
    notes: stringOrDefault(record.notes),
  };
}

export function normalizePlannerActivity(value: unknown, index: number): PlannerActivity {
  const record = isRecord(value) ? value : {};
  return {
    id: stringOrDefault(record.id, `activity-${index + 1}`),
    title: stringOrDefault(record.title),
    period: stringOrDefault(record.period),
    description: stringOrDefault(record.description),
    method: stringOrDefault(record.method),
    assessment: stringOrDefault(record.assessment),
  };
}

export function normalizePlannerConcreteLearningGoal(value: unknown, index: number): PlannerConcreteLearningGoal {
  const record = isRecord(value) ? value : {};
  return {
    id: stringOrDefault(record.id, `concrete-goal-${index + 1}`),
    goal: stringOrDefault(record.goal),
    studentLanguage: stringOrDefault(record.studentLanguage),
    evidence: stringOrDefault(record.evidence),
  };
}

export function normalizePlannerDocument(value: unknown): PlannerDocument {
  const record = isRecord(value) ? value : {};
  return {
    title: stringOrDefault(record.title),
    description: stringOrDefault(record.description),
    subjectRelevance: stringOrDefault(record.subjectRelevance),
    coreValues: stringOrDefault(record.coreValues),
    coreElements: stringOrDefault(record.coreElements),
    interdisciplinaryThemes: stringOrDefault(record.interdisciplinaryThemes),
    basicSkills: stringOrDefault(record.basicSkills),
    learningGoals: stringOrDefault(record.learningGoals),
    assessmentForms: stringOrDefault(record.assessmentForms),
    workMethods: stringOrDefault(record.workMethods),
    annualOverview: stringOrDefault(record.annualOverview),
    reflection: stringOrDefault(record.reflection),
    yearEndSummary: stringOrDefault(record.yearEndSummary),
    nextYearNotes: stringOrDefault(record.nextYearNotes),
    concreteLearningGoals: Array.isArray(record.concreteLearningGoals)
      ? record.concreteLearningGoals.map((goal, index) => normalizePlannerConcreteLearningGoal(goal, index))
      : [],
    individualDetails: normalizePlannerIndividualDetails(record.individualDetails),
    reflectionLog: Array.isArray(record.reflectionLog)
      ? record.reflectionLog.map((entry, index) => normalizePlannerReflectionEntry(entry, index))
      : [],
    periods: Array.isArray(record.periods)
      ? record.periods.map((period, index) => normalizePlannerPeriod(period, index))
      : [],
    activities: Array.isArray(record.activities)
      ? record.activities.map((activity, index) => normalizePlannerActivity(activity, index))
      : [],
  };
}

export function normalizePlannerReflectionEntry(value: unknown, index: number): PlannerReflectionEntry {
  const record = isRecord(value) ? value : {};
  return {
    id: stringOrDefault(record.id, `reflection-${index + 1}`),
    date: stringOrDefault(record.date),
    title: stringOrDefault(record.title),
    period: stringOrDefault(record.period),
    whatWorked: stringOrDefault(record.whatWorked),
    whatToAdjust: stringOrDefault(record.whatToAdjust),
    nextStep: stringOrDefault(record.nextStep),
  };
}

export function normalizePlannerIndividualDetails(value: unknown): PlannerIndividualDetails {
  const record = isRecord(value) ? value : {};
  return {
    learnerName: stringOrDefault(record.learnerName),
    learnerContext: stringOrDefault(record.learnerContext),
    supportNeeds: stringOrDefault(record.supportNeeds),
    adaptations: stringOrDefault(record.adaptations),
    progression: stringOrDefault(record.progression),
    collaboration: stringOrDefault(record.collaboration),
    evaluation: stringOrDefault(record.evaluation),
  };
}

export function normalizePlanner(id: string, data: Record<string, unknown>): Planner {
  return {
    id,
    ownerUid: stringOrDefault(data.ownerUid),
    status: normalizePlannerStatus(data.status),
    frame: normalizePlannerFrame(data.frame),
    curriculum: normalizeCurriculumSource(data.curriculum),
    document: normalizePlannerDocument(data.document),
    createdAt: normalizeDate(data.createdAt),
    updatedAt: normalizeDate(data.updatedAt),
  };
}

export function serializePlannerDocument(document: PlannerDocument): PlannerDocument {
  return normalizePlannerDocument(document);
}

function normalizeDate(value: unknown): PlannerDate | null {
  if (value && typeof value === "object" && "toDate" in value) {
    const candidate = value as { toDate?: unknown };
    if (typeof candidate.toDate === "function") return candidate as PlannerDate;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return { toDate: () => date };
  }

  return null;
}
