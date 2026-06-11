"use client";

import { useState } from "react";
import type { AnswersMap, AutoGrade, Task, TranslatedTask, TranslatingState } from "./types";
import {
    blueButtonActiveStyle,
    softBlueButtonStyle,
} from "./assignmentStyles";

type Props = {
    task: Task;
    language?: string;
    stableId: string;
    answers: AnswersMap;
    translatedTask?: TranslatedTask;
    showTranslation: boolean;
    autoGrade: AutoGrade | null;
    locked: boolean;
    translating: TranslatingState;
    ttsBusy: null | "original" | "translation";
    t: (key: string, values?: Record<string, unknown>) => string;
    getMcqSelectedIndex: (stableId: string, options: unknown[]) => number | null;
    isTrueSelected: (stableId: string, v: boolean) => boolean;
    onToggleTranslation: (stableId: string) => void;
    onAnswer: (taskId: string, value: unknown) => void;
    onTranslateTask: () => void;
    onPlayOriginal: (text: string) => void;
    onPlayTranslation: (text: string) => void;
};

function imageWritingLabels(language: unknown) {
    if (language === "en") {
        return {
            showSupport: "Show support words",
            hideSupport: "Hide support words",
            showCriteria: "Show success criteria",
            hideCriteria: "Hide success criteria",
        };
    }
    if (language === "pt") {
        return {
            showSupport: "Mostrar palavras de apoio",
            hideSupport: "Ocultar palavras de apoio",
            showCriteria: "Mostrar critérios de sucesso",
            hideCriteria: "Ocultar critérios de sucesso",
        };
    }
    return {
        showSupport: "Vis støtteord",
        hideSupport: "Skjul støtteord",
        showCriteria: "Vis suksesskriterier",
        hideCriteria: "Skjul suksesskriterier",
    };
}

