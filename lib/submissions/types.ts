import type { MathWorksheet } from "@/lib/math/geometry/types";
import type { GeometryAutoResult } from "@/lib/math/geometry/submissionTypes";
import type { FractionWorksheet } from "@/lib/math/fractions/types";
import type { ArithmeticWorksheet } from "@/lib/math/arithmetic/types";
import type { LengthWorksheet } from "@/lib/math/length/worksheet";
import type { PercentageWorksheet } from "@/lib/math/percentage/worksheet";
import type { EquationWorksheet } from "@/lib/math/equations/worksheet";
import type { ComparisonWorksheet } from "@/lib/math/comparison/worksheet";
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
    type: "mcq" | "truefalse" | "fraction" | "length" | "measurement" | "comparison" | "percentage" | "equations";
    isCorrect: boolean;
    studentAnswer: unknown;
    correctAnswer: unknown;
    isPartial?: boolean;
    points?: number;
};

export type AutoGrade = {
    totalAuto: number;
    correctAuto: number;
    partialAuto?: number;
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

    mathWorksheet?: MathWorksheet | FractionWorksheet | ArithmeticWorksheet | LengthWorksheet | ComparisonWorksheet | PercentageWorksheet | EquationWorksheet | null;
    lengthWorksheet?: LengthWorksheet | null;
    measurementWorksheet?: LengthWorksheet | null;
    fractionWorksheet?: FractionWorksheet | null;
    arithmeticWorksheet?: ArithmeticWorksheet | null;
    mathType?: string | null;
    contentType?: string | null;

    startedAt?: unknown;
    submittedAt?: unknown;
    timeSpentSeconds?: unknown;

    readingTestTimeLimitSeconds?: unknown;
    readingTestTimeUsedSeconds?: unknown;
    readingTestTimeSpentSeconds?: unknown;
    readingTestSecondsLeftAtSubmit?: unknown;
    readingTestTimedOut?: unknown;
    readingTestSubmittedManually?: unknown;
    readingTimerResult?: unknown;

    audioReading?: unknown;
    podcastWorkshop?: unknown;
    podcastWorkshopFeedback?: unknown;
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

    mathWorksheet?: MathWorksheet | FractionWorksheet | ArithmeticWorksheet | LengthWorksheet | ComparisonWorksheet | PercentageWorksheet | EquationWorksheet | null;
    lengthWorksheet?: LengthWorksheet | null;
    measurementWorksheet?: LengthWorksheet | null;
    fractionWorksheet?: FractionWorksheet | null;
    arithmeticWorksheet?: ArithmeticWorksheet | null;

    mathType?: string;
    contentType?: string;
    podcastWorkshopConfig?: unknown;
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

    mathWorksheet?: MathWorksheet | FractionWorksheet | ArithmeticWorksheet | LengthWorksheet | ComparisonWorksheet | PercentageWorksheet | EquationWorksheet | null;
    lengthWorksheet?: LengthWorksheet | null;
    measurementWorksheet?: LengthWorksheet | null;
    fractionWorksheet?: FractionWorksheet | null;
    arithmeticWorksheet?: ArithmeticWorksheet | null;

    mathType?: string;
    contentType?: string;
    podcastWorkshopConfig?: unknown;
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
