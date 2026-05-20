// components/generators/math/fractions/FractionWorksheetView.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import FractionDisplay from "@/components/generators/math/fractions/FractionDisplay";
import FractionInput from "@/components/generators/math/fractions/FractionInput";
import FractionShadeInput, {
    getSelectedFractionParts,
} from "@/components/generators/math/fractions/FractionShadeInput";
import FractionVisual from "@/components/generators/math/fractions/FractionVisual";
import type { FractionTask, FractionWorksheet } from "@/lib/math/fractions/types";

type TFn = (key: string) => string;

export type FractionAnswersByTaskId = Record<string, unknown>;

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

function isCompleteFractionAnswer(value: string) {
    const normalized = normalizeAnswerText(value);
    const fraction = normalized.match(/^(-?\d+)\/(-?\d+)$/);

    if (!fraction) return false;

    return Number(fraction[2]) !== 0;
}

function hasTaskAnswer(task: FractionTask, value: unknown) {
    if (task.type === "shade_fraction") {
        return getSelectedFractionParts(value, task.fraction.denominator).length > 0;
    }

    return isCompleteFractionAnswer(answerToString(value));
}

function isCorrectTaskAnswer(task: FractionTask, value: unknown, correctAnswer: string) {
    if (task.type === "shade_fraction") {
        return (
            getSelectedFractionParts(value, task.fraction.denominator).length ===
            task.fraction.numerator
        );
    }

    return isCorrectFractionAnswer(answerToString(value), correctAnswer);
}

