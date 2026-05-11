// components/generators/math/fractions/FractionWorksheetView.tsx
"use client";

import { useMemo, useState } from "react";
import FractionVisual from "@/components/generators/math/fractions/FractionVisual";
import type { FractionWorksheet } from "@/lib/math/fractions/types";

type TFn = (key: string) => string;

export type FractionAnswersByTaskId = Record<string, string>;

function getAnswerLabel(t?: TFn) {
    if (!t) return "Svar";
    const value = t("answer");
    return value === "answer" || value === "mathFractions.answer" ? "Svar" : value;
}

function getWorksheetLabel(t?: TFn) {
    if (!t) return "Arbeidsark";
    const value = t("worksheet");
    return value === "worksheet" || value === "mathFractions.worksheet"
        ? "Arbeidsark"
        : value;
}

function answerToString(value: unknown): string {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
}

function normalizeAnswerText(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(",", ".")
        .replace(/\s+/g, "")
        .replace(/:/g, "/")
        .replace("÷", "/");
}

function gcd(a: number, b: number): number {
    let x = Math.abs(a);
    let y = Math.abs(b);

    while (y !== 0) {
        const temp = y;
        y = x % y;
        x = temp;
    }

    return x || 1;
}

function parseFractionValue(value: string): number | null {
    const normalized = normalizeAnswerText(value);

    if (!normalized) return null;

    // Desimaltall: 0.5
    if (/^-?\d+(\.\d+)?$/.test(normalized)) {
        const numberValue = Number(normalized);
        return Number.isFinite(numberValue) ? numberValue : null;
    }

    // Blandet tall: 1 2/3, 1+2/3 eller 1og2/3
    const mixed = normalized.match(/^(-?\d+)(?:\+|og)?(\d+)\/(\d+)$/);
    if (mixed) {
        const whole = Number(mixed[1]);
        const numerator = Number(mixed[2]);
        const denominator = Number(mixed[3]);

        if (denominator === 0) return null;

        const sign = whole < 0 ? -1 : 1;
        return whole + sign * (numerator / denominator);
    }

    // Vanlig brøk: 2/3
    const fraction = normalized.match(/^(-?\d+)\/(-?\d+)$/);
    if (fraction) {
        const numerator = Number(fraction[1]);
        const denominator = Number(fraction[2]);

        if (denominator === 0) return null;

        return numerator / denominator;
    }

    return null;
}

function reduceFractionText(value: string): string | null {
    const normalized = normalizeAnswerText(value);
    const fraction = normalized.match(/^(-?\d+)\/(-?\d+)$/);

    if (!fraction) return null;

    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);

    if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
    if (denominator === 0) return null;

    const divisor = gcd(numerator, denominator);
    const n = numerator / divisor;
    const d = denominator / divisor;

    return `${n}/${d}`;
}

function isCorrectFractionAnswer(studentAnswer: string, correctAnswer: string) {
    const student = normalizeAnswerText(studentAnswer);
    const correct = normalizeAnswerText(correctAnswer);

    if (student === correct) return true;

    const reducedStudent = reduceFractionText(student);
    const reducedCorrect = reduceFractionText(correct);

    if (reducedStudent && reducedCorrect && reducedStudent === reducedCorrect) {
        return true;
    }

    const studentValue = parseFractionValue(student);
    const correctValue = parseFractionValue(correct);

    if (studentValue === null || correctValue === null) return false;

    return Math.abs(studentValue - correctValue) < 0.000001;
}

