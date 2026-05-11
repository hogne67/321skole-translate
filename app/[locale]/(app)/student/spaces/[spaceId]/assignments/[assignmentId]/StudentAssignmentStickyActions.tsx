"use client";

type TFn = (key: string, values?: Record<string, unknown>) => string;

type Props = {
    showDraftButton: boolean;
    showSubmitButton: boolean;
    draftSaving: boolean;
    submitting: boolean;
    lock: boolean;
    uid: string | null;
    submitLabel: string;
    submitDisabled: boolean;
    isReadingTest: boolean;
    t: TFn;
    onSaveDraft: () => void;
    onSubmit: () => void;
};

export default function StudentAssignmentStickyActions({
    showDraftButton,
    showSubmitButton,
    draftSaving,
    submitting,
    lock,
    uid,
    submitLabel,
    submitDisabled,
    isReadingTest,
    t,
    onSaveDraft,
    onSubmit,
}: Props) {
    if ((!showDraftButton && !showSubmitButton) || lock || !uid) return null;

    return (
        <div
            style={{
                position: "fixed",
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 50,
                padding: "10px 10px calc(10px + env(safe-area-inset-bottom))",
                background: "rgba(255,255,255,0.94)",
                borderTop: "1px solid rgba(0,0,0,0.10)",
                boxShadow: "0 -10px 30px rgba(15,23,42,0.10)",
                backdropFilter: "blur(12px)",
            }}
        >
            <div
                style={{
                    width: "100%",
                    maxWidth: 980,
                    margin: "0 auto",
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                }}
            >
                {showDraftButton ? (
                    <button
                        type="button"
                        disabled={draftSaving || submitting || lock || !uid}
                        onClick={onSaveDraft}
                        style={{
                            flex: "0 0 auto",
                            border: "1px solid rgba(59,130,246,0.22)",
                            background: "rgba(59,130,246,0.08)",
                            color: "rgb(30,64,175)",
                            borderRadius: 12,
                            padding: "11px 13px",
                            fontWeight: 800,
                            opacity: draftSaving || submitting || lock || !uid ? 0.6 : 1,
                            cursor: draftSaving || submitting || lock || !uid ? "not-allowed" : "pointer",
                        }}
                    >
                        {draftSaving ? t("actions.saving") : t("actions.saveDraft")}
                    </button>
                ) : null}

                {showSubmitButton && !isReadingTest ? (
                    <button
                        type="button"
                        disabled={submitDisabled}
                        onClick={onSubmit}
                        style={{
                            flex: 1,
                            border: "1px solid rgba(22,163,74,0.35)",
                            background: "rgb(22,163,74)",
                            color: "white",
                            borderRadius: 12,
                            padding: "12px 14px",
                            fontWeight: 900,
                            fontSize: 16,
                            opacity: submitDisabled ? 0.6 : 1,
                            cursor: submitDisabled ? "not-allowed" : "pointer",
                        }}
                    >
                        {submitting ? t("actions.saving") : submitLabel}
                    </button>
                ) : null}
            </div>
        </div>
    );
}