"use client";

import {
    btnStyle,
    primarySubmitStyle,
    primarySubmitStyleDisabled,
} from "./assignmentStyles";

export function SubmitButton({
    show,
    label,
    disabled,
    fullWidth,
    onClick,
}: {
    show: boolean;
    label: string;
    disabled: boolean;
    fullWidth?: boolean;
    onClick: () => void;
}) {
    if (!show) return null;

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            style={{
                ...(disabled ? primarySubmitStyleDisabled : primarySubmitStyle),
                width: fullWidth ? "100%" : undefined,
            }}
        >
            {label}
        </button>
    );
}

export function DraftButton({
    show,
    disabled,
    saving,
    onClick,
}: {
    show: boolean;
    disabled: boolean;
    saving: boolean;
    onClick: () => void;
}) {
    if (!show) return null;

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            style={{
                ...btnStyle,
                background: disabled ? "rgba(255,255,255,0.85)" : "white",
                fontWeight: 900,
            }}
            title="Lagrer uten å sende til lærer"
        >
            {saving ? "Lagrer kladd..." : "Lagre kladd"}
        </button>
    );
}