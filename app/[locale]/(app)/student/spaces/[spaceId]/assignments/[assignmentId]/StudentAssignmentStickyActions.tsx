"use client";

type TFn = (key: string, values?: Record<string, unknown>) => string;

type Props = {
    showSubmitButton: boolean;
    submitting: boolean;
    lock: boolean;
    uid: string | null;
    submitLabel: string;
    submitDisabled: boolean;
    isReadingTest: boolean;
    t: TFn;
    onSubmit: () => void;
};

export default function StudentAssignmentStickyActions({
    showSubmitButton,
    submitting,
    lock,
    uid,
    submitLabel,
    submitDisabled,
    isReadingTest,
    t,
    onSubmit,
}: Props) {
    if (!showSubmitButton || isReadingTest || lock || !uid) return null;

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
            </div>
        </div>
    );
}
