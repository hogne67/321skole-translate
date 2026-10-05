import { safeTasksArray } from "./helpers";
import { sanitizeLengthWorksheet } from "@/lib/math/length/worksheet";
import { sanitizePercentageWorksheet } from "@/lib/math/percentage/worksheet";
import { sanitizeEquationWorksheet } from "@/lib/math/equations/worksheet";
import { sanitizeComparisonWorksheet } from "@/lib/math/comparison/worksheet";

import {
    isArithmeticWorksheet,
    isFractionWorksheet,
    isMathWorksheet,
} from "./worksheetTypeGuards";

import type {
    AssignmentDoc,
    Lesson,
} from "./types";

import type { FractionWorksheet } from "@/lib/math/fractions/types";
import type { ArithmeticWorksheet } from "@/lib/math/arithmetic/types";

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

    const arithmeticWorksheet = (() => {
        if (isArithmeticWorksheet(lesson?.arithmeticWorksheet)) {
            return lesson.arithmeticWorksheet;
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
            (mathType === "arithmetic" ||
                contentType === "arithmetic_worksheet") &&
            isArithmeticWorksheet(lesson?.mathWorksheet)
        ) {
            return lesson.mathWorksheet as ArithmeticWorksheet;
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

    const isArithmeticAssignment = (() => {
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
            mathType === "arithmetic" ||
            contentType === "arithmetic_worksheet" ||
            assignmentMathType === "arithmetic" ||
            assignmentContentType === "arithmetic_worksheet" ||
            !!arithmeticWorksheet
        );
    })();

    const lengthWorksheet = sanitizeLengthWorksheet(lesson?.measurementWorksheet) ?? sanitizeLengthWorksheet(lesson?.lengthWorksheet) ?? sanitizeLengthWorksheet(lesson?.mathWorksheet);
    const equationWorksheet = sanitizeEquationWorksheet(lesson?.mathWorksheet);
    const percentageWorksheet = sanitizePercentageWorksheet(lesson?.mathWorksheet);
    const isEquationAssignment = !!equationWorksheet || [lesson?.contentType, assignment?.contentType].includes("equations_worksheet");
    const isPercentageAssignment = !!percentageWorksheet || [lesson?.contentType, assignment?.contentType].includes("percentage_worksheet");
    const comparisonWorksheet = sanitizeComparisonWorksheet(lesson?.mathWorksheet);
    const isComparisonAssignment = !!comparisonWorksheet || [lesson?.contentType, assignment?.contentType].includes("comparison_worksheet");
    const isLengthAssignment = !!lengthWorksheet || [lesson?.contentType, assignment?.contentType].some(type => type === "length_worksheet" || type === "measurement_worksheet");
    return {
        equationWorksheet,
        percentageWorksheet,
        isEquationAssignment,
        isPercentageAssignment,
        comparisonWorksheet,
        isComparisonAssignment,
        lengthWorksheet,
        isLengthAssignment,
        tasksOriginal,
        isReadingTest,
        geometryWorksheet,
        fractionWorksheet,
        arithmeticWorksheet,
        isGeometryAssignment,
        isFractionAssignment,
        isArithmeticAssignment,
    };
}
