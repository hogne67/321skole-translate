import type { FractionWorksheet } from "@/lib/math/fractions/types";
import type { AnswersMap, FractionAutoGrade } from "./types";

export function normalizeFractionText(value: unknown): string {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(",", ".")
        .replace(/\s+/g, "")
        .replace(/:/g, "/")
        .replace("÷", "/");
}

export function parseFractionNumber(value: unknown): number | null {
    const s = normalizeFractionText(value);
    if (!s) return null;

    if (/^-?\d+(\.\d+)?$/.test(s)) {
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
    }

    const fraction = s.match(/^(-?\d+)\/(-?\d+)$/);
    if (!fraction) return null;

    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);

    if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
    if (denominator === 0) return null;

    return numerator / denominator;
}

export function isCorrectFraction(studentAnswer: unknown, correctAnswer: unknown): boolean {
    const sText = normalizeFractionText(studentAnswer);
    const cText = normalizeFractionText(correctAnswer);

    if (!sText || !cText) return false;
    if (sText === cText) return true;

    const sNum = parseFractionNumber(sText);
    const cNum = parseFractionNumber(cText);

    if (sNum == null || cNum == null) return false;

    return Math.abs(sNum - cNum) < 0.000001;
}

export function gradeFractionWorksheet(
    worksheet: FractionWorksheet,
    answersMap: AnswersMap
): FractionAutoGrade {
    let correctAuto = 0;
    let wrongAuto = 0;
    let unansweredAuto = 0;

    const byTask: FractionAutoGrade["byTask"] = {};

    worksheet.tasks.forEach((task, idx) => {
        const taskId = String(task.id || `task-${idx}`);
        const studentAnswer = answersMap[taskId];

        const correctAnswer =
            task.answer ||
            task.expected?.answerText ||
            `${task.fraction.numerator}/${task.fraction.denominator}`;

        const hasAnswer = normalizeFractionText(studentAnswer).length > 0;

        if (!hasAnswer) {
            unansweredAuto += 1;
            byTask[taskId] = {
                type: "fraction",
                isCorrect: false,
                studentAnswer: null,
                correctAnswer,
            };
            return;
        }

        const isCorrect = isCorrectFraction(studentAnswer, correctAnswer);

        if (isCorrect) correctAuto += 1;
        else wrongAuto += 1;

        byTask[taskId] = {
            type: "fraction",
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