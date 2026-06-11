"use client";

import { softBlueButtonStyle } from "./assignmentStyles";

type Props = {
    tasksCount: number;

    hasTranslatedTasks: boolean;

    showTaskTranslations: boolean;

    t: (
        key: string,
        values?: Record<string, unknown>
    ) => string;

    onToggleTranslations: () => void;
};

export default function AssignmentTasksHeader({
    tasksCount,
    hasTranslatedTasks,
    showTaskTranslations,
    t,
    onToggleTranslations,
}: Props) {
    return (
        <div
            style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
            }}
        >
            <h2 style={{ margin: 0, fontSize: 18 }}>
                {t("tasks.title")}
            </h2>

            {tasksCount > 0 && hasTranslatedTasks ? (
            <div
                style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    alignItems: "center",
                }}
            >
                <button
                    type="button"
                    onClick={onToggleTranslations}
                    style={softBlueButtonStyle}
                >
                    {showTaskTranslations
                        ? t("translate.hide")
                        : t("translate.show")}
                </button>
            </div>
            ) : null}
        </div>
    );
}
