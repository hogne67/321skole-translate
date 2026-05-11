"use client";

type Props = {
    aiText: string;
    setAiText: (v: string) => void;

    aiGenerating: boolean;
    aiSaving: boolean;

    aiMsg: string | null;

    canOperate: boolean;
    canGenerateAi: boolean;

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
    onGenerate,
    onSave,
    onCopy,
    onInsert,
    t,
}: Props) {
    return (
        <div className="box-border min-w-0 rounded-2xl border border-slate-300 bg-white p-4 shadow-md sm:p-5">
            <div className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-base font-semibold text-slate-900">
                        {t("ai.title")}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            disabled={!canGenerateAi}
                            onClick={onGenerate}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
                        >
                            {aiGenerating
                                ? t("ai.generating")
                                : t("ai.generateButton")}
                        </button>

                        <button
                            disabled={!canOperate || !aiText.trim() || aiSaving}
                            onClick={onSave}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
                        >
                            {aiSaving
                                ? t("ai.saving")
                                : t("ai.saveButton")}
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
                    <div className="text-sm font-semibold text-slate-700">
                        {aiMsg}
                    </div>
                )}

                <div className="text-xs text-slate-500">
                    {t("ai.rulesHint")} <code>aiFeedback</code>.
                </div>
            </div>
        </div>
    );
}