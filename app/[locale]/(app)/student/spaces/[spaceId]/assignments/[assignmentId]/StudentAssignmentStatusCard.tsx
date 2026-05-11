"use client";

import GeometryAutoCheckSummary from "@/components/generators/math/geometry/GeometryAutoCheckSummary";
import type { GeometryAutoResult } from "@/lib/math/geometry/submissionTypes";

import type { AutoGrade, SubmissionStatus } from "./types";
import { AutoGradeBadge } from "./AssignmentUiAtoms";
import { statusTheme } from "./statusHelpers";
import { statusDesc } from "./submissionTextHelpers";
import TeacherFeedbackBox from "./TeacherFeedbackBox";

type TFn = (key: string, values?: Record<string, unknown>) => string;

type Props = {
    effectiveStatus: SubmissionStatus;
    liveAuto: AutoGrade | null;
    liveGeometryAuto: GeometryAutoResult | null;
    liveTeacherText: string | null;
    liveTeacherUpdatedAt: string | null;
    liveUpdatedAt: string | null;
    lock: boolean;
    isGeometryAssignment: boolean;
    showGeometryAutoTop: boolean;
    t: TFn;
    tGeometry: (key: string, values?: Record<string, unknown>) => string;
    translatedTeacherText: string | null;
    teacherFeedbackTargetLang: string;
    teacherFeedbackTranslating: boolean;
    teacherFeedbackTtsBusy: null | "teacherFeedback" | "teacherFeedbackTranslation";
    onTeacherFeedbackTargetLangChange: (value: string) => void;
    onTranslateTeacherFeedback: () => void;
    onPlayTeacherFeedback: () => void;
    onPlayTeacherFeedbackTranslation: () => void;
};

function getStatusNoticeStyle(status: SubmissionStatus) {
    if (status === "submitted") {
        return {
            background: "rgba(59,130,246,0.14)",
            border: "1px solid rgba(59,130,246,0.35)",
            color: "rgb(30,64,175)",
        };
    }

    if (status === "reviewed" || status === "approved") {
        return {
            background: "rgba(34,197,94,0.12)",
            border: "1px solid rgba(34,197,94,0.35)",
            color: "rgb(21,128,61)",
        };
    }

    if (status === "needs_work") {
        return {
            background: "rgba(245,158,11,0.14)",
            border: "1px solid rgba(245,158,11,0.38)",
            color: "rgb(146,64,14)",
        };
    }

    if (status === "draft") {
        return {
            background: "rgba(100,116,139,0.12)",
            border: "1px solid rgba(100,116,139,0.28)",
            color: "rgb(51,65,85)",
        };
    }

    return {
        background: "rgba(0,0,0,0.04)",
        border: "1px solid rgba(0,0,0,0.08)",
        color: "inherit",
    };
}

export default function StudentAssignmentStatusCard({
    effectiveStatus,
    liveAuto,
    liveGeometryAuto,
    liveTeacherText,
    liveTeacherUpdatedAt,
    liveUpdatedAt,
    lock,
    isGeometryAssignment,
    showGeometryAutoTop,
    t,
    tGeometry,
    translatedTeacherText,
    teacherFeedbackTargetLang,
    teacherFeedbackTranslating,
    teacherFeedbackTtsBusy,
    onTeacherFeedbackTargetLangChange,
    onTranslateTeacherFeedback,
    onPlayTeacherFeedback,
    onPlayTeacherFeedbackTranslation,
}: Props) {
    const theme = statusTheme(effectiveStatus);
    const noticeStyle = getStatusNoticeStyle(effectiveStatus);

    return (
        <section
            style={{
                marginTop: 16,
                border: `1px solid ${theme.border}`,
                background: theme.bg,
                borderRadius: 14,
                padding: 12,
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                }}
            >
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <strong>{t("status.title")}</strong>

                    {!isGeometryAssignment ? (
                        <AutoGradeBadge
                            auto={liveAuto}
                            labelAuto={t("autograde.label")}
                            labelDetails={(s) => t("autograde.details", { s })}
                        />
                    ) : null}
                </div>

            </div>

            <div
                style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    borderRadius: 12,
                    fontWeight: 800,
                    lineHeight: 1.45,
                    ...noticeStyle,
                }}
            >
                {statusDesc(effectiveStatus, t)}
            </div>

            {showGeometryAutoTop ? (
                <div style={{ marginTop: 12 }}>
                    <GeometryAutoCheckSummary auto={liveGeometryAuto} t={tGeometry} />
                </div>
            ) : null}

            {liveTeacherText ? (
                <TeacherFeedbackBox
                    text={liveTeacherText}
                    updatedAt={liveTeacherUpdatedAt}
                    translatedText={translatedTeacherText}
                    targetLang={teacherFeedbackTargetLang}
                    translating={teacherFeedbackTranslating}
                    ttsBusy={teacherFeedbackTtsBusy}
                    t={t}
                    onTargetLangChange={onTeacherFeedbackTargetLangChange}
                    onTranslate={onTranslateTeacherFeedback}
                    onPlayOriginal={onPlayTeacherFeedback}
                    onPlayTranslation={onPlayTeacherFeedbackTranslation}
                />
            ) : null}

            {liveUpdatedAt ? (
                <div style={{ marginTop: 10, opacity: 0.7 }}>
                    {t("submission.updatedAt", { at: liveUpdatedAt })}
                </div>
            ) : null}

            {lock ? (
                <div style={{ marginTop: 10, fontWeight: 800 }}>
                    {t("messages.lockedByTeacher")}
                </div>
            ) : null}
        </section>
    );
}