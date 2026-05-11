import type { AnswersMap, AutoGrade, AutoGradeEntry, SubmissionDoc, Task } from "./types";
import { getStableTaskId } from "./helpers";

export function normalizeBool(v: unknown): boolean | null {
    if (typeof v === "boolean") return v;

    if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        if (s === "true") return true;
        if (s === "false") return false;
    }

    return null;
}

export function normalizeMcq(v: unknown): string | null {
    if (v == null) return null;

    const s = String(v).trim();
    return s ? s : null;
}

export function computeAutoGrade(tasks: Task[], answersMap: AnswersMap): AutoGrade {
    let totalAuto = 0;
    let correctAuto = 0;
    let wrongAuto = 0;
    let unansweredAuto = 0;

    const byTask: Record<string, AutoGradeEntry> = {};

    const u2n = (v: unknown) => (v === undefined ? null : v);

    tasks.forEach((t, idx) => {
        const stableId = getStableTaskId(t, idx);
        const type = String(t?.type ?? "open").toLowerCase();

        const isAutoGradedType =
            type === "mcq" ||
            type === "truefalse" ||
            type === "true_false" ||
            type === "word_choice" ||
            type === "sentence_placement" ||
            type === "best_summary" ||
            type === "fill_in_word";

        if (!isAutoGradedType) return;

        totalAuto += 1;

        const student = answersMap[stableId];
        const correct = t?.correctAnswer;

        if (
            type === "mcq" ||
            type === "word_choice" ||
            type === "sentence_placement" ||
            type === "best_summary" ||
            type === "fill_in_word"
        ) {
            const studentRaw = answersMap[stableId];

            let s: string | null = null;
            if (typeof studentRaw === "number" && Array.isArray(t?.options)) {
                const opt = (t.options as unknown[])[studentRaw];
                s = normalizeMcq(opt);
            } else {
                s = normalizeMcq(studentRaw);
            }

            const correctRaw = t?.correctAnswer;

            let c: string | null = null;
            if (typeof correctRaw === "number" && Array.isArray(t?.options)) {
                const opt = (t.options as unknown[])[correctRaw];
                c = normalizeMcq(opt);
            } else {
                c = normalizeMcq(correctRaw);
            }

            if (s == null) {
                unansweredAuto += 1;
                byTask[stableId] = {
                    type: "mcq",
                    isCorrect: false,
                    studentAnswer: u2n(studentRaw),
                    correctAnswer: u2n(correctRaw),
                };
                return;
            }

            const isCorrect = c != null && s === c;

            if (isCorrect) correctAuto += 1;
            else wrongAuto += 1;

            byTask[stableId] = {
                type: "mcq",
                isCorrect,
                studentAnswer: u2n(studentRaw),
                correctAnswer: u2n(correctRaw),
            };

            return;
        }

        const sB = normalizeBool(student);
        const cB = normalizeBool(correct);

        if (sB == null) {
            unansweredAuto += 1;
            byTask[stableId] = {
                type: "truefalse",
                isCorrect: false,
                studentAnswer: u2n(student),
                correctAnswer: u2n(correct),
            };
            return;
        }

        const isCorrect = cB != null && sB === cB;

        if (isCorrect) correctAuto += 1;
        else wrongAuto += 1;

        byTask[stableId] = {
            type: "truefalse",
            isCorrect,
            studentAnswer: u2n(student),
            correctAnswer: u2n(correct),
        };
    });

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

export function readAutoGrade(sd: SubmissionDoc | null): AutoGrade | null {
    const a = sd?.auto;
    if (!a || typeof a !== "object") return null;

    const r = a as Partial<AutoGrade>;

    const totalAuto = typeof r.totalAuto === "number" ? r.totalAuto : 0;
    const correctAuto = typeof r.correctAuto === "number" ? r.correctAuto : 0;
    const wrongAuto = typeof r.wrongAuto === "number" ? r.wrongAuto : 0;
    const unansweredAuto = typeof r.unansweredAuto === "number" ? r.unansweredAuto : 0;
    const percentAuto = typeof r.percentAuto === "number" ? r.percentAuto : null;

    const byTask =
        r.byTask && typeof r.byTask === "object" && !Array.isArray(r.byTask)
            ? (r.byTask as Record<string, AutoGradeEntry>)
            : {};

    if (totalAuto === 0 && Object.keys(byTask).length === 0) return null;

    return {
        totalAuto,
        correctAuto,
        wrongAuto,
        unansweredAuto,
        percentAuto,
        byTask,
    };
}