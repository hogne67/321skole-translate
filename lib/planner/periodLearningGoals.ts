import { normalizePlannerPeriodLearningGoal, type PlannerPeriodLearningGoal } from "@/lib/planner/types";

export function validateSinglePeriodLearningGoal(
  value: unknown,
  validOfficialGoalIds: string[],
  level = ""
): PlannerPeriodLearningGoal | null {
  const record = isRecord(value) ? value : {};
  const rawGoal = isRecord(record.periodLearningGoal)
    ? record.periodLearningGoal
    : Array.isArray(record.periodLearningGoals)
      ? record.periodLearningGoals[0]
      : null;
  if (!rawGoal) return null;

  const validSourceIds = new Set(validOfficialGoalIds);
  const normalized = normalizePlannerPeriodLearningGoal(rawGoal, 0);
  const studentLanguage = normalizeStudentLanguageForLevel(
    normalized.studentLanguage.trim() || normalized.goal.trim(),
    level,
    0
  );
  const sourceOfficialGoalIds = [...new Set(normalized.sourceOfficialGoalIds)];
  if (
    !studentLanguage ||
    sourceOfficialGoalIds.length === 0 ||
    sourceOfficialGoalIds.some((goalId) => !validSourceIds.has(goalId))
  ) {
    return null;
  }

  return {
    ...normalized,
    id: "period-learning-goal-1",
    goal: studentLanguage,
    studentLanguage,
    sourceOfficialGoalIds,
  };
}

export function validatePeriodLearningGoals(
  value: unknown,
  selectedOfficialGoalIds: string[],
  level = ""
): { goals: PlannerPeriodLearningGoal[]; uncoveredOfficialGoalIds: string[] } | null {
  const record = isRecord(value) ? value : {};
  if (!Array.isArray(record.periodLearningGoals)) return null;
  const maxGoalCount = Math.max(1, Math.min(8, (selectedOfficialGoalIds.length || 1) * 3));
  if (record.periodLearningGoals.length < 1 || record.periodLearningGoals.length > maxGoalCount) return null;

  const validSourceIds = new Set(selectedOfficialGoalIds);
  const goals = record.periodLearningGoals.map((item, index) => {
    const normalized = normalizePlannerPeriodLearningGoal(item, index);
    const studentLanguage = normalizeStudentLanguageForLevel(
      normalized.studentLanguage.trim() || normalized.goal.trim(),
      level,
      index
    );
    return {
      ...normalized,
      id: `period-learning-goal-${index + 1}`,
      goal: studentLanguage,
      studentLanguage,
      sourceOfficialGoalIds: [...new Set(normalized.sourceOfficialGoalIds)],
    };
  });

  const invalidGoal = goals.some(
    (goal) =>
      !goal.studentLanguage.trim() ||
      goal.sourceOfficialGoalIds.length === 0 ||
      goal.sourceOfficialGoalIds.some((goalId) => !validSourceIds.has(goalId))
  );
  if (invalidGoal) return null;

  const coveredSourceIds = new Set(goals.flatMap((goal) => goal.sourceOfficialGoalIds));
  const uncoveredOfficialGoalIds = selectedOfficialGoalIds.filter((goalId) => !coveredSourceIds.has(goalId));
  return { goals, uncoveredOfficialGoalIds };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeStudentLanguageForLevel(value: string, level: string, index: number): string {
  const text = ensureSentence(value);
  if (!usesStrictStudentLanguage(level)) return text;
  if (!isBadStudentLanguage(text)) return text;
  return fallbackStudentLanguage(index);
}

function usesStrictStudentLanguage(level: string): boolean {
  const grade = Number(level.match(/\d+/)?.[0] ?? 0);
  return Number.isFinite(grade) && grade >= 1 && grade <= 6;
}

function isBadStudentLanguage(value: string): boolean {
  if (!value.trim()) return true;
  if (countWords(value) > 15) return true;
  if (/^jeg kan\s+(drøfte|reflektere)\b/i.test(value)) return true;
  if (/\b(knyttet|er|om|som|og|eller|for|til|ved|med)$/i.test(value.replace(/[.!?]\s*$/, "").trim())) return true;
  if (/gi eksempler som viser noe om gi eksempler/i.test(value)) return true;
  if (/variasjoner i identiteter,\s*seksuell orientering og kjønnsuttrykk/i.test(value)) return true;
  if (/sentrale hendelser som har ført til det demokratiet vi har i norge i dag/i.test(value)) return true;
  if (/hvordan møter mellom mennesker har bidratt til å endre hvordan mennesker har tenkt/i.test(value)) return true;
  return false;
}

function ensureSentence(value: string): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function countWords(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function fallbackStudentLanguage(index: number): string {
  return [
    "Jeg kan forklare temaet med egne ord.",
    "Jeg kan finne enkle eksempler.",
    "Jeg kan samtale om det vi lærer.",
    "Jeg kan lage et enkelt spørsmål.",
  ][index % 4];
}
