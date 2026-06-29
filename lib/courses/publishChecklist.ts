import type { Course, CoursePlanSession } from "./types";

export type CoursePublishChecklistItem = {
  id: string;
  label: string;
  passed: boolean;
  severity: "critical" | "warning";
};

export type CoursePublishChecklist = {
  items: CoursePublishChecklistItem[];
  passedCount: number;
  totalCount: number;
  readinessPercent: number;
  canPublish: boolean;
  missingCriticalLabels: string[];
};

type ChecklistCourse = Pick<
  Course,
  | "title"
  | "description"
  | "learningGoals"
  | "targetAudience"
  | "language"
  | "level"
  | "priceText"
  | "maxParticipants"
  | "coursePlan"
>;

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function hasPositiveNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function firstSession(plan: CoursePlanSession[]): CoursePlanSession | null {
  return plan.length > 0 ? plan[0] : null;
}

export function buildCoursePublishChecklist(course: ChecklistCourse): CoursePublishChecklist {
  const plan = course.coursePlan;
  const first = firstSession(plan);
  const hasAnySessionWithTitleAndDescription = plan.some(
    (session) => hasText(session.title) && hasText(session.description)
  );

  const items: CoursePublishChecklistItem[] = [
    {
      id: "title",
      label: "Title exists",
      passed: hasText(course.title),
      severity: "critical",
    },
    {
      id: "description",
      label: "Description exists",
      passed: hasText(course.description),
      severity: "critical",
    },
    {
      id: "learningGoals",
      label: "Learning goals exist",
      passed: hasText(course.learningGoals),
      severity: "critical",
    },
    {
      id: "targetAudience",
      label: "Target audience exists",
      passed: hasText(course.targetAudience),
      severity: "critical",
    },
    {
      id: "language",
      label: "Language exists",
      passed: hasText(course.language),
      severity: "critical",
    },
    {
      id: "level",
      label: "Level exists",
      passed: hasText(course.level),
      severity: "critical",
    },
    {
      id: "priceText",
      label: "Price text exists",
      passed: hasText(course.priceText),
      severity: "warning",
    },
    {
      id: "maxParticipants",
      label: "Max participants exists",
      passed: hasPositiveNumber(course.maxParticipants),
      severity: "warning",
    },
    {
      id: "sessions",
      label: "At least one session exists",
      passed: plan.length > 0,
      severity: "critical",
    },
    {
      id: "sessionReady",
      label: "At least one session has title and description",
      passed: hasAnySessionWithTitleAndDescription,
      severity: "critical",
    },
    {
      id: "eachSessionTitle",
      label: "Each session has title",
      passed: plan.length > 0 && plan.every((session) => hasText(session.title)),
      severity: "warning",
    },
    {
      id: "eachSessionDescription",
      label: "Each session has description",
      passed: plan.length > 0 && plan.every((session) => hasText(session.description)),
      severity: "warning",
    },
    {
      id: "firstSessionStartsAt",
      label: "First session has date/time",
      passed: Boolean(first && hasText(first.startsAt)),
      severity: "warning",
    },
    {
      id: "firstSessionMeetingUrl",
      label: "First session has meeting link",
      passed: Boolean(first && hasText(first.meetingUrl)),
      severity: "warning",
    },
  ];

  const passedCount = items.filter((item) => item.passed).length;
  const missingCriticalLabels = items
    .filter((item) => item.severity === "critical" && !item.passed)
    .map((item) => item.label);

  return {
    items,
    passedCount,
    totalCount: items.length,
    readinessPercent: Math.round((passedCount / items.length) * 100),
    canPublish: missingCriticalLabels.length === 0,
    missingCriticalLabels,
  };
}
