export type ParentSpaceGoalStatus = "active" | "completed" | "archived";

export type ParentSpaceGoalKind = "complete_assignments" | "custom";

export type ParentSpaceGoalDoc = {
  title: string;
  description?: string;
  status: ParentSpaceGoalStatus;
  kind: ParentSpaceGoalKind;
  targetCount?: number;
  assignmentIds?: string[];
  createdByUid: string;
  createdAt: unknown;
  updatedAt: unknown;
  completedAt?: unknown;
};