function getTaskPromptLabel(task: FractionTask, language: string) {
    if (task.type === "shade_fraction") {
        if (language === "en") return "Shade";
        if (language === "pt") return "Pinta";
        return "Fargelegg";
    }

    if (task.type === "write_fraction") {
        if (language === "en") return "Write the fraction.";
        if (language === "pt") return "Escreve a fração.";
        return "Skriv riktig brøk.";
    }

    return task.prompt;
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
    variant = "worksheet",
    includeHints,
    printMode = false,
}: {
    worksheet: FractionWorksheet;
    t?: TFn;
    tBrand?: TFn;
    printRef?: React.RefObject<HTMLDivElement | null>;
    showIdentityFields?: boolean;
    answersByTaskId?: FractionAnswersByTaskId;
    onAnswerChange?: (taskId: string, value: unknown) => void;
    readOnly?: boolean;
    showAutoCheck?: boolean;
    variant?: "worksheet" | "embedded";
    includeHints?: boolean;
    printMode?: boolean;
}) {
    const [localAnswers, setLocalAnswers] = useState<FractionAnswersByTaskId>({});
    const shouldShowHints = includeHints ?? worksheet.showHints ?? true;

    useEffect(() => {
        setLocalAnswers({});
    }, [worksheet]);

    const answers = useMemo(() => {
        return {
            ...(answersByTaskId ?? {}),
            ...localAnswers,
        };
    }, [answersByTaskId, localAnswers]);

    function setAnswer(taskId: string, value: unknown) {
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
            const studentAnswer = answers[taskId];
            const correctAnswer = answerToString(task.answer);
            const hasAnswer = hasTaskAnswer(task, studentAnswer);

            return {
                taskId,
                hasAnswer,
                isCorrect: hasAnswer
                    ? isCorrectTaskAnswer(task, studentAnswer, correctAnswer)
                    : null,
            };
        });
    }, [worksheet.tasks, answers]);

    const correctCount = results.filter((result) => result.isCorrect === true).length;
    const answeredCount = results.filter((result) => result.hasAnswer).length;

    return (
        <div
            ref={printRef}
            className={`mx-auto bg-white text-slate-900 ${printMode
                ? "print-root max-w-[980px]"
                : variant === "embedded" ? "max-w-none" : "max-w-[980px]"
                }`}
        >
            <div
                className={printMode
                    ? "print-card"
                    : variant === "embedded"
                    ? "bg-white"
                    : "rounded-3xl border border-slate-200 bg-white shadow-sm"
                }
            >
                <div
                    className={printMode
                        ? "border-b border-slate-200 pb-5"
                        : variant === "embedded"
                        ? "border-b border-slate-200 pb-5"
                        : "border-b border-slate-200 px-6 py-5"
                    }
                >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className={`items-center gap-3 ${variant === "embedded" ? "hidden" : "flex"}`}>
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

                        <div className={variant === "embedded"
                            ? "hidden"
                            : "rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700"
                        }>
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

                <div className={printMode || variant === "embedded" ? "py-5" : "px-6 py-6"}>
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
                                    const studentAnswer = answers[taskId];
                                    const studentAnswerText = answerToString(studentAnswer);
                                    const correctAnswer = answerToString(task.answer);
                                    const hasAnswer = hasTaskAnswer(task, studentAnswer);
                                    const isCorrect = hasAnswer
                                        ? isCorrectTaskAnswer(task, studentAnswer, correctAnswer)
                                        : null;

                                    const feedback =
                                        showAutoCheck && hasAnswer ? (
                                            <div
                                                className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${isCorrect
                                                    ? "bg-emerald-50 text-emerald-800"
                                                    : "bg-red-50 text-red-800"
                                                    }`}
                                            >
                                                {isCorrect ? (
                                                    "Riktig"
                                                ) : (
                                                    <span className="inline-flex items-center gap-2">
                                                        <span>
                                                            {task.type === "shade_fraction"
                                                                ? `Ikke helt. Marker ${task.fraction.numerator} deler.`
                                                                : "Ikke helt. Riktig svar er"}
                                                        </span>
                                                        {task.type === "shade_fraction" ? null : (
                                                            <FractionDisplay value={correctAnswer} size="sm" />
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                        ) : null;

                                    return (
                                        <article
                                            key={taskId}
                                            className={`fraction-print-task fraction-print-task-${task.type} rounded-3xl border border-slate-200 bg-white p-4 shadow-sm`}
                                        >
                                            <div
                                                className={`fraction-print-task-layout grid items-center gap-4 ${task.type === "shade_fraction"
                                                    ? "lg:grid-cols-[minmax(190px,1fr)_auto_minmax(230px,0.9fr)]"
                                                    : task.type === "choose_fraction"
                                                        ? "lg:grid-cols-[minmax(160px,0.85fr)_minmax(170px,220px)_minmax(270px,1.2fr)]"
                                                        : "lg:grid-cols-[minmax(190px,1fr)_220px_minmax(160px,0.8fr)]"
                                                    }`}
                                            >
                                                <div className="fraction-print-prompt flex items-start gap-3">
                                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                                                        {idx + 1}
                                                    </div>
                                                    <h3 className="min-w-0 text-base font-semibold text-slate-900">
                                                        {getTaskPromptLabel(task, worksheet.language)}
                                                    </h3>
                                                </div>

                                                {task.type === "shade_fraction" ? (
                                                    <div className="fraction-print-target-fraction flex justify-center">
                                                        <FractionDisplay fraction={task.fraction} size="lg" />
                                                    </div>
                                                ) : (
                                                    <div className={`fraction-print-figure rounded-2xl bg-slate-50 ${task.type === "choose_fraction" ? "p-2" : "p-3"}`}>
                                                        <div className={`flex flex-col items-center justify-center ${task.type === "choose_fraction"
                                                            ? "min-h-[104px]"
                                                            : "min-h-[120px]"
                                                            }`}>
                                                            <FractionVisual
                                                                fraction={task.fraction}
                                                                shadedParts={task.shadedParts}
                                                                visual={task.visual}
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                {task.type === "shade_fraction" ? (
                                                    <div className="fraction-print-answer rounded-2xl border border-dashed border-slate-300 bg-white p-3">
                                                        {printMode ? (
                                                            <FractionVisual
                                                                fraction={task.fraction}
                                                                shadedParts={0}
                                                                visual="rectangle"
                                                            />
                                                        ) : (
                                                            <FractionShadeInput
                                                                numerator={task.fraction.numerator}
                                                                denominator={task.fraction.denominator}
                                                                value={studentAnswer}
                                                                disabled={readOnly}
                                                                onChange={(value) => setAnswer(taskId, value)}
                                                            />
                                                        )}
                                                        {feedback}
                                                    </div>
                                                ) : task.type === "choose_fraction" && task.options?.length ? (
                                                    <div className="fraction-print-options-wrap">
                                                        <div className="fraction-print-options grid gap-2 sm:grid-cols-3">
                                                            {task.options.map((option) => (
                                                                <button
                                                                    key={option}
                                                                    type="button"
                                                                    disabled={readOnly}
                                                                    onClick={() => setAnswer(taskId, option)}
                                                                    className={`rounded-2xl border px-3 py-2.5 text-center text-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${normalizeAnswerText(studentAnswerText) ===
                                                                        normalizeAnswerText(option)
                                                                        ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                                                                        : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
                                                                        }`}
                                                                >
                                                                    <FractionDisplay value={option} />
                                                                </button>
                                                            ))}
                                                        </div>
                                                        {feedback}
                                                    </div>
                                                ) : (
                                                    <div className="fraction-print-answer rounded-2xl border border-dashed border-slate-300 bg-white p-4">
                                                        <label className="sr-only">{getAnswerLabel(t)}</label>
                                                        {printMode ? (
                                                            <div className="inline-flex min-w-[112px] flex-col items-center">
                                                                <div className="h-9 w-[68px]" />
                                                                <div className="my-1.5 h-0.5 w-20 rounded-full bg-slate-900" />
                                                                <div className="h-9 w-[68px]" />
                                                            </div>
                                                        ) : (
                                                            <FractionInput
                                                                value={studentAnswerText}
                                                                disabled={readOnly}
                                                                onChange={(value) => setAnswer(taskId, value)}
                                                                label={getAnswerLabel(t)}
                                                            />
                                                        )}
                                                        {feedback}
                                                    </div>
                                                )}
                                            </div>

                                            {shouldShowHints && task.hint ? (
                                                <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-slate-800">
                                                    <span className="font-semibold">Hint:</span> {task.hint}
                                                </div>
                                            ) : null}
                                        </article>
                                    );
                                })}
                            </div>

                            {worksheet.showAnswerKey ? (
                                <section className="mt-10 border-t-2 border-slate-300 pt-8">
                                    <div className="print-page-break" />
                                    <div className="mb-6">
                                        <h3 className="text-2xl font-bold text-slate-900">Fasit</h3>
                                    </div>

                                    <div className="grid gap-4">
                                        {worksheet.tasks.map((task, idx) => {
                                            const correctAnswer = answerToString(task.answer);

                                            return (
                                                <article
                                                    key={`answer-key-${task.id || idx}`}
                                                    className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5"
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-sm font-semibold text-white">
                                                            {idx + 1}
                                                        </div>

                                                        <div className="min-w-0">
                                                            <h4 className="text-base font-semibold text-emerald-950">
                                                                Oppgave {idx + 1}
                                                            </h4>
                                                            <p className="mt-1 text-sm text-slate-700">{task.prompt}</p>
                                                            <div className="mt-4 inline-flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-950">
                                                                <span className="font-semibold">Svar:</span>
                                                                <FractionDisplay value={correctAnswer} size="md" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </article>
                                            );
                                        })}
                                    </div>
                                </section>
                            ) : null}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
