import { isDelivered } from "./familyAssignments";

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

type GoalDelivery = {
  id: string;
  status: unknown;
  submittedAtMillis: number;
  archived: boolean;
};

export function countParentGoalDeliveries(
  goal: { assignmentIds?: string[]; countFrom?: number },
  deliveries: GoalDelivery[]
) {
  const assignmentIds = goal.assignmentIds?.length ? new Set(goal.assignmentIds) : null;
  return deliveries.filter(({ id, status, submittedAtMillis, archived }) => {
    if (assignmentIds && !assignmentIds.has(id)) return false;
    if (!isDelivered(status)) return false;
    return goal.countFrom ? submittedAtMillis >= goal.countFrom : !archived;
  }).length;
}
