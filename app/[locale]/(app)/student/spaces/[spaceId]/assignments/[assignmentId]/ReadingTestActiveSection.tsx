"use client";

import { Link } from "@/i18n/navigation";
import ReadingTestPlayer, {
    type ReadingLessonTask,
    type ReadingTestConfig,
} from "@/components/student/ReadingTestPlayer";

import type { AnswersMap } from "./types";
import ReadingTestTimerCard from "./ReadingTestTimerCard";
import { SubmitButton } from "./AssignmentActionButtons";

type Props = {
    spaceId: string | undefined;
    mainTitle: string;
    sourceTextSafe: string;
    tasks: ReadingLessonTask[];
    readingPlayerConfig: ReadingTestConfig | null;
    answers: AnswersMap;
    lock: boolean;
    submitted: boolean;
    readingTestFinished: boolean;

    readingTestStarted: boolean;
    readingTestRuntimeActive: boolean;
    readingTestSecondsLeft: number | null;
    readingProgressPercent: number;
    readingTimerIsRed: boolean;

    showSubmitButton: boolean;
    submitLabel: string;
    submitDisabled: boolean;

    t: (key: string, values?: Record<string, unknown>) => string;
    formatSeconds: (seconds: number) => string;

    onAnswersChange: (answers: AnswersMap) => void;
    onSubmit: () => void;
};

export default function ReadingTestActiveSection({
    spaceId,
    mainTitle,
    sourceTextSafe,
    tasks,
    readingPlayerConfig,
    answers,
    lock,
    submitted,
    readingTestFinished,
    readingTestStarted,
    readingTestRuntimeActive,
    readingTestSecondsLeft,
    readingProgressPercent,
    readingTimerIsRed,
    showSubmitButton,
    submitLabel,
    submitDisabled,
    t,
    formatSeconds,
    onAnswersChange,
    onSubmit,
}: Props) {
    return (
        <>
            {readingTestStarted && !readingTestFinished ? (
                <ReadingTestTimerCard
                    runtimeActive={readingTestRuntimeActive}
                    secondsLeft={readingTestSecondsLeft}
                    progressPercent={readingProgressPercent}
                    isRed={readingTimerIsRed}
                    formatSeconds={formatSeconds}
                />
            ) : null}

            <ReadingTestPlayer
                title={mainTitle}
                sourceText={sourceTextSafe}
                tasks={tasks}
                readingTestConfig={readingPlayerConfig}
                initialAnswers={answers}
                onAnswersChange={onAnswersChange}
                disabled={lock || submitted || readingTestFinished}
            />

            <div
                style={{
                    marginTop: 12,
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                }}
            >
                {!readingTestFinished ? (
                    <SubmitButton
                        show={showSubmitButton}
                        label={submitLabel}
                        disabled={submitDisabled}
                        onClick={onSubmit}
                    />
                ) : null}

                <Link href={`/student/spaces/${spaceId}`} style={{ textDecoration: "none" }}>
                    {t("actions.backToSpace")}
                </Link>
            </div>
        </>
    );
}