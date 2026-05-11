"use client";

import { Link } from "@/i18n/navigation";
import { Badge } from "./AssignmentUiAtoms";
import {
    primarySubmitStyle,
    primarySubmitStyleDisabled,
} from "./assignmentStyles";

type Props = {
    spaceId: string | undefined;
    submitting: boolean;
    uid: string | null;
    readingTestTotalSeconds: number | null;
    formatSeconds: (seconds: number) => string;
    t: (key: string, values?: Record<string, unknown>) => string;
    onStart: () => void;
};

export default function ReadingTestStartCard({
    spaceId,
    submitting,
    uid,
    readingTestTotalSeconds,
    formatSeconds,
    t,
    onStart,
}: Props) {
    return (
        <div
            style={{
                border: "1px solid rgba(0,0,0,0.10)",
                borderRadius: 16,
                background: "white",
                padding: 18,
                display: "grid",
                gap: 12,
            }}
        >
            <div style={{ fontSize: 18, fontWeight: 900 }}>Lesetest</div>

            <div style={{ lineHeight: 1.6, opacity: 0.85 }}>
                Teksten blir synlig når du starter testen. Når tiden er ute, blir svaret
                sendt automatisk til læreren.
            </div>

            {readingTestTotalSeconds != null ? (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <Badge text={`Tid: ${formatSeconds(readingTestTotalSeconds)}`} kind="neutral" />
                    <Badge text="Tekst vises etter start" kind="neutral" />
                </div>
            ) : (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <Badge text="Ingen tidtaker" kind="neutral" />
                    <Badge text="Tekst vises etter start" kind="neutral" />
                </div>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                    type="button"
                    onClick={onStart}
                    disabled={submitting || !uid}
                    style={submitting || !uid ? primarySubmitStyleDisabled : primarySubmitStyle}
                >
                    Start test
                </button>

                <Link href={`/student/spaces/${spaceId}`} style={{ textDecoration: "none", alignSelf: "center" }}>
                    {t("actions.backToSpace")}
                </Link>
            </div>
        </div>
    );
}