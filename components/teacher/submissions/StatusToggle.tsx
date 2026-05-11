"use client";

import StatusPill from "./StatusPill";

type ReviewStatus = "reviewed" | "needs_work";

export default function StatusToggle({
    value,
    onChange,
    disabled,
    t,
}: {
    value: ReviewStatus;
    onChange: (v: ReviewStatus) => void;
    disabled?: boolean;
    t: (k: string) => string;
}) {
    const checked = value === "reviewed";

    return (
        <label
            style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                userSelect: "none",
                flexWrap: "wrap",
            }}
        >
            <span style={{ fontSize: 13, opacity: 0.85 }}>
                {t("feedback.statusLabel")}
            </span>

            <button
                type="button"
                onClick={() => onChange(checked ? "needs_work" : "reviewed")}
                disabled={disabled}
                aria-pressed={checked}
                style={{
                    position: "relative",
                    width: 56,
                    height: 32,
                    borderRadius: 999,
                    border: "1px solid rgba(0,0,0,0.18)",
                    background: checked
                        ? "rgba(16,185,129,0.25)"
                        : "rgba(245,158,11,0.25)",
                    opacity: disabled ? 0.6 : 1,
                    cursor: disabled ? "not-allowed" : "pointer",
                    flex: "0 0 auto",
                }}
            >
                <span
                    style={{
                        position: "absolute",
                        top: 3,
                        left: checked ? 28 : 3,
                        width: 26,
                        height: 26,
                        borderRadius: 999,
                        background: "white",
                        border: "1px solid rgba(0,0,0,0.15)",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.10)",
                        transition: "left 120ms ease",
                    }}
                />
            </button>

            <StatusPill status={value} t={t} />
        </label>
    );
}