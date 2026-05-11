import { safeTasksArray } from "./helpers";

import { isFractionWorksheet, isMathWorksheet } from "./worksheetTypeGuards";

import type {
    AssignmentDoc,
    Lesson,
} from "./types";

import type { FractionWorksheet } from "@/lib/math/fractions/types";

export function getAssignmentDerivedState(
    lesson: Lesson | null,
    assignment: AssignmentDoc | null
) {
    const tasksOriginal = safeTasksArray(lesson?.tasks)
        .slice()
        .sort((a, b) => (a?.order ?? 999) - (b?.order ?? 999));

    const isReadingTest =
        String(lesson?.lessonType ?? "").trim().toLowerCase() ===
        "reading_test" ||
        tasksOriginal.some((task) => {
            const type = String(task?.type ?? "")
                .trim()
                .toLowerCase();

            return (
                type === "word_choice" ||
                type === "sentence_placement" ||
                type === "best_summary"
            );
        });

    const geometryWorksheet = isMathWorksheet(
        lesson?.mathWorksheet
    )
        ? lesson.mathWorksheet
        : null;

    const fractionWorksheet = (() => {
        if (isFractionWorksheet(lesson?.fractionWorksheet)) {
            return lesson.fractionWorksheet;
        }

        const mathType = String(
            lesson?.mathType ?? ""
        )
            .trim()
            .toLowerCase();

        const contentType = String(
            lesson?.contentType ?? ""
        )
            .trim()
            .toLowerCase();

        if (
            (mathType === "fractions" ||
                contentType === "fraction_worksheet") &&
            isFractionWorksheet(lesson?.mathWorksheet)
        ) {
            return lesson.mathWorksheet as FractionWorksheet;
        }

        return null;
    })();

    const isGeometryAssignment = (() => {
        const lessonType = String(
            lesson?.lessonType ?? ""
        )
            .trim()
            .toLowerCase();

        const taskType = String(
            lesson?.taskType ?? ""
        )
            .trim()
            .toLowerCase();

        const assignmentLessonType = String(
            assignment?.lessonType ?? ""
        )
            .trim()
            .toLowerCase();

        const assignmentTaskType = String(
            assignment?.taskType ?? ""
        )
            .trim()
            .toLowerCase();

        return (
            lessonType === "math_geometry" ||
            taskType === "math_geometry" ||
            assignmentLessonType === "math_geometry" ||
            assignmentTaskType === "math_geometry" ||
            !!geometryWorksheet
        );
    })();

    const isFractionAssignment = (() => {
        const mathType = String(
            lesson?.mathType ?? ""
        )
            .trim()
            .toLowerCase();

        const contentType = String(
            lesson?.contentType ?? ""
        )
            .trim()
            .toLowerCase();

        const assignmentMathType = String(
            assignment?.mathType ?? ""
        )
            .trim()
            .toLowerCase();

        const assignmentContentType = String(
            assignment?.contentType ?? ""
        )
            .trim()
            .toLowerCase();

        return (
            mathType === "fractions" ||
            contentType === "fraction_worksheet" ||
            assignmentMathType === "fractions" ||
            assignmentContentType === "fraction_worksheet" ||
            !!fractionWorksheet
        );
    })();

    return {
        tasksOriginal,
        isReadingTest,
        geometryWorksheet,
        fractionWorksheet,
        isGeometryAssignment,
        isFractionAssignment,
    };
}