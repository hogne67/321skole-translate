// lib/math/geometry/submissionTypes.ts
import type { MathWorksheet } from "./types";

export type GeometryViewMode = "print" | "practice" | "submission" | "review";

export type GeometryTaskAnswer = {
  taskId: string;
  shapeName?: string;
  perimeterValue?: number | null;
  areaValue?: number | null;
  updatedAt?: unknown;
};

export type GeometryAnswersByTaskId = Record<string, GeometryTaskAnswer>;

export type GeometryAutoCheckMethod =
  | "exact"
  | "numeric_tolerance"
  | "composite";

export type GeometryAutoFieldKey = "shapeName" | "perimeter" | "area";

export type GeometryAutoFieldResult = {
  key: GeometryAutoFieldKey;
  label: string;
  isCorrect: boolean | null;
  expected?: string;
  actual?: string;
};

export type GeometryAutoTaskStatus =
  | "correct"
  | "partial"
  | "wrong"
  | "unanswered";

export type GeometryAutoTaskResult = {
  isCorrect: boolean | null;
  score: number;
  method: GeometryAutoCheckMethod;
  expected?: string;
  studentAnswer?: string;
  status?: GeometryAutoTaskStatus;
  parts?: Partial<Record<GeometryAutoFieldKey, GeometryAutoFieldResult>>;
};

export type GeometryAutoResult = {
  total: number;
  correct: number;
  partial?: number;
  wrong: number;
  unanswered: number;
  percent: number;
  byTaskId: Record<string, GeometryAutoTaskResult>;
};

export type GeometryAIFeedbackItem = {
  level: "good" | "almost" | "incorrect" | "missing";
  feedback: string;
  hint?: string;
  nextStep?: string;
};

export type GeometryAIFeedback = {
  summary?: string;
  byTaskId: Record<string, GeometryAIFeedbackItem>;
  generatedAt?: unknown;
  model?: string;
};

export type GeometryPracticeAttempt = {
  id?: string;
  ownerUid: string;
  ownerRole: "student" | "parent" | "teacher";
  mode: "practice";
  worksheet: MathWorksheet;
  answersByTaskId: GeometryAnswersByTaskId;
  auto?: GeometryAutoResult;
  aiFeedback?: GeometryAIFeedback;
  createdAt?: unknown;
  updatedAt?: unknown;
  completedAt?: unknown;
};

export type GeometrySubmissionStatus =
  | "draft"
  | "submitted"
  | "needs_work"
  | "approved"
  | "reviewed";

export type GeometrySubmissionDoc = {
  id?: string;
  spaceId: string;
  assignmentId: string;
  studentUid: string;
  taskType: "math_geometry";
  status: GeometrySubmissionStatus;
  worksheet: MathWorksheet;
  answersByTaskId: GeometryAnswersByTaskId;
  auto?: GeometryAutoResult;
  aiFeedback?: GeometryAIFeedback;
  teacherFeedback?: {
    summary?: string;
    teacherUid?: string;
    updatedAt?: unknown;
  };
  parentFeedback?: {
    summary?: string;
    stars?: number | null;
    parentUid?: string;
    updatedAt?: unknown;
  };
  createdAt?: unknown;
  updatedAt?: unknown;
  submittedAt?: unknown;
};