import { normalizePlannerPeriodLearningGoal, type PlannerPeriodLearningGoal } from "@/lib/planner/types";

export function validatePeriodLearningGoals(
  value: unknown,
  selectedOfficialGoalIds: string[]
): { goals: PlannerPeriodLearningGoal[]; uncoveredOfficialGoalIds: string[] } | null {
  const record = isRecord(value) ? value : {};
  if (!Array.isArray(record.periodLearningGoals)) return null;
  if (record.periodLearningGoals.length < 1 || record.periodLearningGoals.length > 4) return null;

  const validSourceIds = new Set(selectedOfficialGoalIds);
  const goals = record.periodLearningGoals.map((item, index) => {
    const normalized = normalizePlannerPeriodLearningGoal(item, index);
    return {
      ...normalized,
      id: `period-learning-goal-${index + 1}`,
      sourceOfficialGoalIds: [...new Set(normalized.sourceOfficialGoalIds)],
    };
  });

  const invalidGoal = goals.some(
    (goal) =>
      !goal.goal.trim() ||
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
