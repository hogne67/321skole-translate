import type { Firestore } from "firebase/firestore";
import type { MathWorksheet } from "@/lib/math/geometry/types";
import type { GeometryAutoResult } from "@/lib/math/geometry/submissionTypes";
import type { FractionWorksheet } from "@/lib/math/fractions/types";
import type {
    AnswersMap,
    AssignmentDoc,
    AutoGrade,
    AutoGradeEntry,
    Lesson,
    SubmissionDoc,
    Task,
} from "./types";
import { safeBoolean, safeNumber, safeTasksArray } from "./helpers";

export function isMathWorksheet(value: unknown): value is MathWorksheet {
    if (!value || typeof value !== "object") return false;
    const v = value as {
        tasks?: unknown;
        title?: unknown;
        selectedShapes?: unknown;
        showFormulas?: unknown;
    };

    return (
        Array.isArray(v.tasks) &&
        typeof v.title === "string" &&
        (Array.isArray(v.selectedShapes) || typeof v.showFormulas === "boolean")
    );
}

export function isFractionWorksheet(value: unknown): value is FractionWorksheet {
    if (!value || typeof value !== "object") return false;
    const v = value as { tasks?: unknown; title?: unknown; selectedShapes?: unknown };

    return (
        Array.isArray(v.tasks) &&
        typeof v.title === "string" &&
        !Array.isArray(v.selectedShapes)
    );
}

export function hasAssignmentSnapshotContent(a: AssignmentDoc | null): boolean {
    if (!a) return false;

    const hasText = String(a.sourceText ?? a.text ?? "").trim().length > 0;
    const hasTasks = safeTasksArray(a.tasks).length > 0;
    const hasImage = String(a.coverImageUrl ?? "").trim().length > 0;
    const hasMathWorksheet = isMathWorksheet(a.mathWorksheet);
    const hasFractionWorksheet =
        isFractionWorksheet(a.fractionWorksheet) ||
        (
            (a.mathType === "fractions" || a.contentType === "fraction_worksheet") &&
            isFractionWorksheet(a.mathWorksheet)
        );

    return hasText || hasTasks || hasImage || hasMathWorksheet || hasFractionWorksheet;
}

export function assignmentSnapshotToLesson(a: AssignmentDoc): Lesson {
    return {
        title: a.title,
        level: a.level,
        topic: a.topic,
        language: a.language,
        sourceText: a.sourceText,
        text: a.text,
        tasks: a.tasks,
        coverImageUrl: a.coverImageUrl,
        status: a.status,
        lessonType: a.lessonType,
        taskType: a.taskType,
        readingTestConfig: a.readingTestConfig ?? null,

        mathWorksheet: a.mathWorksheet ?? null,
        fractionWorksheet: a.fractionWorksheet ?? null,

        mathType: a.mathType,
        contentType: a.contentType,
    };
}

export function readAuth(sub: SubmissionDoc): {
    isAnon: boolean;
    uid: string | null;
} {
    const a = sub.auth;

    if (!a || typeof a !== "object") {
        return { isAnon: false, uid: null };
    }

    const isAnon = (a as { isAnon?: unknown }).isAnon === true;
    const uidRaw = (a as { uid?: unknown }).uid;

    return {
        isAnon,
        uid: typeof uidRaw === "string" ? uidRaw : null,
    };
}

export function requireDb(x: Firestore | null | undefined): Firestore {
    if (!x) throw new Error("Firestore is not initialized (db is null).");
    return x;
}

export function readAnswerMap(a: unknown): AnswersMap {
    if (a && typeof a === "object" && !Array.isArray(a)) {
        return a as AnswersMap;
    }

    return {};
}

export function readAutoGrade(sub: SubmissionDoc | null): AutoGrade | null {
    const a = sub?.auto;

    if (!a || typeof a !== "object") return null;

    const r = a as Partial<AutoGrade>;

    const totalAuto = typeof r.totalAuto === "number" ? r.totalAuto : 0;
    const correctAuto = typeof r.correctAuto === "number" ? r.correctAuto : 0;
    const wrongAuto = typeof r.wrongAuto === "number" ? r.wrongAuto : 0;
    const unansweredAuto =
        typeof r.unansweredAuto === "number" ? r.unansweredAuto : 0;

    const percentAuto =
        typeof r.percentAuto === "number" ? r.percentAuto : null;

    const byTask =
        r.byTask && typeof r.byTask === "object" && !Array.isArray(r.byTask)
            ? (r.byTask as Record<string, AutoGradeEntry>)
            : {};

    if (totalAuto === 0 && Object.keys(byTask).length === 0) {
        return null;
    }

    return {
        totalAuto,
        correctAuto,
        wrongAuto,
        unansweredAuto,
        percentAuto,
        byTask,
    };
}

export function readGeometryAuto(
    sub: SubmissionDoc | null
): GeometryAutoResult | null {
    const auto = sub?.auto;

    if (!auto || typeof auto !== "object" || Array.isArray(auto)) {
        return null;
    }

    const candidate = auto as Partial<GeometryAutoResult>;

    const hasTaskMap =
        candidate.byTaskId &&
        typeof candidate.byTaskId === "object" &&
        !Array.isArray(candidate.byTaskId);

    const hasCounts =
        typeof candidate.total === "number" ||
        typeof candidate.correct === "number" ||
        typeof candidate.wrong === "number" ||
        typeof candidate.unanswered === "number" ||
        typeof candidate.percent === "number";

    if (!hasTaskMap && !hasCounts) return null;

    return auto as GeometryAutoResult;
}

export function isReadingTestLesson(
    assignment: AssignmentDoc | null,
    lesson: Lesson | null,
    tasks: Task[]
): boolean {
    const lessonType = String(
        lesson?.lessonType ?? assignment?.lessonType ?? ""
    )
        .trim()
        .toLowerCase();

    if (lessonType === "reading_test") return true;

    return tasks.some((task) => {
        const type = String(task?.type ?? "").trim().toLowerCase();

        return (
            type === "word_choice" ||
            type === "sentence_placement" ||
            type === "best_summary" ||
            type === "fill_in_word"
        );
    });
}

export function readReadingTestMeta(sub: SubmissionDoc | null) {
    const timerResult =
        sub?.readingTimerResult &&
            typeof sub.readingTimerResult === "object" &&
            !Array.isArray(sub.readingTimerResult)
            ? (sub.readingTimerResult as Record<string, unknown>)
            : null;

    const limitSeconds =
        safeNumber(sub?.readingTestTimeLimitSeconds) ??
        safeNumber(timerResult?.timeLimitSeconds);

    const usedSeconds =
        safeNumber(sub?.readingTestTimeUsedSeconds) ??
        safeNumber(sub?.readingTestTimeSpentSeconds) ??
        safeNumber(timerResult?.timeSpentSeconds) ??
        safeNumber(sub?.timeSpentSeconds);

    const secondsLeftAtSubmit =
        safeNumber(sub?.readingTestSecondsLeftAtSubmit) ??
        safeNumber(timerResult?.secondsLeftAtSubmit);

    const timedOut =
        safeBoolean(sub?.readingTestTimedOut) ??
        safeBoolean(timerResult?.timedOut);
    const submittedManually =
        safeBoolean(sub?.readingTestSubmittedManually) ??
        safeBoolean(timerResult?.submittedManually);

    return {
        limitSeconds,
        usedSeconds,
        secondsLeftAtSubmit,
        timedOut,
        submittedManually,
    };
}
