"use client";

import { useEffect, useState } from "react";

type Props = {
    aiText: string;
    setAiText: (v: string) => void;

    aiGenerating: boolean;
    aiSaving: boolean;

    aiMsg: string | null;

    canOperate: boolean;
    canGenerateAi: boolean;

    aiFeedbackUsed: number;
    aiFeedbackLimit: number;
    aiFeedbackRemaining: number;
    usageLoading: boolean;

    onGenerate: () => void;
    onSave: () => void;
    onCopy: () => void;
    onInsert: () => void;

    t: (k: string, values?: Record<string, unknown>) => string;
};

export default function AiFeedbackPanel({
    aiText,
    setAiText,
    aiGenerating,
    aiSaving,
    aiMsg,
    canOperate,
    canGenerateAi,
    aiFeedbackUsed,
    aiFeedbackLimit,
    aiFeedbackRemaining,
    usageLoading,
    onGenerate,
    onSave,
    onCopy,
    onInsert,
    t,
}: Props) {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (aiText.trim()) setOpen(true);
    }, [aiText]);

    return (
        <div className="box-border min-w-0 rounded-2xl border border-slate-300 bg-white shadow-md">
            <div className="flex min-w-0 flex-col gap-3">
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="flex w-full min-w-0 items-start justify-between gap-3 rounded-2xl px-4 py-4 text-left hover:bg-slate-50 sm:px-5"
                    aria-expanded={open}
                >
                    <div className="min-w-0">
                        <div className="text-base font-semibold text-slate-900">
                            {t("ai.title")}
                        </div>

                        <div className="mt-1 text-xs text-slate-500">
                            {usageLoading
                                ? "Laster AI-kvote…"
                                : `AI feedback: ${aiFeedbackUsed} / ${aiFeedbackLimit} brukt · ${aiFeedbackRemaining} igjen`}
                        </div>
                    </div>

                    <span className="shrink-0 rounded-full border border-slate-300 bg-white px-2 py-1 text-xs font-black text-slate-700">
                        {open ? "−" : "+"}
                    </span>
                </button>

                {open ? (
                    <div className="grid gap-3 border-t border-slate-200 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
                    <div className="flex flex-wrap gap-2">
                        <button
                            disabled={!canGenerateAi}
                            onClick={onGenerate}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
                        >
                            {aiGenerating ? t("ai.generating") : t("ai.generateButton")}
                        </button>

                        <button
                            disabled={!canOperate || !aiText.trim() || aiSaving}
                            onClick={onSave}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
                        >
                            {aiSaving ? t("ai.saving") : t("ai.saveButton")}
                        </button>

                        <button
                            disabled={!canOperate || !aiText.trim()}
                            onClick={onCopy}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
                        >
                            {t("ai.copyButton")}
                        </button>

                        <button
                            disabled={!canOperate || !aiText.trim()}
                            onClick={onInsert}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
                        >
                            {t("ai.insertButton")}
                        </button>
                    </div>

                <textarea
                    value={aiText}
                    onChange={(e) => setAiText(e.target.value)}
                    placeholder={t("ai.placeholder")}
                    rows={9}
                    disabled={!canOperate}
                    className="box-border w-full min-w-0 max-w-full resize-y rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-900 disabled:opacity-65"
                />

                {aiMsg && (
                    <div className="text-sm font-semibold text-slate-700">{aiMsg}</div>
                )}

                <div className="text-xs text-slate-500">
                    {t("ai.rulesHint")} <code>aiFeedback</code>.
                </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
