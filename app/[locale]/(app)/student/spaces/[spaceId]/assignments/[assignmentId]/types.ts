import type { ReadingTestConfig } from "@/components/student/ReadingTestPlayer";
import type { MathWorksheet } from "@/lib/math/geometry/types";
import type { FractionWorksheet } from "@/lib/math/fractions/types";

export type TextSize = "normal" | "large" | "xlarge";

export type Lesson = {
    title?: string;
    level?: string;
    topic?: string;
    language?: string;
    sourceText?: string;
    text?: string;
    tasks?: unknown;
    coverImageUrl?: string;
    imageTasks?: unknown;
    isActive?: boolean;
    status?: string;
    lessonType?: string;
    taskType?: string;
    readingTestConfig?: ReadingTestConfig | null;
    textSize?: TextSize;
    mathWorksheet?: MathWorksheet | null;
    fractionWorksheet?: FractionWorksheet | null;
    mathType?: string;
    contentType?: string;
    audioReadingEnabled?: boolean;
    audioReadingRequired?: boolean;
};

export type SourceType = "myContent" | "library";

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

    sourceText?: string;
    text?: string;
    tasks?: unknown;
    coverImageUrl?: string;
    imageTasks?: unknown;
    lessonType?: string;
    taskType?: string;
    readingTestConfig?: ReadingTestConfig | null;
    textSize?: TextSize;

    mathWorksheet?: MathWorksheet | null;
    fractionWorksheet?: FractionWorksheet | null;

    mathType?: string;
    contentType?: string;
    audioReadingEnabled?: boolean;
    audioReadingRequired?: boolean;
};

export type TaskType = "mcq" | "truefalse" | "open";

export type Task = {
    id?: string;
    order?: number;
    type?: TaskType | string;
    prompt?: string;
    options?: unknown[];
    correctAnswer?: unknown;
    supportWords?: unknown[];
    successCriteria?: unknown[];
    imageDescription?: string;
    imageUrl?: string;
};

export type AnswersMap = Record<string, unknown>;

export type TranslatedTask = {
    stableId: string;
    translatedPrompt?: string;
    translatedOptions?: string[];
};

export type TranslatedSection = {
    key: string;
    translatedText: string;
};

export type TranslatingState =
    | null
    | "text"
    | `section:${string}`
    | `task:${string}`;

export type TtsLang = "no" | "en" | "pt-BR";

export type SubmissionStatus =
    | "draft"
    | "submitted"
    | "needs_work"
    | "reviewed"
    | "approved"
    | "rejected"
    | string;

export type TeacherFeedback = {
    text?: string;
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

export type FractionAutoGrade = {
    totalAuto: number;
    correctAuto: number;
    wrongAuto: number;
    unansweredAuto: number;
    percentAuto: number | null;
    byTask: Record<
        string,
        {
            type: "fraction";
            isCorrect: boolean;
            studentAnswer: unknown;
            correctAnswer: unknown;
        }
    >;
};

export type SubmissionDoc = {
    uid?: string;
    status?: SubmissionStatus;
    title?: string | null;
    teacherFeedback?: TeacherFeedback | null;
    updatedAt?: unknown;
    createdAt?: unknown;
    answers?: AnswersMap | unknown;
    answersByTaskId?: AnswersMap | unknown;
    auto?: AutoGrade | FractionAutoGrade | unknown;
    aiFeedback?: unknown;
};

export type SentenceSeg = {
    text: string;
    startChar: number;
    endChar: number;
    startRatio: number;
    endRatio: number;
};
