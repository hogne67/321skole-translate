import type { MathWorksheet } from "@/lib/math/geometry/types";
import type { GeometryAutoResult } from "@/lib/math/geometry/submissionTypes";
import type { FractionWorksheet } from "@/lib/math/fractions/types";
import type { ReadingTestConfig } from "@/components/student/ReadingTestPlayer";

export type Role = "student" | "teacher" | "admin" | "parent" | "creator";

export type ReviewStatus = "reviewed" | "needs_work";

export type SubmissionStatus =
    | ReviewStatus
    | "draft"
    | "submitted"
    | "approved"
    | string;

export type SourceType = "myContent" | "library";

export type TaskType = "mcq" | "truefalse" | "open";

export type Task = {
    id?: string;
    order?: number;
    type?: TaskType | string;
    prompt?: string;
    options?: unknown[];
    correctAnswer?: unknown;
    sentence?: string;
    textWithGap?: string;
};

export type AnswersMap = Record<string, unknown>;

export type TeacherFeedback = {
    text?: string;
    updatedAt?: unknown;
    teacherUid?: string | null;
};

export type AiFeedback = {
    text?: string;
    createdAt?: unknown;
    updatedAt?: unknown;
    teacherUid?: string | null;
};

export type AutoGradeEntry = {
    type: "mcq" | "truefalse";
    isCorrect: boolean;
    studentAnswer: unknown;
    correctAnswer: unknown;
};

export type AutoGrade = {
    totalAuto: number;
    correctAuto: number;
    wrongAuto: number;
    unansweredAuto: number;
    percentAuto: number | null;
    byTask: Record<string, AutoGradeEntry>;
};

export type SubmissionDoc = {
    createdAt?: unknown;
    updatedAt?: unknown;
    status?: SubmissionStatus;

    answers?: AnswersMap | unknown;
    answersByTaskId?: AnswersMap | unknown;

    auth?: { isAnon?: boolean; uid?: string | null } | unknown;
    uid?: string;

    studentName?: string;
    studentDisplayName?: string;

    teacherFeedback?: TeacherFeedback | null;
    aiFeedback?: AiFeedback | null;
    auto?: AutoGrade | GeometryAutoResult | unknown;

    spaceId?: string;
    assignmentId?: string;

    sourceType?: SourceType | string | null;
    sourceId?: string | null;
    title?: string | null;
    level?: string | null;
    language?: string | null;

    taskType?: string | null;
    lessonType?: string | null;

    mathWorksheet?: MathWorksheet | FractionWorksheet | null;
    fractionWorksheet?: FractionWorksheet | null;
    mathType?: string | null;
    contentType?: string | null;

    startedAt?: unknown;
    submittedAt?: unknown;
    timeSpentSeconds?: unknown;

    readingTestTimeLimitSeconds?: unknown;
    readingTestTimeUsedSeconds?: unknown;
    readingTestTimedOut?: unknown;
    readingTestSubmittedManually?: unknown;
};

export type AssignmentDoc = {
    status?: "active" | "archived" | string;
    sourceType?: SourceType;
    sourceId?: string;

    title?: string;
    level?: string;
    language?: string;
    topic?: string;
    description?: string;

    createdAt?: unknown;
    assignedAt?: unknown;
    assignedByUid?: string;

    lessonType?: string;
    taskType?: string;
    readingTestConfig?: ReadingTestConfig | null;

    sourceText?: string;
    text?: string;
    tasks?: unknown;
    coverImageUrl?: string;

    mathWorksheet?: MathWorksheet | FractionWorksheet | null;
    fractionWorksheet?: FractionWorksheet | null;

    mathType?: string;
    contentType?: string;
};

export type Lesson = {
    title?: string;
    level?: string;
    topic?: string;
    language?: string;

    sourceText?: string;
    text?: string;
    tasks?: unknown;
    coverImageUrl?: string;

    isActive?: boolean;
    status?: string;

    lessonType?: string;
    taskType?: string;
    readingTestConfig?: ReadingTestConfig | null;

    mathWorksheet?: MathWorksheet | FractionWorksheet | null;
    fractionWorksheet?: FractionWorksheet | null;

    mathType?: string;
    contentType?: string;
};

export type SpaceMemberDoc = {
    name?: string;
    fullName?: string;
    displayName?: string;
    uid?: string;
    role?: string;
};

export type AiResp = {
    text: string;
    skipped?: boolean;
    locale?: string;
};