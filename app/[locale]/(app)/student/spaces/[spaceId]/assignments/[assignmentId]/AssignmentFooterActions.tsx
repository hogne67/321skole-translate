"use client";

import { Link } from "@/i18n/navigation";

import { DraftButton, SubmitButton } from "./AssignmentActionButtons";

type Props = {
    msg: string | null;

    showDraftButton: boolean;
    showSubmitButton: boolean;

    draftSaving: boolean;
    submitting: boolean;

    lock: boolean;

    uid: string | null;

    submitLabel: string;
    submitDisabled: boolean;

    isReadingTest: boolean;

    spaceId: string;

    t: (key: string, values?: Record<string, unknown>) => string;

    onSaveDraft: () => void;
    onSubmit: () => void;
};

export default function AssignmentFooterActions({
    msg,
    showDraftButton,
    showSubmitButton,
    draftSaving,
    submitting,
    lock,
    uid,
    submitLabel,
    submitDisabled,
    isReadingTest,
    spaceId,
    t,
    onSaveDraft,
    onSubmit,
}: Props) {
    return (
        <section style={{ marginTop: 18 }}>
            {msg ? (
                <div
                    style={{
                        marginBottom: 10,
                        padding: 10,
                        borderRadius: 12,
                        background: "rgba(0,0,0,0.04)",
                    }}
                >
                    {msg}
                </div>
            ) : null}

            <div
                style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
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

                <Link
                    href={`/student/spaces/${spaceId}`}
                    style={{ textDecoration: "none" }}
                >
                    {t("actions.backToSpace")}
                </Link>
            </div>
        </section>
    );
}