import { isDelivered, isRecord, safeString } from "./familyAssignments";

export type ParentSpaceGoalStatus = "active" | "completed" | "archived";

export type ParentSpaceGoalKind = "complete_assignments" | "custom";

export type ParentSpaceGoalDoc = {
  title: string;
  description?: string;
  reward?: string;
  status: ParentSpaceGoalStatus;
  kind: ParentSpaceGoalKind;
  targetCount?: number;
  assignmentIds?: string[];
  createdByUid: string;
  createdAt: unknown;
  countFrom?: unknown;
  updatedAt: unknown;
  completedAt?: unknown;
};

export type FamilyGoal = Pick<ParentSpaceGoalDoc, "title" | "description" | "reward" | "status" | "kind" | "targetCount" | "assignmentIds"> & {
  createdAt?: number;
  countFrom?: number;
  updatedAt?: number;
  endedAt?: number;
  completedAt?: number;
};

export type FamilyGoalItem = { id: string; data: FamilyGoal };
export type FamilyGoalProgress = FamilyGoalItem & { done: number };

type GoalDelivery = {
  id: string;
  status: unknown;
  submittedAtMillis: number;
  archived: boolean;
  archivedAt: number;
};

export function readFamilyGoal(
  id: string,
  value: unknown,
  toMillis: (value: unknown) => number,
): FamilyGoalItem | null {
  if (!isRecord(value)) return null;
  const title = safeString(value.title);
  const { status, targetCount } = value;
  if (!title || (status !== "active" && status !== "completed" && status !== "archived")) return null;
  const timestamp = (value: unknown) => {
    const time = toMillis(value);
    return time > 0 ? time : undefined;
  };
  const completedAt = timestamp(value.completedAt);
  const updatedAt = timestamp(value.updatedAt);
  return {
    id,
    data: {
      title,
      description: safeString(value.description) ?? undefined,
      reward: safeString(value.reward) ?? undefined,
      status: completedAt ? "completed" : status,
      kind: value.kind === "complete_assignments" ? value.kind : "custom",
      targetCount: typeof targetCount === "number" && Number.isFinite(targetCount) && targetCount > 0 ? targetCount : undefined,
      assignmentIds: Array.isArray(value.assignmentIds) ? value.assignmentIds.filter((id) => typeof id === "string") : undefined,
      createdAt: timestamp(value.createdAt),
      countFrom: timestamp(value.countFrom),
      updatedAt,
      completedAt,
      // Older archives have no saved outcome. Their last update is when the goal was replaced.
      endedAt: status === "archived" && !("completedAt" in value) ? updatedAt : undefined,
    },
  };
}

export function canCountArchivedLesson(goal: FamilyGoal, archivedAt: number) {
  if (goal.status === "completed" || (goal.status === "archived" && !goal.endedAt)) return false;
  if (goal.countFrom) return !archivedAt || archivedAt >= goal.countFrom;
  return !!goal.endedAt && archivedAt > goal.endedAt;
}

export function familyGoalProgress(item: FamilyGoalItem, deliveries: GoalDelivery[]): FamilyGoalProgress | null {
  const goal = item.data;
  if (goal.status === "completed") return { ...item, done: goal.targetCount ?? 0 };
  if (goal.status === "archived" && !goal.endedAt) return null;
  const assignmentIds = goal.assignmentIds?.length ? new Set(goal.assignmentIds) : null;
  const counted = deliveries.filter(({ id, status, submittedAtMillis, archived, archivedAt }) => {
    if (assignmentIds && !assignmentIds.has(id)) return false;
    if (!isDelivered(status)) return false;
    if (archived && !canCountArchivedLesson(goal, archivedAt)) return false;
    if (goal.countFrom && submittedAtMillis < goal.countFrom) return false;
    if (goal.endedAt && (!submittedAtMillis || submittedAtMillis > goal.endedAt)) return false;
    return true;
  });
  const done = counted.length;
  const target = goal.targetCount;
  if (target && done >= target) {
    const dates = counted.map(({ submittedAtMillis }) => submittedAtMillis).sort((a, b) => a - b);
    const reachedAt = Math.max(goal.createdAt ?? 0, dates[Math.ceil(target) - 1]);
    return { ...item, data: { ...goal, status: "completed", completedAt: reachedAt || goal.endedAt }, done };
  }
  return goal.status === "active" ? { ...item, done } : null;
}
