"use client";

import { DraftButton, SubmitButton } from "./AssignmentActionButtons";

type Props = {
    mainTitle: string;
    metaLine: string;

    showDraftButton: boolean;
    showSubmitButton: boolean;

    draftSaving: boolean;
    submitting: boolean;

    lock: boolean;

    uid: string | null;

    submitLabel: string;
    submitDisabled: boolean;

    isReadingTest: boolean;

    onSaveDraft: () => void;
    onSubmit: () => void;
};

export default function AssignmentPageHeader({
    mainTitle,
    metaLine,
    showDraftButton,
    showSubmitButton,
    draftSaving,
    submitting,
    lock,
    uid,
    submitLabel,
    submitDisabled,
    isReadingTest,
    onSaveDraft,
    onSubmit,
}: Props) {
    return (
        <header
            style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
            }}
        >
            <div>
                <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>
                    {mainTitle}
                </h1>

                {metaLine ? (
                    <div style={{ marginTop: 4, opacity: 0.75 }}>
                        {metaLine}
                    </div>
                ) : null}
            </div>

            <div
                style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                }}
            >
                <DraftButton
                    show={showDraftButton}
                    disabled={draftSaving || submitting || lock || !uid}
                    saving={draftSaving}
                    onClick={onSaveDraft}
                />

                {!isReadingTest ? (
                    <SubmitButton
                        show={showSubmitButton}
                        label={submitLabel}
                        disabled={submitDisabled}
                        onClick={onSubmit}
                    />
                ) : null}
            </div>
        </header>
    );
}