export default function AssignmentTaskCard({
    task,
    language,
    stableId,
    answers,
    translatedTask,
    showTranslation,
    autoGrade,
    locked,
    translating,
    ttsBusy,
    t,
    getMcqSelectedIndex,
    isTrueSelected,
    onToggleTranslation,
    onAnswer,
    onTranslateTask,
    onPlayOriginal,
    onPlayTranslation,
}: Props) {
    const type = String(task?.type ?? "open").toLowerCase();
    const promptOrig = String(task?.prompt ?? "").trim();
    const promptTr = String(translatedTask?.translatedPrompt ?? "").trim();
    const options = Array.isArray(task.options) ? task.options : [];
    const supportWords = Array.isArray(task.supportWords)
        ? task.supportWords.map((word) => String(word).trim()).filter(Boolean)
        : [];
    const successCriteria = Array.isArray(task.successCriteria)
        ? task.successCriteria.map((item) => String(item).trim()).filter(Boolean)
        : [];
    const [showSupportWords, setShowSupportWords] = useState(false);
    const [showSuccessCriteria, setShowSuccessCriteria] = useState(false);
    const labels = imageWritingLabels(language);
    const isImageWritingTask =
        !!String(task.imageUrl ?? "").trim() ||
        !!String(task.imageDescription ?? "").trim() ||
        supportWords.length > 0 ||
        successCriteria.length > 0;

    const autoResult = autoGrade?.byTask?.[stableId] ?? null;

    const isAutoCorrect =
        autoResult && typeof autoResult.isCorrect === "boolean"
            ? autoResult.isCorrect
            : null;

    const showPromptTranslation =
        showTranslation &&
        promptTr.length > 0 &&
        promptTr !== promptOrig;
    const canTranslateTask = promptOrig.trim() || options.length > 0;

    const cardBorder =
        isAutoCorrect === true
            ? "2px solid rgba(34,197,94,0.65)"
            : isAutoCorrect === false
                ? "2px solid rgba(239,68,68,0.65)"
                : "1px solid rgba(0,0,0,0.10)";

    const cardBackground =
        isAutoCorrect === true
            ? "rgba(34,197,94,0.06)"
            : isAutoCorrect === false
                ? "rgba(239,68,68,0.05)"
                : "white";

    return (
        <div
            style={{
                border: cardBorder,
                borderRadius: 14,
                padding: 14,
                background: cardBackground,
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "flex-start",
                }}
            >
                <div style={{ fontWeight: 800, lineHeight: 1.45 }}>
                    {promptOrig || t("tasks.noPrompt")}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button
                        type="button"
                        onClick={() => onPlayOriginal(promptOrig)}
                        disabled={!promptOrig || ttsBusy != null}
                        style={{
                            ...softBlueButtonStyle,
                            background: "rgba(34,197,94,0.14)",
                            border: "1px solid rgba(34,197,94,0.40)",
                            color: "rgba(21,128,61,1)",
                            padding: "6px 10px",
                            opacity: !promptOrig || ttsBusy != null ? 0.65 : 1,
                        }}
                        title={t("tts.playOriginal")}
                        aria-label={t("tts.playOriginal")}
                    >
                        {ttsBusy === "original" ? "…" : "🔊"}
                    </button>

                    <button
                        type="button"
                        onClick={onTranslateTask}
                        disabled={!canTranslateTask || translating === `task:${stableId}`}
                        style={{
                            ...softBlueButtonStyle,
                            padding: "6px 10px",
                            opacity: !canTranslateTask || translating === `task:${stableId}` ? 0.65 : 1,
                        }}
                    >
                        {translating === `task:${stableId}` ? t("translate.working") : t("translate.text")}
                    </button>

                    {!!(translatedTask?.translatedPrompt || translatedTask?.translatedOptions?.length) && (
                    <button
                        type="button"
                        onClick={() => onToggleTranslation(stableId)}
                        style={{ ...softBlueButtonStyle, padding: "6px 10px" }}
                        title={t("translate.toggleTask")}
                    >
                        {showTranslation ? t("translate.hide") : t("translate.show")}
                    </button>
                    )}
                </div>
            </div>

            {isAutoCorrect === true ? (
                <div
                    style={{
                        marginTop: 8,
                        color: "rgb(22,101,52)",
                        fontWeight: 800,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                    }}
                >
                    <span style={{ fontSize: 18 }}>✅</span>
                    <span>Riktig</span>
                </div>
            ) : isAutoCorrect === false ? (
                <div
                    style={{
                        marginTop: 8,
                        color: "rgb(153,27,27)",
                        fontWeight: 800,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                    }}
                >
                    <span style={{ fontSize: 18 }}>❌</span>
                    <span>Ikke riktig</span>
                </div>
            ) : null}

            {showPromptTranslation ? (
                <div
                    style={{
                        marginTop: 8,
                        fontSize: 13,
                        lineHeight: 1.5,
                        color: "rgba(0,0,0,0.72)",
                        background: "rgba(59,130,246,0.08)",
                        border: "1px solid rgba(59,130,246,0.18)",
                        borderRadius: 10,
                        padding: "8px 10px",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: 8,
                            marginBottom: 6,
                        }}
                    >
                        <span style={{ opacity: 0.75 }}>{t("translate.translatedLabel")}</span>
                        <button
                            type="button"
                            onClick={() => onPlayTranslation(promptTr)}
                        disabled={!promptTr || ttsBusy != null}
                            style={{
                                ...softBlueButtonStyle,
                                background: "rgba(34,197,94,0.14)",
                                border: "1px solid rgba(34,197,94,0.40)",
                                color: "rgba(21,128,61,1)",
                                padding: "5px 9px",
                                opacity: !promptTr || ttsBusy != null ? 0.65 : 1,
                            }}
                            title={t("tts.playTranslation")}
                            aria-label={t("tts.playTranslation")}
                        >
                            {ttsBusy === "translation" ? "…" : "🔊"}
                        </button>
                    </div>
                    {promptTr}
                </div>
            ) : null}

            {supportWords.length > 0 ? (
                <div style={{ marginTop: 10 }}>
                    <button
                        type="button"
                        onClick={() => setShowSupportWords((value) => !value)}
                        style={{ ...softBlueButtonStyle, padding: "7px 10px" }}
                    >
                        {showSupportWords ? labels.hideSupport : `${labels.showSupport} (${supportWords.length})`}
                    </button>

                    {showSupportWords ? (
                        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {supportWords.map((word) => (
                                <span
                                    key={word}
                                    style={{
                                        border: "1px solid rgba(59,130,246,0.20)",
                                        borderRadius: 999,
                                        padding: "5px 9px",
                                        background: "rgba(59,130,246,0.07)",
                                        fontSize: 13,
                                        fontWeight: 700,
                                    }}
                                >
                                    {word}
                                </span>
                            ))}
                        </div>
                    ) : null}
                </div>
            ) : null}

            {successCriteria.length > 0 ? (
                <div style={{ marginTop: 10 }}>
                    <button
                        type="button"
                        onClick={() => setShowSuccessCriteria((value) => !value)}
                        style={{ ...softBlueButtonStyle, padding: "7px 10px" }}
                    >
                        {showSuccessCriteria ? labels.hideCriteria : `${labels.showCriteria} (${successCriteria.length})`}
                    </button>

                    {showSuccessCriteria ? (
                        <ul style={{ margin: "10px 0 0", paddingLeft: 20, color: "rgba(0,0,0,0.70)", lineHeight: 1.45 }}>
                            {successCriteria.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            ) : null}

            <div style={{ marginTop: 12 }}>
                {type === "mcq" && Array.isArray(task.options) ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {task.options.map((option, optionIndex) => {
                            const opts = task.options as unknown[];
                            const selectedIdx = getMcqSelectedIndex(stableId, opts);

                            const optOrig = String(option).trim();
                            const optTr = String(
                                translatedTask?.translatedOptions?.[optionIndex] ?? ""
                            ).trim();

                            const showOptionTranslation =
                                showTranslation &&
                                optTr.length > 0 &&
                                optTr !== optOrig;

                            const checked = selectedIdx === optionIndex;

                            const correctAnswer = autoResult?.correctAnswer;

                            const isCorrectOption =
                                correctAnswer === optionIndex ||
                                String(correctAnswer).trim() === optOrig;

                            const showCorrectMark =
                                isAutoCorrect === false && isCorrectOption;

                            const showWrongMark =
                                isAutoCorrect === false &&
                                checked &&
                                !isCorrectOption;

                            return (
                                <label
                                    key={`${stableId}_opt_${optionIndex}`}
                                    style={{
                                        display: "flex",
                                        gap: 10,
                                        alignItems: "center",
                                        border: checked
                                            ? "2px solid rgba(59,130,246,0.60)"
                                            : "1px solid rgba(59,130,246,0.18)",
                                        borderRadius: 12,
                                        padding: checked ? "9px 11px" : "10px 12px",
                                        cursor: locked ? "not-allowed" : "pointer",
                                        opacity: locked ? 0.7 : 1,
                                        background: checked
                                            ? "rgba(59,130,246,0.16)"
                                            : "rgba(59,130,246,0.06)",
                                        transition: "all 120ms ease",
                                    }}
                                >
                                    <input
                                        type="radio"
                                        name={`mcq_${stableId}`}
                                        checked={checked}
                                        disabled={locked}
                                        onChange={() => onAnswer(stableId, optionIndex)}
                                        style={{ transform: "scale(1.05)" }}
                                    />

                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            width: "100%",
                                            gap: 10,
                                        }}
                                    >
                                        <span style={{ fontWeight: checked ? 800 : 600, flex: 1 }}>
                                            <span>{optOrig}</span>

                                            {showOptionTranslation ? (
                                                <span
                                                    style={{
                                                        display: "block",
                                                        marginTop: 4,
                                                        fontSize: 13,
                                                        fontWeight: 500,
                                                        color: "rgba(0,0,0,0.65)",
                                                        lineHeight: 1.4,
                                                    }}
                                                >
                                                    {optTr}
                                                </span>
                                            ) : null}
                                        </span>

                                        {showCorrectMark ? (
                                            <span
                                                style={{
                                                    color: "rgb(22,101,52)",
                                                    fontWeight: 900,
                                                    fontSize: 18,
                                                }}
                                            >
                                                ✅
                                            </span>
                                        ) : null}

                                        {showWrongMark ? (
                                            <span
                                                style={{
                                                    color: "rgb(153,27,27)",
                                                    fontWeight: 900,
                                                    fontSize: 18,
                                                }}
                                            >
                                                ❌
                                            </span>
                                        ) : null}
                                    </div>
                                </label>
                            );
                        })}
                    </div>
                ) : type === "truefalse" ? (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                            type="button"
                            disabled={locked}
                            onClick={() => onAnswer(stableId, true)}
                            style={{
                                ...(isTrueSelected(stableId, true)
                                    ? blueButtonActiveStyle
                                    : softBlueButtonStyle),
                                opacity: locked ? 0.7 : 1,
                                fontWeight: isTrueSelected(stableId, true) ? 900 : 700,
                            }}
                        >
                            {t("tasks.true")}
                        </button>

                        <button
                            type="button"
                            disabled={locked}
                            onClick={() => onAnswer(stableId, false)}
                            style={{
                                ...(isTrueSelected(stableId, false)
                                    ? blueButtonActiveStyle
                                    : softBlueButtonStyle),
                                opacity: locked ? 0.7 : 1,
                                fontWeight: isTrueSelected(stableId, false) ? 900 : 700,
                            }}
                        >
                            {t("tasks.false")}
                        </button>
                    </div>
                ) : (
                    <textarea
                        value={String(answers[stableId] ?? "")}
                        disabled={locked}
                        onChange={(e) => onAnswer(stableId, e.target.value)}
                        rows={isImageWritingTask ? 9 : 4}
                        style={{
                            width: "100%",
                            border: "1px solid rgba(59,130,246,0.18)",
                            borderRadius: 10,
                            padding: 10,
                            outline: "none",
                            opacity: locked ? 0.7 : 1,
                            background: "rgba(59,130,246,0.04)",
                            minHeight: isImageWritingTask ? 190 : undefined,
                        }}
                        placeholder={t("tasks.writeAnswer")}
                    />
                )}
            </div>
        </div>
    );
}