export default function FractionWorksheetView({
    worksheet,
    t,
    tBrand,
    printRef,
    showIdentityFields = true,
    answersByTaskId,
    onAnswerChange,
    readOnly = false,
    showAutoCheck = true,
}: {
    worksheet: FractionWorksheet;
    t?: TFn;
    tBrand?: TFn;
    printRef?: React.RefObject<HTMLDivElement | null>;
    showIdentityFields?: boolean;
    answersByTaskId?: FractionAnswersByTaskId;
    onAnswerChange?: (taskId: string, value: string) => void;
    readOnly?: boolean;
    showAutoCheck?: boolean;
}) {
    const [localAnswers, setLocalAnswers] = useState<FractionAnswersByTaskId>({});

    const answers = useMemo(() => {
        return {
            ...(answersByTaskId ?? {}),
            ...localAnswers,
        };
    }, [answersByTaskId, localAnswers]);

    function setAnswer(taskId: string, value: string) {
        if (readOnly) return;

        setLocalAnswers((prev) => ({
            ...prev,
            [taskId]: value,
        }));

        onAnswerChange?.(taskId, value);
    }

    const results = useMemo(() => {
        return worksheet.tasks.map((task, idx) => {
            const taskId = task.id || `task-${idx}`;
            const studentAnswer = answerToString(answers[taskId]);
            const correctAnswer = answerToString(task.answer);
            const hasAnswer = studentAnswer.trim().length > 0;

            return {
                taskId,
                hasAnswer,
                isCorrect: hasAnswer
                    ? isCorrectFractionAnswer(studentAnswer, correctAnswer)
                    : null,
            };
        });
    }, [worksheet.tasks, answers]);

    const correctCount = results.filter((result) => result.isCorrect === true).length;
    const answeredCount = results.filter((result) => result.hasAnswer).length;

    return (
        <div ref={printRef} className="mx-auto max-w-[980px] bg-white text-slate-900">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-6 py-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-center gap-3">
                            <img
                                src="/logo321ny.png"
                                alt="321 school"
                                className="h-12 w-auto object-contain"
                            />

                            <div>
                                <div className="text-lg font-extrabold text-slate-900">
                                    321 {tBrand ? tBrand("school") : "school"}
                                </div>
                                <div className="text-xs font-semibold text-slate-500">
                                    321school.com
                                </div>
                            </div>
                        </div>

                        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700">
                            {getWorksheetLabel(t)}
                        </div>
                    </div>

                    <div className="mt-5">
                        <h2 className="text-2xl font-bold text-slate-900">{worksheet.title}</h2>
                        <p className="mt-2 text-sm text-slate-600">{worksheet.instructions}</p>
                    </div>

                    {showIdentityFields ? (
                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                <span className="font-medium">Navn:</span>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                <span className="font-medium">Dato:</span>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 sm:col-span-2">
                                <span className="font-medium">Klasse:</span>
                            </div>
                        </div>
                    ) : null}
                </div>

                <div className="px-6 py-6">
                    {worksheet.tasks.length === 0 ? (
                        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
                            Lag et brøkark for å se forhåndsvisning.
                        </div>
                    ) : (
                        <>
                            {showAutoCheck ? (
                                <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                    Besvart: {answeredCount} / {worksheet.tasks.length} · Riktig:{" "}
                                    {correctCount} / {worksheet.tasks.length}
                                </div>
                            ) : null}

                            <div className="grid gap-5">
                                {worksheet.tasks.map((task, idx) => {
                                    const taskId = task.id || `task-${idx}`;
                                    const studentAnswer = answerToString(answers[taskId]);
                                    const correctAnswer = answerToString(task.answer);
                                    const hasAnswer = studentAnswer.trim().length > 0;
                                    const isCorrect = hasAnswer
                                        ? isCorrectFractionAnswer(studentAnswer, correctAnswer)
                                        : null;

                                    return (
                                        <article
                                            key={taskId}
                                            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                                        >
                                            <div className="mb-5 flex items-start gap-3">
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                                                    {idx + 1}
                                                </div>

                                                <div className="min-w-0">
                                                    <h3 className="text-base font-semibold text-slate-900">
                                                        {task.prompt}
                                                    </h3>
                                                </div>
                                            </div>

                                            <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
                                                <div className="rounded-2xl bg-slate-50 p-5">
                                                    <div className="flex min-h-[160px] flex-col items-center justify-center gap-4">
                                                        <FractionVisual
                                                            fraction={task.fraction}
                                                            shadedParts={task.shadedParts}
                                                            visual={task.visual}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="space-y-4">
                                                    {task.type === "choose_fraction" && task.options?.length ? (
                                                        <div className="grid gap-3 sm:grid-cols-3">
                                                            {task.options.map((option) => (
                                                                <button
                                                                    key={option}
                                                                    type="button"
                                                                    disabled={readOnly}
                                                                    onClick={() => setAnswer(taskId, option)}
                                                                    className={`rounded-2xl border px-4 py-3 text-center text-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${normalizeAnswerText(studentAnswer) ===
                                                                        normalizeAnswerText(option)
                                                                        ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                                                                        : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
                                                                        }`}
                                                                >
                                                                    {option}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : null}

                                                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
                                                        <label className="mb-3 block text-sm font-medium text-slate-600">
                                                            {getAnswerLabel(t)}:
                                                        </label>

                                                        <input
                                                            type="text"
                                                            inputMode="text"
                                                            value={studentAnswer}
                                                            disabled={readOnly}
                                                            onChange={(e) => setAnswer(taskId, e.target.value)}
                                                            placeholder="Skriv brøken, f.eks. 3/5"
                                                            className="w-full max-w-xs rounded-xl border border-slate-300 bg-white px-3 py-2 text-lg outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                                                        />

                                                        {showAutoCheck && hasAnswer ? (
                                                            <div
                                                                className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${isCorrect
                                                                    ? "bg-emerald-50 text-emerald-800"
                                                                    : "bg-red-50 text-red-800"
                                                                    }`}
                                                            >
                                                                {isCorrect
                                                                    ? "Riktig"
                                                                    : `Ikke helt. Riktig svar er ${correctAnswer}`}
                                                            </div>
                                                        ) : null}
                                                    </div>

                                                    {task.hint ? (
                                                        <div className="rounded-2xl bg-amber-50 p-4 text-sm text-slate-800">
                                                            <span className="font-semibold">Hint:</span> {task.hint}
                                                        </div>
                                                    ) : null}

                                                    {worksheet.showAnswerKey ? (
                                                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                                                            <span className="font-semibold">Fasit:</span>{" "}
                                                            {correctAnswer}
                                                        </div>
                                                    ) : null}

                                                    {task.explanation ? (
                                                        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                                                            <span className="font-semibold">Forklaring:</span>{" "}
                                                            {task.explanation}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}