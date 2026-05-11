"use client";

import StatusToggle from "./StatusToggle";

type ReviewStatus = "reviewed" | "needs_work";

type Props = {
    text: string;
    setText: (value: string | ((prev: string) => string)) => void;

    status: ReviewStatus;
    setStatus: (value: ReviewStatus) => void;

    readingSummaryText: string;
    needsTextToChangeStatus: boolean;

    canOperate: boolean;
    canSave: boolean;
    saving: boolean;
    saveMsg: string | null;

    onSave: () => void;

    t: (key: string, values?: Record<string, unknown>) => string;
};

export default function TeacherFeedbackPanel({
    text,
    setText,
    status,
    setStatus,
    readingSummaryText,
    needsTextToChangeStatus,
    canOperate,
    canSave,
    saving,
    saveMsg,
    onSave,
    t,
}: Props) {
    return (
        <div className="box-border min-w-0 rounded-2xl border border-slate-300 bg-white p-4 shadow-md sm:p-5">
            <div className="text-base font-semibold text-slate-900">
                {t("feedback.title")}
            </div>

            {readingSummaryText ? (
                <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold leading-6 text-slate-800">
                    {readingSummaryText}
                </div>
            ) : null}

            <div className="mt-4">
                <StatusToggle
                    value={status}
                    onChange={setStatus}
                    disabled={!canOperate}
                    t={(k) => t(k)}
                />
            </div>

            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("feedback.placeholder")}
                rows={10}
                disabled={!canOperate}
                className="box-border mt-4 w-full min-w-0 max-w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 disabled:opacity-65"
            />

            {needsTextToChangeStatus && (
                <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                    {t("feedback.needTextToChangeStatus")}
                </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
                {readingSummaryText ? (
                    <button
                        type="button"
                        disabled={!canOperate}
                        onClick={() => {
                            setText((prev) => {
                                const p = prev.trim();
                                if (!p) return readingSummaryText;
                                if (p.includes(readingSummaryText)) return prev;
                                return `${readingSummaryText}\n\n${prev}`;
                            });
                        }}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
                    >
                        {t("feedback.insertTimingData")}
                    </button>
                ) : null}

                <button
                    disabled={!canSave}
                    onClick={onSave}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
                >
                    {saving ? t("feedback.saving") : t("feedback.saveButton")}
                </button>

                {saveMsg ? (
                    <div className="self-center text-sm text-slate-700">{saveMsg}</div>
                ) : null}
            </div>

            <div className="mt-3 text-xs text-slate-500">
                {t("feedback.rulesHint")} <code>status</code>{" "}
                <code>teacherFeedback</code>.
            </div>
        </div>
    );
}