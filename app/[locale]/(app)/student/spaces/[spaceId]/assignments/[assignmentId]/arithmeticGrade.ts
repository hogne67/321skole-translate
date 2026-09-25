import type { ArithmeticWorksheet } from "@/lib/math/arithmetic/types";
import type { AnswersMap, AutoGrade } from "./types";

function normalizeArithmeticAnswer(value: unknown): string {
    return String(value ?? "")
        .trim()
        .replace(",", ".")
        .replace(/\s+/g, "");
}

function parseNumber(value: unknown): number | null {
    const normalized = normalizeArithmeticAnswer(value);
    if (!normalized) return null;

    const numberValue = Number(normalized);
    return Number.isFinite(numberValue) ? numberValue : null;
}

export function gradeArithmeticWorksheet(
    worksheet: ArithmeticWorksheet,
    answersMap: AnswersMap
): AutoGrade {
    let correctAuto = 0;
    let wrongAuto = 0;
    let unansweredAuto = 0;

    const byTask: AutoGrade["byTask"] = {};

    worksheet.tasks.forEach((task, index) => {
        const id = String(task.id || `task-${index + 1}`);
        const studentAnswer = answersMap[id];
        const parsed = parseNumber(studentAnswer);
        const correctAnswer = task.answer;

        if (parsed == null) {
            unansweredAuto += 1;
            byTask[id] = {
                type: "arithmetic",
                isCorrect: false,
                studentAnswer: null,
                correctAnswer,
            };
            return;
        }

        const isCorrect = Math.abs(parsed - correctAnswer) < 0.000001;

        if (isCorrect) correctAuto += 1;
        else wrongAuto += 1;

        byTask[id] = {
            type: "arithmetic",
            isCorrect,
            studentAnswer,
            correctAnswer,
        };
    });

    const totalAuto = worksheet.tasks.length;
    const percentAuto = totalAuto > 0 ? Math.round((correctAuto / totalAuto) * 100) : null;

    return {
        totalAuto,
        correctAuto,
        wrongAuto,
        unansweredAuto,
        percentAuto,
        byTask,
    };
}
