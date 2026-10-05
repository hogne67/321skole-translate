// components/generators/math/fractions/FractionWorksheetView.tsx
"use client";

import MathText from "@/components/generators/math/MathTextSupport";

import { useEffect, useMemo, useState } from "react";
import { getFractionCopy } from "@/lib/math/fractions/uiCopy";
import "./fractionWorksheet.css";
import FractionDisplay from "@/components/generators/math/fractions/FractionDisplay";
import FractionInput from "@/components/generators/math/fractions/FractionInput";
import FractionShadeInput, {
    getSelectedFractionParts,
} from "@/components/generators/math/fractions/FractionShadeInput";
import FractionVisual from "@/components/generators/math/fractions/FractionVisual";
import FractionCalculationView from "./FractionCalculationView";
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
    showAnswerKey,
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
    variant?: "worksheet" | "embedded" | "generator";
    includeHints?: boolean;
    printMode?: boolean;
    showAnswerKey?: boolean;
}) {
    const [localAnswers, setLocalAnswers] = useState<FractionAnswersByTaskId>({});
    const shouldShowHints = includeHints ?? worksheet.showHints ?? true;
    const shouldShowAnswerKey = showAnswerKey ?? (variant !== "embedded" && worksheet.showAnswerKey);

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

    const copy = getFractionCopy(worksheet.language);
    const answerLabel = t ? getAnswerLabel(t) : copy.answer;
    const school = tBrand ? tBrand("school") : copy.school;
    const documentView = printMode || variant === "generator";

    if (worksheet.topic === "calculation") return <FractionCalculationView
        worksheet={worksheet} answers={answers} onAnswerChange={setAnswer} readOnly={readOnly}
        showAutoCheck={showAutoCheck} printMode={printMode} showIdentityFields={showIdentityFields}
        showAnswerKey={!!shouldShowAnswerKey} printRef={printRef} embedded={variant === "embedded"}
    />;

    return (
        <div ref={printRef} className={`fraction-worksheet mx-auto bg-white text-slate-900 ${printMode ? "print-root" : ""} ${variant === "embedded" ? "max-w-none" : "max-w-[980px]"}`}>
            <div className={documentView || variant === "embedded" ? "bg-white" : "rounded-lg border border-slate-200 bg-white"}>
                <header className={`fraction-worksheet-header ${documentView || variant === "embedded" ? "pb-5" : "px-6 pt-5"}`}>
                    {variant !== "embedded" ? (
                        <div className="fraction-worksheet-brand mb-5 flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                                <img src="/logo321ny.png" alt={`321 ${school}`} className="h-12 w-auto shrink-0 object-contain" />
                                <div>
                                    <div className="text-lg font-extrabold">321 {school}</div>
                                    <div className="text-xs font-semibold text-slate-500">321school.com</div>
                                </div>
                            </div>
                            <span className="shrink-0 rounded-lg bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">{t ? getWorksheetLabel(t) : copy.worksheet}</span>
                        </div>
                    ) : null}
                    <h2 className="break-words text-2xl font-bold">{worksheet.title}</h2>
                    <p className="mt-2 text-sm text-slate-600"><MathText text={worksheet.instructions} /></p>
                    {showIdentityFields ? (
                        <div className="fraction-worksheet-identity mt-5 grid grid-cols-2 gap-2">
                            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{copy.name}:</div>
                            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{copy.date}:</div>
                            <div className="col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{copy.classLabel}:</div>
                        </div>
                    ) : null}
                </header>

                <div className={`fraction-worksheet-content ${documentView || variant === "embedded" ? "py-5" : "px-6 py-6"}`}>
                    {worksheet.tasks.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">{copy.emptyTitle}</div>
                    ) : (
                        <>
                            {showAutoCheck && !printMode ? <div className="mb-5 border-b border-slate-200 pb-4 text-sm text-slate-600">
                                {copy.answered}: {answeredCount} / {worksheet.tasks.length} · {copy.correct}: {correctCount} / {worksheet.tasks.length}
                            </div> : null}
                            <div className="fraction-task-list grid gap-6">
                                {worksheet.tasks.map((task, idx) => {
                                    const taskId = task.id || `task-${idx}`;
                                    const studentAnswer = answers[taskId];
                                    const studentAnswerText = answerToString(studentAnswer);
                                    const correctAnswer = answerToString(task.answer);
                                    const hasAnswer = hasTaskAnswer(task, studentAnswer);
                                    const isCorrect = hasAnswer ? isCorrectTaskAnswer(task, studentAnswer, correctAnswer) : null;
                                    const feedback = showAutoCheck && hasAnswer && !printMode ? (
                                        <div className={`mt-3 text-sm font-semibold ${isCorrect ? "text-emerald-700" : "text-red-700"}`}>
                                            {isCorrect ? copy.correct : task.type === "shade_fraction" ? copy.tryAgain : (
                                                <span className="inline-flex flex-wrap items-center gap-2">
                                                    <span>{copy.correctAnswer}</span>
                                                    <FractionDisplay value={correctAnswer} size="sm" />
                                                </span>
                                            )}
                                        </div>
                                    ) : null;
                                    return (
                                        <article key={taskId} className={`fraction-print-task fraction-print-task-${task.type} border-b border-slate-200 pb-6`}>
                                            <div className="fraction-print-prompt mb-4 flex items-start gap-3">
                                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{idx + 1}</div>
                                                <h3 className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold leading-6">
                                                    {task.type === "shade_fraction" ? <>
                                                        <MathText text={copy.shadePrompt} />
                                                        <FractionDisplay fraction={task.fraction} size="md" />
                                                    </> : <MathText text={getTaskPromptLabel(task, worksheet.language)} />}
                                                </h3>
                                            </div>
                                            <div className="fraction-print-task-layout">
                                                <div className="fraction-print-figure flex min-w-0 items-center justify-center py-3">
                                                    {task.type === "shade_fraction" && !printMode ? (
                                                        <FractionShadeInput
                                                            numerator={task.fraction.numerator}
                                                            denominator={task.fraction.denominator}
                                                            visual={task.visual}
                                                            language={worksheet.language}
                                                            value={studentAnswer}
                                                            disabled={readOnly}
                                                            onChange={(value) => setAnswer(taskId, value)}
                                                        />
                                                    ) : (
                                                        <FractionVisual
                                                            fraction={task.fraction}
                                                            shadedParts={task.type === "shade_fraction" ? 0 : task.shadedParts}
                                                            visual={task.visual}
                                                            language={worksheet.language}
                                                        />
                                                    )}
                                                </div>
                                                <div className="fraction-print-answer flex min-w-0 flex-col items-center justify-center">
                                                    {task.type === "shade_fraction" ? null : task.type === "choose_fraction" && task.options?.length ? (
                                                        <div className="fraction-print-options grid w-full grid-cols-3 gap-2">
                                                            {task.options.map((option) => (
                                                                <button key={option} type="button" disabled={readOnly || printMode}
                                                                    aria-pressed={!printMode && normalizeAnswerText(studentAnswerText) === normalizeAnswerText(option)}
                                                                    onClick={() => setAnswer(taskId, option)}
                                                                    className={`flex min-h-20 min-w-0 items-center justify-center rounded-lg border px-2 py-3 focus-visible:outline-2 focus-visible:outline-teal-600 disabled:cursor-default ${!printMode && normalizeAnswerText(studentAnswerText) === normalizeAnswerText(option) ? "border-emerald-500 bg-emerald-50" : "border-slate-300 bg-white hover:bg-slate-50"}`}
                                                                >
                                                                    <FractionDisplay value={option} />
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : printMode ? (
                                                        <div className="fraction-blank inline-flex w-24 flex-col items-center" aria-label={answerLabel}>
                                                            <div className="h-10 w-16 rounded-lg border border-dashed border-slate-300" />
                                                            <div className="my-1.5 h-0.5 w-20 bg-slate-900" />
                                                            <div className="h-10 w-16 rounded-lg border border-dashed border-slate-300" />
                                                        </div>
                                                    ) : (
                                                        <FractionInput value={studentAnswerText} disabled={readOnly}
                                                            onChange={(value) => setAnswer(taskId, value)} label={answerLabel} language={worksheet.language}
                                                        />
                                                    )}
                                                    {feedback}
                                                </div>
                                            </div>
                                            {shouldShowHints && task.hint ? <div className="fraction-task-hint mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-slate-700"><strong>{copy.hint}:</strong> <MathText text={task.hint} /></div> : null}
                                        </article>
                                    );
                                })}
                            </div>
                            {shouldShowAnswerKey ? (
                                <section className="fraction-answer-key mt-8 border-t-2 border-slate-300 pt-6">
                                    <h3 className="mb-5 text-xl font-bold">{copy.answerKeyTitle}</h3>
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        {worksheet.tasks.map((task, idx) => (
                                            <div key={task.id || idx} className="flex items-center gap-4 border-b border-slate-200 pb-4">
                                                <span className="text-sm font-semibold">{copy.task} {idx + 1}</span>
                                                <FractionDisplay value={answerToString(task.answer)} size="md" />
                                                {task.type === "shade_fraction" ? <FractionVisual fraction={task.fraction} visual={task.visual} language={worksheet.language} /> : null}
                                            </div>
                                        ))}
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
